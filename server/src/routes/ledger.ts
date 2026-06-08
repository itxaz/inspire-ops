import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';
import { authenticate, requireRole, tenantContext } from '../auth/context.js';
import { parse, z } from '../http.js';
import { reconcile } from '../domain/reconcile.js';

export async function ledgerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // Commission ledger (agents are RLS-restricted to their own rows automatically).
  app.get('/ledger', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT l.id, l.policy_id, l.agent_id, l.carrier_id, l.premium_basis,
                l.expected_amount, l.paid_amount, l.agent_advance_amount, l.status, l.expected_date,
                p.policy_number
         FROM commission_ledger l
         JOIN policies p ON p.id = l.policy_id
         ORDER BY l.created_at DESC LIMIT 500`,
      );
      return { ledger: rows };
    }),
  );

  // Dashboard: real-time owed-vs-paid and outstanding agent advances.
  app.get('/dashboard/summary', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT
           COALESCE(SUM(expected_amount),0)               AS total_expected,
           COALESCE(SUM(paid_amount),0)                   AS total_paid,
           COALESCE(SUM(expected_amount - paid_amount),0) AS total_owed,
           COALESCE(SUM(agent_advance_amount),0)          AS total_advanced,
           COALESCE(SUM(CASE WHEN status <> 'paid' THEN agent_advance_amount - paid_amount ELSE 0 END),0)
                                                          AS exposure
         FROM commission_ledger`,
      );
      const exc = await c.query(
        `SELECT kind, COUNT(*)::int AS count FROM reconciliation_exceptions
         WHERE status = 'open' GROUP BY kind`,
      );
      return { totals: rows[0], openExceptions: exc.rows };
    }),
  );

  // Open reconciliation exceptions.
  app.get('/exceptions', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT id, ledger_id, line_item_id, kind, expected, actual, delta, status, note, created_at
         FROM reconciliation_exceptions WHERE status = 'open' ORDER BY created_at DESC`,
      );
      return { exceptions: rows };
    }),
  );

  // Phase 2: reconcile a parsed statement line against a ledger row.
  const reconcileSchema = z.object({
    ledgerId: z.string().uuid(),
    lineItemId: z.string().uuid().optional(),
    commissionAmount: z.number(),
    commissionPct: z.number().min(0).max(1).optional(),
    appliedPct: z.number().min(0).max(1).optional(),
  });

  app.post('/reconcile', { preHandler: requireRole('agency_admin', 'agency_staff') }, async (req, reply) => {
    const body = parse(reconcileSchema, req.body, reply);
    if (!body) return;
    return withTenant(tenantContext(req), async (c) => {
      const led = await c.query<{ expected_amount: string }>(
        'SELECT expected_amount FROM commission_ledger WHERE id = $1',
        [body.ledgerId],
      );
      const row = led.rows[0];
      if (!row) return reply.code(404).send({ error: 'ledger_not_found' });

      const result = reconcile(
        { expectedAmount: Number(row.expected_amount), appliedPct: body.appliedPct ?? null },
        { commissionAmount: body.commissionAmount, commissionPct: body.commissionPct ?? null },
      );

      await c.query(
        `UPDATE commission_ledger
         SET paid_amount = $2, status = $3, matched_line_item_id = $4
         WHERE id = $1`,
        [body.ledgerId, result.paidAmount, result.status, body.lineItemId ?? null],
      );

      for (const e of result.exceptions) {
        await c.query(
          `INSERT INTO reconciliation_exceptions
             (agency_id, ledger_id, line_item_id, kind, expected, actual, delta)
           VALUES (app.current_agency(), $1, $2, $3, $4, $5, $6)`,
          [body.ledgerId, body.lineItemId ?? null, e.kind, e.expected, e.actual, e.delta],
        );
      }
      return { status: result.status, paidAmount: result.paidAmount, exceptions: result.exceptions };
    });
  });

  // Resolve / accept / dispute an exception.
  const resolveSchema = z.object({
    status: z.enum(['resolved', 'accepted', 'disputed', 'investigating']),
    note: z.string().optional(),
  });

  app.patch('/exceptions/:id', { preHandler: requireRole('agency_admin', 'agency_staff') }, async (req, reply) => {
    const params = parse(z.object({ id: z.string().uuid() }), req.params, reply);
    const body = parse(resolveSchema, req.body, reply);
    if (!params || !body) return;
    return withTenant(tenantContext(req), async (c) => {
      const { rowCount } = await c.query(
        `UPDATE reconciliation_exceptions SET status = $2, note = COALESCE($3, note)
         WHERE id = $1`,
        [params.id, body.status, body.note ?? null],
      );
      if (!rowCount) return reply.code(404).send({ error: 'exception_not_found' });
      return { id: params.id, status: body.status };
    });
  });
}
