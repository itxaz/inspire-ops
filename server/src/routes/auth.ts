import type { FastifyInstance } from 'fastify';
import { adminPool } from '../db.js';
import { verifyPassword } from '../auth/password.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../auth/jwt.js';
import { authenticate } from '../auth/context.js';
import { parse, z } from '../http.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface UserRow {
  id: string;
  agency_id: string | null;
  role: string;
  agent_id: string | null;
  password_hash: string;
  status: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const body = parse(loginSchema, req.body, reply);
    if (!body) return;

    // Login must look across all tenants by email, so it uses the privileged pool.
    const { rows } = await adminPool.query<UserRow>(
      'SELECT id, agency_id, role, agent_id, password_hash, status FROM users WHERE email = $1',
      [body.email],
    );
    const user = rows[0];
    if (!user || user.status !== 'active' || !(await verifyPassword(user.password_hash, body.password))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const claims = {
      sub: user.id,
      agencyId: user.agency_id,
      role: user.role,
      agentId: user.agent_id,
    };
    return {
      accessToken: signAccessToken(claims),
      refreshToken: signRefreshToken(user.id),
      user: claims,
    };
  });

  app.post('/auth/refresh', async (req, reply) => {
    const body = parse(z.object({ refreshToken: z.string() }), req.body, reply);
    if (!body) return;
    let userId: string;
    try {
      userId = verifyToken<{ sub: string; typ?: string }>(body.refreshToken).sub;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }
    const { rows } = await adminPool.query<UserRow>(
      'SELECT id, agency_id, role, agent_id, password_hash, status FROM users WHERE id = $1',
      [userId],
    );
    const user = rows[0];
    if (!user || user.status !== 'active') return reply.code(401).send({ error: 'invalid_token' });
    const claims = { sub: user.id, agencyId: user.agency_id, role: user.role, agentId: user.agent_id };
    return { accessToken: signAccessToken(claims) };
  });

  app.get('/auth/me', { preHandler: authenticate }, async (req) => ({ user: req.auth }));
}
