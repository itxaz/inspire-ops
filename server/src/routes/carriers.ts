import type { FastifyInstance } from 'fastify';
import { adminPool, withTenant } from '../db.js';
import { authenticate, requireRole, tenantContext } from '../auth/context.js';
import { parse, z } from '../http.js';

// Carriers are a global shared registry. ITX curates the list; everyone can read it.
export async function carrierRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/carriers', async () => {
    const { rows } = await adminPool.query(
      'SELECT id, name, naic_code FROM carriers ORDER BY name',
    );
    return { carriers: rows };
  });

  app.post('/carriers', { preHandler: requireRole('itx_admin') }, async (req, reply) => {
    const body = parse(z.object({ name: z.string().min(1), naicCode: z.string().optional() }), req.body, reply);
    if (!body) return;
    const { rows } = await adminPool.query(
      'INSERT INTO carriers (name, naic_code) VALUES ($1,$2) RETURNING id, name, naic_code',
      [body.name, body.naicCode ?? null],
    );
    return reply.code(201).send(rows[0]);
  });

  // An agency's appointments with carriers (tenant-scoped).
  app.get('/appointments', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT a.id, a.carrier_id, c.name AS carrier_name, a.carrier_code, a.active
         FROM agency_carrier_appointments a
         JOIN carriers c ON c.id = a.carrier_id
         ORDER BY c.name`,
      );
      return { appointments: rows };
    }),
  );

  app.post('/appointments', { preHandler: requireRole('agency_admin', 'agency_staff') }, async (req, reply) => {
    const body = parse(
      z.object({ carrierId: z.string().uuid(), carrierCode: z.string().optional() }),
      req.body,
      reply,
    );
    if (!body) return;
    return withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `INSERT INTO agency_carrier_appointments (agency_id, carrier_id, carrier_code)
         VALUES (app.current_agency(), $1, $2)
         ON CONFLICT (agency_id, carrier_id) DO UPDATE SET carrier_code = EXCLUDED.carrier_code, active = true
         RETURNING id, carrier_id, carrier_code, active`,
        [body.carrierId, body.carrierCode ?? null],
      );
      return reply.code(201).send(rows[0]);
    });
  });
}
