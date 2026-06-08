import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TenantContext } from '../db.js';
import { verifyToken, type AccessClaims } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AccessClaims;
  }
}

/** Populates request.auth from the Bearer token, or 401s. */
export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'missing_token' });
  }
  try {
    req.auth = verifyToken<AccessClaims>(header.slice('Bearer '.length));
  } catch {
    return reply.code(401).send({ error: 'invalid_token' });
  }
}

/** Guard factory: require the caller to hold one of the given roles. */
export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  };
}

export function tenantContext(req: FastifyRequest): TenantContext {
  const a = req.auth!;
  return { agencyId: a.agencyId, role: a.role, userId: a.sub, agentId: a.agentId };
}
