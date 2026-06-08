import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AccessClaims {
  sub: string; // user id
  agencyId: string | null;
  role: string;
  agentId: string | null;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, config.jwt.secret, { expiresIn: config.jwt.accessTtl });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'refresh' }, config.jwt.secret, {
    expiresIn: config.jwt.refreshTtl,
  });
}

export function verifyToken<T = AccessClaims>(token: string): T {
  return jwt.verify(token, config.jwt.secret) as T;
}
