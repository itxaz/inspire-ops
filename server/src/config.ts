import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // Privileged (table owner) connection — migrations, login, provisioning. Bypasses RLS.
  databaseUrl: required('DATABASE_URL'),
  // Runtime (non-owner) connection — tenant-scoped requests. Subject to RLS.
  appDatabaseUrl: process.env.APP_DATABASE_URL ?? required('DATABASE_URL'),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-change-me',
    accessTtl: Number(process.env.JWT_ACCESS_TTL ?? 900),
    refreshTtl: Number(process.env.JWT_REFRESH_TTL ?? 1209600),
  },
};
