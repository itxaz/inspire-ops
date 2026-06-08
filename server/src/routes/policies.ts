import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { withTenant } from '../db.js';
import { authenticate, requireRole, tenantContext } from '../auth/context.js';
import { parse, z } from '../http.js';
import {
  agentAdvance,
  computeExpectedCommission,
  type CommissionRule,
} from '../domain/commission.js';

const policySchema = z.object({
  carrierId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  policyNumber: z.string().min(1),
  insuredName: z.string().optional(),
  productLine: z.string().optional(),
  effectiveDate: z.string().optional(),
  termMonths: z.number().int().positive().optional(),
  isRenewal: z.boolean().default(false),
});

const premiumSchema = z.object({
  txnType: z.enum(['new', 'endorsement', 'renewal', 'cancel']).default('new'),
  premiumAmount: z.number(),
  txnDate: z.string(),
});

/** Find the applicable commission rule for a carrier + product line within the tenant. */
async function findRule(
  c: PoolClient,
  carrierId: string,
  productLine: string | null,
): Promise<CommissionRule | null> {
  const { rows } = await c.query<CommissionRule>(
    `SELECT basis, first_term_pct, renewal_pct, agency_retains_renewal
     FROM commission_rules
     WHERE carrier_id = $1 AND (product_line = $2 OR product_line IS NULL)
     ORDER BY (product_line = $2) DESC NULLS LAST
     LIMIT 1`,
    [carrierId, productLine],
  );
  return rows[0] ?? null;
}

export async function policyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/policies', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT id, carrier_id, agent_id, policy_number, insured_name, product_line,
                effective_date, term_months, is_renewal, status
         FROM policies ORDER BY effective_date DESC NULLS LAST`,
      );
      return { policies: rows };
    }),
  );

  app.post('/policies', { preHandler: requireRole('agency_admin', 'agency_staff') }, async (req, reply) => {
    const body = parse(policySchema, req.body, reply);
    if (!body) return;
    return withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `INSERT INTO policies
           (agency_id, carrier_id, agent_id, policy_number, insured_name, product_line,
            effective_date, term_months, is_renewal)
         VALUES (app.current_agency(), $1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          body.carrierId,
          body.agentId ?? null,
          body.policyNumber,
          body.insuredName ?? null,
          body.productLine ?? null,
          body.effectiveDate ?? null,
          body.termMonths ?? null,
          body.isRenewal,
        ],
      );
      return reply.code(201).send({ id: rows[0]!.id });
    });
  });

  // Record a premium and project the expected commission into the ledger.
  app.post(
    '/policies/:id/premiums',
    { preHandler: requireRole('agency_admin', 'agency_staff') },
    async (req, reply) => {
      const params = parse(z.object({ id: z.string().uuid() }), req.params, reply);
      const body = parse(premiumSchema, req.body, reply);
      if (!params || !body) return;

      return withTenant(tenantContext(req), async (c) => {
        const pol = await c.query<{
          id: string;
          carrier_id: string;
          agent_id: string | null;
          product_line: string | null;
          is_renewal: boolean;
        }>(
          `SELECT id, carrier_id, agent_id, product_line, is_renewal
           FROM policies WHERE id = $1`,
          [params.id],
        );
        const policy = pol.rows[0];
        if (!policy) return reply.code(404).send({ error: 'policy_not_found' });

        await c.query(
          `INSERT INTO premium_transactions (agency_id, policy_id, txn_type, premium_amount, txn_date)
           VALUES (app.current_agency(), $1, $2, $3, $4)`,
          [policy.id, body.txnType, body.premiumAmount, body.txnDate],
        );

        const isRenewal = policy.is_renewal || body.txnType === 'renewal';
        const rule = await findRule(c, policy.carrier_id, policy.product_line);
        if (!rule) {
          return reply.code(201).send({
            warning: 'no_commission_rule',
            ledger: null,
          });
        }

        const { expectedAmount, appliedPct } = computeExpectedCommission(
          rule,
          body.premiumAmount,
          isRenewal,
        );

        // Agent's fronted advance, based on their default split.
        let split: number | null = null;
        if (policy.agent_id) {
          const a = await c.query<{ default_split: string | null }>(
            'SELECT default_split FROM agents WHERE id = $1',
            [policy.agent_id],
          );
          split = a.rows[0]?.default_split != null ? Number(a.rows[0].default_split) : null;
        }
        const advance = agentAdvance(expectedAmount, split);

        const ledger = await c.query(
          `INSERT INTO commission_ledger
             (agency_id, policy_id, agent_id, carrier_id, premium_basis,
              expected_amount, agent_advance_amount, expected_date)
           VALUES (app.current_agency(), $1,$2,$3,$4,$5,$6, ($7::date + INTERVAL '45 days'))
           RETURNING id, expected_amount, agent_advance_amount, status, expected_date`,
          [
            policy.id,
            policy.agent_id,
            policy.carrier_id,
            body.premiumAmount,
            expectedAmount,
            advance,
            body.txnDate,
          ],
        );
        return reply.code(201).send({ appliedPct, ledger: ledger.rows[0] });
      });
    },
  );
}
