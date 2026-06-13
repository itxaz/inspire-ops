import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { withTenant } from '../db.js';
import { authenticate, requireRole, tenantContext } from '../auth/context.js';
import { parse, z } from '../http.js';
import { parseCsv, suggestMapping, normalizeRows, type FieldMap, type NormalizedLine } from '../domain/parse.js';
import { maybeParseWithClaude } from '../domain/parse-ai.js';
import { reconcile } from '../domain/reconcile.js';
import { round2 } from '../domain/commission.js';

const fieldMapSchema = z.object({
  policyNumber: z.string().optional(),
  premiumAmount: z.string().optional(),
  commissionAmount: z.string().optional(),
  commissionPct: z.string().optional(),
  isRenewal: z.string().optional(),
  renewalValue: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Preview: parse + normalize without writing anything. Powers the review UI.
// ---------------------------------------------------------------------------
const previewSchema = z.object({
  csvText: z.string().min(1),
  fieldMap: fieldMapSchema.optional(),
});

const importSchema = z.object({
  carrierId: z.string().uuid(),
  fileName: z.string().min(1),
  csvText: z.string().min(1),
  fieldMap: fieldMapSchema,
  statementDate: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  autoReconcile: z.boolean().default(true),
  saveMappingName: z.string().optional(),
});

export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.post('/imports/preview', async (req, reply) => {
    const body = parse(previewSchema, req.body, reply);
    if (!body) return;
    const { headers, rows } = parseCsv(body.csvText);
    const fieldMap = body.fieldMap ?? suggestMapping(headers);
    const result = normalizeRows(rows, fieldMap);
    return {
      headers,
      suggestedMapping: fieldMap,
      sample: result.items.slice(0, 25),
      stats: { total: result.total, valid: result.valid, flagged: result.flagged, confidence: result.confidence },
    };
  });

  // -------------------------------------------------------------------------
  // Commit: persist a statement + line items, auto-match policies, reconcile.
  // -------------------------------------------------------------------------
  app.post('/imports', { preHandler: requireRole('agency_admin', 'agency_staff') }, async (req, reply) => {
    const body = parse(importSchema, req.body, reply);
    if (!body) return;

    const { rows: csvRows } = parseCsv(body.csvText);
    const normBase = normalizeRows(csvRows, body.fieldMap as FieldMap);
    // If confidence is below threshold and ANTHROPIC_API_KEY is set, use Claude.
    const { items: finalItems, usedAi, aiTokens } = await maybeParseWithClaude(
      normBase.items, normBase.confidence, body.csvText,
    );
    const norm = usedAi
      ? { ...normBase, items: finalItems, total: finalItems.length,
          flagged: finalItems.filter(i => i.flagged).length,
          valid: finalItems.filter(i => !i.flagged).length }
      : normBase;

    return withTenant(tenantContext(req), async (c) => {
      // 1. Upload record (raw bytes would live in object storage; inline for now).
      const upload = await c.query<{ id: string }>(
        `INSERT INTO uploads (agency_id, carrier_id, uploaded_by, storage_key, file_name, mime_type, byte_size, status)
         VALUES (app.current_agency(), $1, $2, $3, $4, 'text/csv', $5, 'parsed')
         RETURNING id`,
        [body.carrierId, req.auth!.sub, `inline:${body.fileName}`, body.fileName, Buffer.byteLength(body.csvText)],
      );
      const uploadId = upload.rows[0]!.id;

      // 2. Optionally remember the mapping for next time.
      let mappingProfileId: string | null = null;
      if (body.saveMappingName) {
        const mp = await c.query<{ id: string }>(
          `INSERT INTO mapping_profiles (carrier_id, agency_id, name, format, field_map)
           VALUES ($1, app.current_agency(), $2, 'csv', $3) RETURNING id`,
          [body.carrierId, body.saveMappingName, JSON.stringify(body.fieldMap)],
        );
        mappingProfileId = mp.rows[0]!.id;
      }

      // 3. Carrier statement header.
      const totalAmount = round2(
        norm.items.reduce((sum, i) => sum + (i.commissionAmount ?? 0), 0),
      );
      const statement = await c.query<{ id: string }>(
        `INSERT INTO carrier_statements (agency_id, carrier_id, statement_date, period_start, period_end, total_amount)
         VALUES (app.current_agency(), $1, $2, $3, $4, $5) RETURNING id`,
        [body.carrierId, body.statementDate ?? null, body.periodStart ?? null, body.periodEnd ?? null, totalAmount],
      );
      const statementId = statement.rows[0]!.id;

      // 4. Import batch (audit/provenance for this parse run).
      const batch = await c.query<{ id: string }>(
        `INSERT INTO import_batches
           (agency_id, upload_id, mapping_profile_id, parser, confidence, rows_total, rows_flagged, status)
         VALUES (app.current_agency(), $1, $2, 'csv', $3, $4, $5, 'imported') RETURNING id`,
        [uploadId, mappingProfileId, norm.confidence, norm.total, norm.flagged],
      );
      const batchId = batch.rows[0]!.id;
      await c.query(
        `UPDATE carrier_statements SET import_batch_id = $1 WHERE id = $2`,
        [batchId, statementId],
      );

      // 5. Persist line items + auto-match + reconcile.
      const outcome = await ingestLines(c, statementId, body.carrierId, norm.items, body.autoReconcile);

      // 6. Mark the upload imported.
      await c.query(`UPDATE uploads SET status = 'imported' WHERE id = $1`, [uploadId]);

      return reply.code(201).send({
        batchId, statementId, uploadId, mappingProfileId,
        totalAmount,
        rowsTotal: norm.total,
        rowsFlagged: norm.flagged,
        confidence: norm.confidence,
        usedAi,
        aiTokens: aiTokens ?? null,
        ...outcome,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Review: list batches and inspect a single batch's line items.
  // -------------------------------------------------------------------------
  app.get('/imports', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT b.id, b.parser, b.confidence, b.rows_total, b.rows_flagged, b.status, b.created_at,
                u.file_name, cs.id AS statement_id, cs.total_amount, c.name AS carrier_name
         FROM import_batches b
         JOIN uploads u ON u.id = b.upload_id
         LEFT JOIN carrier_statements cs ON cs.import_batch_id = b.id
         LEFT JOIN carriers c ON c.id = cs.carrier_id
         ORDER BY b.created_at DESC LIMIT 200`,
      );
      return { batches: rows };
    }),
  );

  app.get('/imports/:id', async (req, reply) => {
    const params = parse(z.object({ id: z.string().uuid() }), req.params, reply);
    if (!params) return;
    return withTenant(tenantContext(req), async (c) => {
      const batch = await c.query(
        `SELECT b.id, b.parser, b.confidence, b.rows_total, b.rows_flagged, b.status, b.created_at,
                u.file_name, cs.id AS statement_id, cs.total_amount, cs.statement_date,
                c.name AS carrier_name
         FROM import_batches b
         JOIN uploads u ON u.id = b.upload_id
         LEFT JOIN carrier_statements cs ON cs.import_batch_id = b.id
         LEFT JOIN carriers c ON c.id = cs.carrier_id
         WHERE b.id = $1`,
        [params.id],
      );
      if (!batch.rowCount) return reply.code(404).send({ error: 'batch_not_found' });
      const stmtId = batch.rows[0]!.statement_id;
      const lines = stmtId
        ? await c.query(
            `SELECT li.id, li.policy_id, li.policy_number_raw, li.premium_amount,
                    li.commission_amount, li.commission_pct, li.is_renewal,
                    p.policy_number AS matched_policy_number
             FROM statement_line_items li
             LEFT JOIN policies p ON p.id = li.policy_id
             WHERE li.statement_id = $1
             ORDER BY li.policy_number_raw NULLS LAST`,
            [stmtId],
          )
        : { rows: [] };
      return { batch: batch.rows[0], lineItems: lines.rows };
    });
  });
}

// ---------------------------------------------------------------------------
// Shared ingest helper: insert line items, match to policies/ledger, reconcile.
// ---------------------------------------------------------------------------
interface IngestOutcome {
  rowsInserted: number;
  matched: number;
  reconciled: number;
  exceptionsCreated: number;
}

async function ingestLines(
  c: PoolClient,
  statementId: string,
  carrierId: string,
  items: NormalizedLine[],
  autoReconcile: boolean,
): Promise<IngestOutcome> {
  let matched = 0, reconciled = 0, exceptionsCreated = 0;

  for (const item of items) {
    // Match the raw policy number against this agency's policies for the carrier.
    let policyId: string | null = null;
    if (item.policyNumberRaw) {
      const m = await c.query<{ id: string }>(
        `SELECT id FROM policies WHERE carrier_id = $1 AND policy_number = $2 LIMIT 1`,
        [carrierId, item.policyNumberRaw],
      );
      policyId = m.rows[0]?.id ?? null;
      if (policyId) matched++;
    }

    const li = await c.query<{ id: string }>(
      `INSERT INTO statement_line_items
         (agency_id, statement_id, policy_id, policy_number_raw, premium_amount,
          commission_amount, commission_pct, is_renewal, raw)
       VALUES (app.current_agency(), $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        statementId, policyId, item.policyNumberRaw, item.premiumAmount,
        item.commissionAmount ?? 0, item.commissionPct, item.isRenewal,
        JSON.stringify(item.raw),
      ],
    );
    const lineItemId = li.rows[0]!.id;

    if (!autoReconcile) continue;

    // A carrier line referencing a policy we don't have on file: flag it.
    if (item.policyNumberRaw && !policyId) {
      await c.query(
        `INSERT INTO reconciliation_exceptions
           (agency_id, ledger_id, line_item_id, kind, expected, actual, delta)
         VALUES (app.current_agency(), NULL, $1, 'unmatched', NULL, $2, $2)`,
        [lineItemId, item.commissionAmount ?? 0],
      );
      exceptionsCreated++;
      continue;
    }
    if (!policyId) continue; // no policy number at all → batch-flagged only

    // Find an open expectation for this policy.
    const led = await c.query<{ id: string; expected_amount: string; premium_basis: string | null }>(
      `SELECT id, expected_amount, premium_basis FROM commission_ledger
       WHERE policy_id = $1 AND status <> 'paid' ORDER BY created_at LIMIT 1`,
      [policyId],
    );
    const ledger = led.rows[0];

    if (!ledger) {
      // Payment received with no recorded expectation.
      await c.query(
        `INSERT INTO reconciliation_exceptions
           (agency_id, ledger_id, line_item_id, kind, expected, actual, delta)
         VALUES (app.current_agency(), NULL, $1, 'missing', 0, $2, $2)`,
        [lineItemId, item.commissionAmount ?? 0],
      );
      exceptionsCreated++;
      continue;
    }

    const expectedAmount = Number(ledger.expected_amount);
    const premiumBasis = ledger.premium_basis != null ? Number(ledger.premium_basis) : null;
    const appliedPct = premiumBasis ? round2(expectedAmount / premiumBasis * 10000) / 10000 : null;

    const result = reconcile(
      { expectedAmount, appliedPct },
      { commissionAmount: item.commissionAmount ?? 0, commissionPct: item.commissionPct },
    );

    await c.query(
      `UPDATE commission_ledger
       SET paid_amount = $2, status = $3, matched_line_item_id = $4
       WHERE id = $1`,
      [ledger.id, result.paidAmount, result.status, lineItemId],
    );
    reconciled++;

    for (const e of result.exceptions) {
      await c.query(
        `INSERT INTO reconciliation_exceptions
           (agency_id, ledger_id, line_item_id, kind, expected, actual, delta)
         VALUES (app.current_agency(), $1, $2, $3, $4, $5, $6)`,
        [ledger.id, lineItemId, e.kind, e.expected, e.actual, e.delta],
      );
      exceptionsCreated++;
    }
  }

  return { rowsInserted: items.length, matched, reconciled, exceptionsCreated };
}
