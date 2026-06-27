# Inspire OPs — Emergency Runbook

> **Audience:** Josue (or anyone who needs to operate this system without Santiago).
> Last updated: 2026-06-27.

## Quick reference

| What | Where |
|---|---|
| **Railway project** | `Inspire Operations Platform` — [railway.com/dashboard](https://railway.com/dashboard) (Santiago + Josue both have admin access) |
| **GitHub repo** | `itxaz/inspire-ops` (private) |
| **Local clone** | `/Users/itxaz/Documents/opencrm` (directory name kept to avoid breaking tooling) |
| **API domain** | `api-production-35f2.up.railway.app` |
| **SPA domain** | check Railway dashboard → web service → Settings → Networking |
| **Health check** | `GET https://api-production-35f2.up.railway.app/health` → `{"ok":true}` |
| **Pro plan** | $20/month, no BAA, no SLA |

## Services (4 total on Railway)

```
Railway project: Inspire Operations Platform
├── Postgres   (managed)   → provides DATABASE_URL
├── Redis      (managed)   → provides REDIS_URL
├── api        (container) → Node/Fastify, pre-deploy: npm run migrate
└── web        (container) → Caddy serving React SPA
```

## 1. Credentials — where to find them

**Do NOT store credentials in this file.** All secrets live in Railway environment variables.

| Secret | Location |
|---|---|
| `DATABASE_URL` | Railway → api service → Variables (owner role, bypasses RLS) |
| `APP_DATABASE_URL` | Railway → api service → Variables (runtime role, subject to RLS) |
| `JWT_SECRET` | Railway → api service → Variables |
| `REDIS_URL` | Railway → api service → Variables (reference to managed Redis) |
| `CORS_ORIGIN` | Railway → api service → Variables (web service's public URL) |
| `VITE_API_URL` | Railway → web service → Variables (api service's public URL, build-time) |
| `ANTHROPIC_API_KEY` | Railway → api service → Variables (optional, enables Claude CSV parsing fallback) |
| GitHub repo access | Santiago's GitHub account — Josue is a collaborator |
| Railway dashboard access | Both Santiago and Josue have admin access (Pro plan, upgraded 2026-06-27) |

**To get database connection string for direct access:**
Railway dashboard → Postgres service → Connect tab → copy the connection URL.

## 2. Is it up? — Health checks

**API health:**
```bash
curl -s https://api-production-35f2.up.railway.app/health
# Expected: {"ok":true}
# This hits the database (SELECT 1) so it proves both API and Postgres are alive.
```

**SPA health:**
Open the web service URL in a browser. If you see the login screen, the SPA + Caddy are working. If you see a blank page or CORS error in the console, the API is likely down or `CORS_ORIGIN` is misconfigured.

**Railway dashboard:**
Each service shows a green/red status. Postgres and Redis also show connection counts and memory.

## 3. Common failure modes

### API won't start — "Missing required env var"

**Symptom:** Deploy fails, logs show `Error: Missing required env var: DATABASE_URL`.

**Fix:** The api service lost its environment variables (happens after Railway service recreation or project clone).
1. Railway dashboard → api service → Variables
2. Verify `DATABASE_URL` points to the Postgres service (`${{Postgres.DATABASE_URL}}`)
3. Verify `APP_DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` are set
4. Redeploy

### Migration failure on deploy

**Symptom:** Pre-deploy step fails with a SQL error. The API container never starts.

**Fix:**
1. Read the deploy logs — the error will name the migration file and the SQL that failed
2. If it's a "role does not exist" error for `inspire_app`: verify `BOOTSTRAP_APP_ROLE=true` and `APP_DATABASE_URL` are set in the api service variables
3. If it's a "relation already exists" error: the migration may have partially applied. Connect to the database directly and check `SELECT * FROM schema_migrations` to see which migrations are tracked. If the migration is listed but the schema is incomplete, you may need to manually fix the state
4. If it's a genuine schema conflict: fix the SQL, push, Railway will redeploy automatically

**To connect to the database directly:**
```bash
# Get the DATABASE_URL from Railway dashboard → Postgres → Connect
psql "postgresql://inspire:PASSWORD@HOST:PORT/railway"

# Check migration state
SELECT * FROM schema_migrations;
```

### CORS errors in browser console

**Symptom:** SPA loads but all API calls fail. Browser console shows `CORS policy: No 'Access-Control-Allow-Origin'`.

**Fix:** The `CORS_ORIGIN` variable on the api service doesn't match the web service's public URL.
1. Railway dashboard → web service → Settings → Networking → copy the public domain
2. Railway dashboard → api service → Variables → set `CORS_ORIGIN` to that domain (include `https://`)
3. Redeploy the api service

### SPA shows old version after deploy

**Symptom:** You deployed a frontend change but the SPA still shows old content.

**Fix:** `VITE_API_URL` is a build-time variable. If you changed the API URL, you need to rebuild:
1. Railway dashboard → web service → trigger a redeploy
2. For cached assets: Caddy sets `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`. Vite fingerprints assets, so new deploys get new filenames. Hard-refresh (`Cmd+Shift+R`) if needed.

### Database connection pool exhaustion

**Symptom:** API starts returning 500s. Logs show `Error: too many clients already` or connection timeouts.

**Fix:** The app creates two connection pools (`adminPool` and `appPool` in `server/src/db.ts`). Default pool size is 10 per pool (pg driver default).
1. Check Railway dashboard → Postgres → connection count
2. If connections are maxed: restart the api service (kills the Node process, releases all connections)
3. If this recurs: a query is hanging or connections aren't being released. Check for unclosed transactions in the logs

### JWT auth failures — "TokenExpiredError" or "invalid signature"

**Symptom:** Logged-in users get 401s. Re-login doesn't help.

**Causes:**
- `JWT_SECRET` was changed → all existing tokens are invalid. Users must re-login. This is expected.
- Clock skew on the container → rare on Railway, but `jwt.accessTtl` is 900s (15 min) by default. If the container's clock is ahead, tokens expire early.

### Redis connection failure

**Symptom:** Logs show Redis connection errors. Currently Redis is provisioned but not heavily used in the base product.

**Fix:** Railway dashboard → Redis service → check it's running. If it was deleted, re-add it and update the `REDIS_URL` reference variable on the api service.

## 4. Deploy and rollback

### Normal deploy

Push to `main` on GitHub. Railway auto-deploys:
1. Builds the Docker image
2. Runs `npm run migrate` (pre-deploy)
3. Starts `npm start`
4. Health-checks `GET /health`
5. If health check passes → traffic shifts to new container. Old container shuts down.

### Rollback

Railway keeps previous deployments. To rollback:
1. Railway dashboard → api service → Deployments tab
2. Find the last working deployment
3. Click → Redeploy

**Warning:** Rollback does NOT undo database migrations. If the bad deploy added a migration, the old code will run against the new schema. If the migration was additive (new table, new column), this is usually fine. If it was destructive (dropped column), you have a problem — see "Database recovery" below.

### Manual deploy from local

```bash
cd /Users/itxaz/Documents/opencrm
railway login
railway link   # link to the Inspire Operations Platform project
railway up --service api    # deploy api from local code
railway up --service web    # deploy web from local code
```

## 5. Database operations

### Connect directly

```bash
# Get connection URL from Railway dashboard → Postgres → Connect tab
psql "$DATABASE_URL"
```

### Check what's in the database

```sql
-- List all tables
\dt

-- Check migration state
SELECT * FROM schema_migrations ORDER BY applied_at;

-- Count records per key table
SELECT 'agencies' AS t, count(*) FROM agencies
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'agents', count(*) FROM agents
UNION ALL SELECT 'imports', count(*) FROM import_batches
UNION ALL SELECT 'statements', count(*) FROM agent_payout_statements;

-- Check which agencies exist (tenants)
SELECT id, name, slug FROM agencies;

-- Check for locked/hung transactions
SELECT pid, state, query, now() - query_start AS duration
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;
```

### Backup

Railway Hobby plan does NOT include automatic backups. Manual backup:

```bash
# Get DATABASE_URL from Railway dashboard
pg_dump "$DATABASE_URL" --format=custom --file=inspire-ops-backup-$(date +%Y%m%d).dump
```

Store the dump file somewhere safe (not in the git repo).

### Restore from backup

```bash
# WARNING: This replaces all data in the target database
pg_restore --clean --no-owner --dbname="$DATABASE_URL" inspire-ops-backup-YYYYMMDD.dump
```

### Emergency: kill a stuck query

```sql
-- Find the stuck query's PID
SELECT pid, state, query, now() - query_start AS duration
FROM pg_stat_activity WHERE state = 'active';

-- Cancel it gracefully
SELECT pg_cancel_backend(PID_HERE);

-- Force-kill if cancel doesn't work
SELECT pg_terminate_backend(PID_HERE);
```

## 6. Two-role model — what to know

The system uses two Postgres roles:

| Role | Purpose | Connection |
|---|---|---|
| `inspire` (owner) | Runs migrations, handles login, bypasses RLS | `DATABASE_URL` |
| `inspire_app` (runtime) | Serves all tenant requests, subject to RLS | `APP_DATABASE_URL` |

**Why this matters in emergencies:** If you need to query data across tenants (e.g., to check all agencies), connect with `DATABASE_URL` (the owner role). The `APP_DATABASE_URL` role can only see data for the tenant set in the current session via `SET LOCAL`.

**If `inspire_app` role is broken:**
1. Set `BOOTSTRAP_APP_ROLE=true` on the api service
2. Redeploy — the migration step will recreate the role from `APP_DATABASE_URL`

## 7. Running the system locally

If Railway is completely down and you need the platform running:

```bash
cd /Users/itxaz/Documents/opencrm

# Start everything (Postgres + API + SPA)
docker compose up --build

# In another terminal, seed demo data (first time only)
docker compose run --rm api npm run seed

# Access
open http://localhost:8080
```

Demo logins (password `password123`):
- `admin@demo.test` — agency admin
- `jane@demo.test` — agent portal
- `itx@inspirecrm.test` — ITX super-admin (sees all agencies)

**To run against production data locally:** Replace the `DATABASE_URL` and `APP_DATABASE_URL` in `docker-compose.yml` with the Railway Postgres connection strings. This connects your local API to the production database — be careful.

## 8. Key files to know

| File | What it does |
|---|---|
| `server/src/server.ts` | App entry point — registers all routes, starts Fastify, handles shutdown |
| `server/src/config.ts` | Reads all env vars — if something's missing, the error comes from here |
| `server/src/db.ts` | Creates the two connection pools (`adminPool`, `appPool`) + `withTenant()` wrapper |
| `server/src/db/migrate.ts` | Migration runner — applies SQL files, bootstraps `inspire_app` role |
| `server/src/db/migrations/0001_init.sql` | The entire schema (single migration) |
| `server/src/auth/jwt.ts` | JWT token creation and verification |
| `server/src/auth/password.ts` | Argon2 password hashing |
| `server/src/auth/context.ts` | Extracts tenant context from JWT for RLS |
| `server/railway.json` | Railway deploy config: pre-deploy migration, health check path, restart policy |
| `Dockerfile.web` | SPA build: Vite → Caddy static server |
| `server/Dockerfile` | API build: Node 20, copies deps + source |
| `Caddyfile` | SPA routing: gzip, asset caching, SPA fallback to index.html |

## 9. Restart procedures

### Restart just the API (most common fix)

Railway dashboard → api service → Settings → Restart. This kills the Node process and starts a fresh container. Connections reset, in-flight requests are dropped.

### Restart the SPA

Railway dashboard → web service → Settings → Restart. This restarts Caddy. Should almost never be needed — Caddy is extremely stable.

### Restart Postgres

Railway dashboard → Postgres service → Settings → Restart. **Warning:** This drops all active connections. The API will get connection errors until Postgres comes back (usually <30 seconds). The API's health check will fail, but Railway's restart policy (`ON_FAILURE`, 3 retries) will handle it.

### Nuclear option — redeploy everything

```bash
# From local, push a commit (even an empty one) to trigger full redeploy
cd /Users/itxaz/Documents/opencrm
git commit --allow-empty -m "trigger redeploy"
git push origin main
```

Railway will rebuild and redeploy both api and web services. Migrations re-run (idempotent — already-applied migrations are skipped).

## 10. Escalation

| Who | When | Contact |
|---|---|---|
| Santiago | First call for anything Inspire OPs | (Santiago's phone — add here) |
| Railway support | Infrastructure issues, Postgres problems | In-dashboard chat or team@railway.com |
| GitHub | Repo access issues | github.com/contact |

## 11. What this runbook does NOT cover

- **Ana server** — that's Josue's system, separate repo, separate runbook
- **Layer 2 (Front Office)** — not built yet; diagram shows it as planned (amber/dashed)
- **BAA/HIPAA compliance** — Railway Hobby plan has no BAA. PHI should not be stored in this database until Enterprise plan ($1K/month) is activated
- **Scaling beyond Hobby** — see `docs/inspire-ops-architecture.md` §9 for the scaling blueprint
