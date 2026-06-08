import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db.js';
import { authenticate, requireRole, tenantContext } from '../auth/context.js';
import { parse, z } from '../http.js';

// Phase 1: records the metadata for a carrier export that has been placed in object storage.
// The raw bytes live in S3-compatible storage (storage_key); a parse job is enqueued separately.
const uploadSchema = z.object({
  carrierId: z.string().uuid().optional(),
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().optional(),
  byteSize: z.number().int().nonnegative().optional(),
});

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/uploads', async (req) =>
    withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `SELECT id, carrier_id, file_name, mime_type, byte_size, status, created_at
         FROM uploads ORDER BY created_at DESC LIMIT 200`,
      );
      return { uploads: rows };
    }),
  );

  app.post('/uploads', { preHandler: requireRole('agency_admin', 'agency_staff') }, async (req, reply) => {
    const body = parse(uploadSchema, req.body, reply);
    if (!body) return;
    return withTenant(tenantContext(req), async (c) => {
      const { rows } = await c.query(
        `INSERT INTO uploads (agency_id, carrier_id, uploaded_by, storage_key, file_name, mime_type, byte_size)
         VALUES (app.current_agency(), $1, $2, $3, $4, $5, $6)
         RETURNING id, status, created_at`,
        [
          body.carrierId ?? null,
          req.auth!.sub,
          body.storageKey,
          body.fileName,
          body.mimeType ?? null,
          body.byteSize ?? null,
        ],
      );
      return reply.code(201).send(rows[0]);
    });
  });
}
