import pg from 'pg';
import { config } from './config.js';

// Postgres returns numeric/bigint as strings by default to avoid precision loss.
// We keep that behavior for money columns (numeric) and parse explicitly where needed.

// Privileged pool: owns the tables, bypasses RLS. Used for auth lookups, provisioning,
// and anything that must cross tenant boundaries (ITX admin operations).
export const adminPool = new pg.Pool({ connectionString: config.databaseUrl });

// Runtime pool: non-owner role, subject to RLS. Used for all tenant-scoped requests.
export const appPool = new pg.Pool({ connectionString: config.appDatabaseUrl });

export interface TenantContext {
  agencyId: string | null;
  role: string;
  userId: string;
  agentId: string | null;
}

/**
 * Runs `fn` inside a transaction on the RLS-subject pool with the tenant GUCs set
 * via SET LOCAL, so Postgres policies enforce isolation for every query inside.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1,$2,true)', ['app.current_agency', ctx.agencyId ?? '']);
    await client.query('SELECT set_config($1,$2,true)', ['app.role', ctx.role]);
    await client.query('SELECT set_config($1,$2,true)', ['app.user_id', ctx.userId]);
    await client.query('SELECT set_config($1,$2,true)', ['app.agent_id', ctx.agentId ?? '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePools(): Promise<void> {
  await Promise.allSettled([adminPool.end(), appPool.end()]);
}
