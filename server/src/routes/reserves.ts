// Phase 4 premium: commission reserves and factoring advances.
// Only available to agencies on the 'premium' tier (checked at route level).

import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';
import { authenticate, requireRole, tenantContext } from '../auth/context.js';
import { parse, z } from '../http.js';
import { round2 } from '../domain/commission.js';

async function requirePremiumTier(agencyId: string | null, c: import('pg').PoolClient, reply: import('fastify').FastifyReply): Promise<boolean> {
  if (!agencyId) { reply.code(403).send({ error: 'no_agency' }); return false; }
  const { rows } = await c.query<{ tier: string }>(`SELECT tier FROM agencies WHERE id = $1`, [agencyId]);
  if (rows[0]?.tier !== 'premium') {
    reply.code(403).send({ error: 'premium_tier_required', message: 'Upgrade to the Premium plan to use reserves and factoring.' });
    return false;
  }
  return true;
}

export async function reserveRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // ---------------------------------------------------------------------------
  // Commission Reserves — agency holds back a % of each commission as a buffer.
  // ---------------------------------------------------------------------------
  app.get('/reserves', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT r.id, r.agent_id, a.display_name AS agent_name,
                r.reserve_pct, r.balance, r.updated_at
         FROM commission_reserves r
         LEFT JOIN agents a ON a.id = r.agent_id
         ORDER BY a.display_name NULLS LAST`,
      );
      return { reserves: rows };
    }),
  );

  app.post('/reserves', { preHandler: requireRole('agency_admin') }, async (req, reply) => {
    const body = parse(
      z.object({ agentId: z.string().uuid().optional(), reservePct: z.number().min(0).max(1) }),
      req.body, reply,
    );
    if (!body) return;
    return withTenant(tenantContext(req), async (c) => {
      const ok = await requirePremiumTier(tenantContext(req).agencyId, c, reply);
      if (!ok) return;
      const { rows } = await c.query(
        `INSERT INTO commission_reserves (agency_id, agent_id, reserve_pct)
         VALUES (app.current_agency(), $1, $2)
         ON CONFLICT DO NOTHING
         RETURNING id, agent_id, reserve_pct, balance`,
        [body.agentId ?? null, body.reservePct],
      );
      return reply.code(201).send(rows[0]);
    });
  });

  app.patch('/reserves/:id', { preHandler: requireRole('agency_admin') }, async (req, reply) => {
    const params = parse(z.object({ id: z.string().uuid() }), req.params, reply);
    const body = parse(
      z.object({ reservePct: z.number().min(0).max(1).optional(), adjustBalance: z.number().optional() }),
      req.body, reply,
    );
    if (!params || !body) return;
    return withTenant(tenantContext(req), async (c) => {
      const { rowCount, rows } = await c.query(
        `UPDATE commission_reserves
         SET reserve_pct = COALESCE($2, reserve_pct),
             balance = balance + COALESCE($3, 0),
             updated_at = now()
         WHERE id = $1
         RETURNING id, agent_id, reserve_pct, balance`,
        [params.id, body.reservePct ?? null, body.adjustBalance ?? null],
      );
      if (!rowCount) return reply.code(404).send({ error: 'reserve_not_found' });
      return rows[0];
    });
  });

  // ---------------------------------------------------------------------------
  // Factoring Advances — agency advances cash against an expected ledger row.
  // ---------------------------------------------------------------------------
  app.get('/factoring', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT f.id, f.ledger_id, f.advance_amount, f.fee_amount, f.advanced_on,
                f.repaid_on, f.status,
                l.expected_amount, l.paid_amount,
                p.policy_number, c.name AS carrier_name
         FROM factoring_advances f
         JOIN commission_ledger l ON l.id = f.ledger_id
         JOIN policies p ON p.id = l.policy_id
         JOIN carriers c ON c.id = l.carrier_id
         ORDER BY f.advanced_on DESC`,
      );
      return { advances: rows };
    }),
  );

  const factoringSchema = z.object({
    ledgerId: z.string().uuid(),
    advanceAmount: z.number().positive(),
    feePct: z.number().min(0).max(0.5).default(0.03),
    advancedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });

  app.post('/factoring', { preHandler: requireRole('agency_admin') }, async (req, reply) => {
    const body = parse(factoringSchema, req.body, reply);
    if (!body) return;
    return withTenant(tenantContext(req), async (c) => {
      const ok = await requirePremiumTier(tenantContext(req).agencyId, c, reply);
      if (!ok) return;

      // Verify the ledger row belongs to this agency and is not already paid.
      const led = await c.query<{ id: string; expected_amount: string; status: string }>(
        `SELECT id, expected_amount, status FROM commission_ledger WHERE id = $1`,
        [body.ledgerId],
      );
      const ledger = led.rows[0];
      if (!ledger) return reply.code(404).send({ error: 'ledger_not_found' });
      if (ledger.status === 'paid') return reply.code(409).send({ error: 'already_paid' });

      const feeAmount = round2(body.advanceAmount * body.feePct);
      const { rows } = await c.query(
        `INSERT INTO factoring_advances (agency_id, ledger_id, advance_amount, fee_amount, advanced_on)
         VALUES (app.current_agency(), $1, $2, $3, $4)
         RETURNING id, ledger_id, advance_amount, fee_amount, advanced_on, status`,
        [body.ledgerId, body.advanceAmount, feeAmount, body.advancedOn],
      );
      return reply.code(201).send(rows[0]);
    });
  });

  app.patch('/factoring/:id', { preHandler: requireRole('agency_admin') }, async (req, reply) => {
    const params = parse(z.object({ id: z.string().uuid() }), req.params, reply);
    const body = parse(
      z.object({ status: z.enum(['outstanding', 'repaid']), repaidOn: z.string().optional() }),
      req.body, reply,
    );
    if (!params || !body) return;
    return withTenant(tenantContext(req), async (c) => {
      const { rowCount, rows } = await c.query(
        `UPDATE factoring_advances
         SET status = $2, repaid_on = COALESCE($3::date, repaid_on)
         WHERE id = $1
         RETURNING id, status, repaid_on`,
        [params.id, body.status, body.repaidOn ?? null],
      );
      if (!rowCount) return reply.code(404).send({ error: 'advance_not_found' });
      return rows[0];
    });
  });
}
