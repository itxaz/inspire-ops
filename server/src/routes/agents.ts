import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';
import { authenticate, requireRole, tenantContext } from '../auth/context.js';
import { parse, z } from '../http.js';

const createSchema = z.object({
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  defaultSplit: z.number().min(0).max(1).optional(),
});

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/agents', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT id, display_name, email, default_split, status, created_at
         FROM agents ORDER BY display_name`,
      );
      return { agents: rows };
    }),
  );

  app.post('/agents', { preHandler: requireRole('agency_admin', 'agency_staff') }, async (req, reply) => {
    const body = parse(createSchema, req.body, reply);
    if (!body) return;
    return withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `INSERT INTO agents (agency_id, display_name, email, default_split)
         VALUES (app.current_agency(), $1, $2, $3)
         RETURNING id, display_name, email, default_split, status`,
        [body.displayName, body.email ?? null, body.defaultSplit ?? null],
      );
      return reply.code(201).send(rows[0]);
    });
  });
}
