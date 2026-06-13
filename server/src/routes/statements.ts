import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';
import { authenticate, requireRole, tenantContext } from '../auth/context.js';
import { parse, z } from '../http.js';
import { generateStatement, renderStatementHtml, type LedgerRow } from '../domain/statements.js';

const generateSchema = z.object({
  agentId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  issue: z.boolean().default(false),
});

export async function statementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // ---------------------------------------------------------------------------
  // Generate (and optionally issue) a statement for one agent over a period.
  // Agents can only request their own; admins can request any.
  // ---------------------------------------------------------------------------
  app.post('/statements/generate', { preHandler: requireRole('agency_admin', 'agency_staff', 'agent') }, async (req, reply) => {
    const body = parse(generateSchema, req.body, reply);
    if (!body) return;

    return withTenant(tenantContext(req), async (c) => {
      // Agents can only pull their own statement.
      const ctx = tenantContext(req);
      if (ctx.role === 'agent' && ctx.agentId !== body.agentId) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      // Fetch agent info.
      const agentRow = await c.query<{ display_name: string; email: string | null }>(
        `SELECT display_name, email FROM agents WHERE id = $1`,
        [body.agentId],
      );
      if (!agentRow.rowCount) return reply.code(404).send({ error: 'agent_not_found' });
      const agent = agentRow.rows[0]!;

      // Agency name.
      const agencyRow = await c.query<{ name: string }>(
        `SELECT name FROM agencies WHERE id = app.current_agency()`,
      );
      const agencyName = agencyRow.rows[0]?.name ?? 'Agency';

      // Ledger rows for this agent in the period.
      const { rows } = await c.query<LedgerRow>(
        `SELECT
           l.id, l.policy_id, p.policy_number, c.name AS carrier_name,
           l.premium_basis, l.expected_amount, l.paid_amount,
           l.agent_advance_amount, l.status, p.is_renewal, l.expected_date
         FROM commission_ledger l
         JOIN policies p ON p.id = l.policy_id
         JOIN carriers c ON c.id = l.carrier_id
         WHERE l.agent_id = $1
           AND (l.expected_date BETWEEN $2 AND $3
             OR l.created_at::date BETWEEN $2 AND $3)
         ORDER BY p.policy_number`,
        [body.agentId, body.periodStart, body.periodEnd],
      );

      const statement = generateStatement(rows);
      const issuedAt = new Date().toISOString().slice(0, 10);
      const html = renderStatementHtml({
        agentName: agent.display_name,
        agencyName,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        issuedAt,
        statement,
      });

      if (!body.issue) {
        return { preview: true, agentName: agent.display_name, ...statement };
      }

      // Persist the statement record (upsert so re-issuing the same period is idempotent).
      const stmt = await c.query<{ id: string }>(
        `INSERT INTO agent_payout_statements
           (agency_id, agent_id, period_start, period_end,
            total_premium, total_paid, total_outstanding, status, issued_at)
         VALUES (app.current_agency(), $1, $2, $3, $4, $5, $6, 'issued', now())
         ON CONFLICT (agency_id, agent_id, period_start, period_end)
         DO UPDATE SET
           total_premium = EXCLUDED.total_premium,
           total_paid = EXCLUDED.total_paid,
           total_outstanding = EXCLUDED.total_outstanding,
           status = 'issued',
           issued_at = now()
         RETURNING id`,
        [
          body.agentId, body.periodStart, body.periodEnd,
          statement.totals.totalPremium,
          statement.totals.totalCommissionPaid,
          statement.totals.totalCommissionOutstanding,
        ],
      );
      const statementId = stmt.rows[0]!.id;

      // Delete stale lines then re-insert.
      await c.query(`DELETE FROM agent_payout_lines WHERE statement_id = $1`, [statementId]);
      for (const line of statement.lines) {
        await c.query(
          `INSERT INTO agent_payout_lines
             (agency_id, statement_id, ledger_id, policy_number,
              premium_amount, commission_paid, commission_outstanding, is_renewal)
           VALUES (app.current_agency(), $1, $2, $3, $4, $5, $6, $7)`,
          [
            statementId, line.ledgerId, line.policyNumber,
            line.premiumAmount, line.commissionPaid, line.commissionOutstanding, line.isRenewal,
          ],
        );
      }

      return reply.code(201).send({
        statementId,
        agentName: agent.display_name,
        agentEmail: agent.email,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        issuedAt,
        html,
        ...statement,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // List all issued statements (admins see all; agents see their own via RLS).
  // ---------------------------------------------------------------------------
  app.get('/statements', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT s.id, s.agent_id, a.display_name AS agent_name, a.email AS agent_email,
                s.period_start, s.period_end, s.total_premium, s.total_paid,
                s.total_outstanding, s.status, s.issued_at
         FROM agent_payout_statements s
         JOIN agents a ON a.id = s.agent_id
         ORDER BY s.issued_at DESC LIMIT 500`,
      );
      return { statements: rows };
    }),
  );

  // ---------------------------------------------------------------------------
  // Get a single statement with its line items. Returns the HTML for rendering.
  // ---------------------------------------------------------------------------
  app.get('/statements/:id', async (req, reply) => {
    const params = parse(z.object({ id: z.string().uuid() }), req.params, reply);
    if (!params) return;
    return withTenant(tenantContext(req), async (c) => {
      const stmtRow = await c.query(
        `SELECT s.id, s.agent_id, a.display_name AS agent_name, a.email AS agent_email,
                s.period_start, s.period_end, s.total_premium, s.total_paid,
                s.total_outstanding, s.status, s.issued_at,
                ag.name AS agency_name
         FROM agent_payout_statements s
         JOIN agents a ON a.id = s.agent_id
         JOIN agencies ag ON ag.id = s.agency_id
         WHERE s.id = $1`,
        [params.id],
      );
      if (!stmtRow.rowCount) return reply.code(404).send({ error: 'statement_not_found' });
      const s = stmtRow.rows[0]!;

      const linesRow = await c.query(
        `SELECT l.ledger_id, l.policy_number, l.premium_amount,
                l.commission_paid, l.commission_outstanding, l.is_renewal,
                ld.status, c.name AS carrier_name
         FROM agent_payout_lines l
         JOIN commission_ledger ld ON ld.id = l.ledger_id
         JOIN carriers c ON c.id = ld.carrier_id
         WHERE l.statement_id = $1 ORDER BY l.policy_number`,
        [params.id],
      );

      const lines = linesRow.rows.map((l) => ({
        ledgerId: l.ledger_id,
        policyNumber: l.policy_number,
        carrierName: l.carrier_name,
        premiumAmount: l.premium_amount != null ? Number(l.premium_amount) : null,
        commissionPaid: Number(l.commission_paid),
        commissionOutstanding: Number(l.commission_outstanding),
        agentAdvance: 0,
        isRenewal: l.is_renewal,
        status: l.status,
      }));

      const totals = {
        totalPremium: Number(s.total_premium ?? 0),
        totalCommissionPaid: Number(s.total_paid ?? 0),
        totalCommissionOutstanding: Number(s.total_outstanding ?? 0),
        totalAgentAdvance: 0,
        totalCommissionExpected: Number(s.total_paid ?? 0) + Number(s.total_outstanding ?? 0),
      };

      const html = renderStatementHtml({
        agentName: s.agent_name,
        agencyName: s.agency_name,
        periodStart: s.period_start,
        periodEnd: s.period_end,
        issuedAt: s.issued_at ? new Date(s.issued_at).toISOString().slice(0, 10) : '',
        statement: { lines, totals },
      });

      return { ...s, lines, totals, html };
    });
  });

  // ---------------------------------------------------------------------------
  // Serve the HTML directly for print/iframe (no JS needed on the client).
  // ---------------------------------------------------------------------------
  app.get('/statements/:id/html', async (req, reply) => {
    const params = parse(z.object({ id: z.string().uuid() }), req.params, reply);
    if (!params) return;
    return withTenant(tenantContext(req), async (c) => {
      // Reuse the JSON endpoint logic, just change content-type.
      const stmtRow = await c.query(
        `SELECT s.*, a.display_name AS agent_name, ag.name AS agency_name
         FROM agent_payout_statements s
         JOIN agents a ON a.id = s.agent_id
         JOIN agencies ag ON ag.id = s.agency_id
         WHERE s.id = $1`,
        [params.id],
      );
      if (!stmtRow.rowCount) return reply.code(404).send({ error: 'statement_not_found' });
      const s = stmtRow.rows[0]!;

      const linesRow = await c.query(
        `SELECT l.*, ld.status, c.name AS carrier_name
         FROM agent_payout_lines l
         JOIN commission_ledger ld ON ld.id = l.ledger_id
         JOIN carriers c ON c.id = ld.carrier_id
         WHERE l.statement_id = $1 ORDER BY l.policy_number`,
        [params.id],
      );

      const lines = linesRow.rows.map((l) => ({
        ledgerId: l.ledger_id,
        policyNumber: l.policy_number,
        carrierName: l.carrier_name,
        premiumAmount: l.premium_amount != null ? Number(l.premium_amount) : null,
        commissionPaid: Number(l.commission_paid),
        commissionOutstanding: Number(l.commission_outstanding),
        agentAdvance: 0,
        isRenewal: l.is_renewal,
        status: l.status,
      }));

      const totals = {
        totalPremium: Number(s.total_premium ?? 0),
        totalCommissionPaid: Number(s.total_paid ?? 0),
        totalCommissionOutstanding: Number(s.total_outstanding ?? 0),
        totalAgentAdvance: 0,
        totalCommissionExpected: Number(s.total_paid ?? 0) + Number(s.total_outstanding ?? 0),
      };

      const html = renderStatementHtml({
        agentName: s.agent_name,
        agencyName: s.agency_name,
        periodStart: s.period_start,
        periodEnd: s.period_end,
        issuedAt: s.issued_at ? new Date(s.issued_at).toISOString().slice(0, 10) : '',
        statement: { lines, totals },
      });

      return reply.type('text/html').send(html);
    });
  });

  // PATCH: mark a statement paid (agency records actual payout to agent).
  app.patch('/statements/:id', { preHandler: requireRole('agency_admin', 'agency_staff') }, async (req, reply) => {
    const params = parse(z.object({ id: z.string().uuid() }), req.params, reply);
    const body = parse(z.object({ status: z.enum(['issued', 'paid']) }), req.body, reply);
    if (!params || !body) return;
    return withTenant(tenantContext(req), async (c) => {
      const { rowCount } = await c.query(
        `UPDATE agent_payout_statements SET status = $2 WHERE id = $1`,
        [params.id, body.status],
      );
      if (!rowCount) return reply.code(404).send({ error: 'statement_not_found' });
      return { id: params.id, status: body.status };
    });
  });
}
