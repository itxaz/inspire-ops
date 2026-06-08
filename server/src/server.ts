import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { adminPool, closePools } from './db.js';
import { authRoutes } from './routes/auth.js';
import { agencyRoutes } from './routes/agencies.js';
import { agentRoutes } from './routes/agents.js';
import { carrierRoutes } from './routes/carriers.js';
import { commissionRuleRoutes } from './routes/commissionRules.js';
import { policyRoutes } from './routes/policies.js';
import { uploadRoutes } from './routes/uploads.js';
import { ledgerRoutes } from './routes/ledger.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: config.corsOrigin, credentials: true });

  app.get('/health', async () => {
    await adminPool.query('SELECT 1');
    return { ok: true };
  });

  app.register(authRoutes);
  app.register(agencyRoutes);
  app.register(agentRoutes);
  app.register(carrierRoutes);
  app.register(commissionRuleRoutes);
  app.register(policyRoutes);
  app.register(uploadRoutes);
  app.register(ledgerRoutes);

  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');

if (isMain) {
  const app = buildApp();
  app
    .listen({ port: config.port, host: config.host })
    .then(() => app.log.info(`Inspire CRM API listening on ${config.host}:${config.port}`))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      await app.close();
      await closePools();
      process.exit(0);
    });
  }
}
