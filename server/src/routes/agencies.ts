import type { FastifyInstance } from 'fastify';
import { adminPool } from '../db.js';
import { hashPassword } from '../auth/password.js';
import { authenticate, requireRole } from '../auth/context.js';
import { parse, z } from '../http.js';

const provisionSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  tier: z.enum(['base', 'premium']).default('base'),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

/** ITX-admin provisioning: create a tenant agency and its first agency_admin user. */
export async function agencyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/agencies', { preHandler: requireRole('itx_admin') }, async () => {
    const { rows } = await adminPool.query(
      'SELECT id, name, legal_name, tier, status, created_at FROM agencies ORDER BY created_at DESC',
    );
    return { agencies: rows };
  });

  app.post('/agencies', { preHandler: requireRole('itx_admin') }, async (req, reply) => {
    const body = parse(provisionSchema, req.body, reply);
    if (!body) return;

    const client = await adminPool.connect();
    try {
      await client.query('BEGIN');
      const agency = await client.query<{ id: string }>(
        'INSERT INTO agencies (name, legal_name, tier) VALUES ($1,$2,$3) RETURNING id',
        [body.name, body.legalName ?? null, body.tier],
      );
      const agencyId = agency.rows[0]!.id;
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (agency_id, email, password_hash, role)
         VALUES ($1,$2,$3,'agency_admin') RETURNING id`,
        [agencyId, body.admin.email, await hashPassword(body.admin.password)],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ agencyId, adminUserId: user.rows[0]!.id });
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        return reply.code(409).send({ error: 'email_taken' });
      }
      throw err;
    } finally {
      client.release();
    }
  });
}
