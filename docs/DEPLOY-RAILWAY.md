# Deploying Inspire CRM on Railway (single platform)

> **Run it locally first.** Before deploying, smoke-test the whole stack with Docker Compose:
>
> ```bash
> docker compose up --build                  # Postgres + API (auto-migrates) + SPA
> docker compose run --rm api npm run seed    # one-time demo data
> open http://localhost:8080                  # SPA → API on :4000
> ```
>
> Demo logins (`password123`): `admin@demo.test` (agency admin), `jane@demo.test` (agent
> portal), `itx@inspirecrm.test` (ITX super-admin). The Compose topology mirrors Railway:
> an owner DB role runs migrations/login, a bootstrapped `inspire_app` role serves
> tenant requests under RLS. This has been verified end-to-end — auth, the CSV
> ingest → reconcile → exception pipeline, agent statement generation, agent RLS
> isolation, and the premium-tier gate all pass against a real Postgres.

One Railway **project** hosts all four pieces — the API container, the static SPA, managed
**Postgres**, and managed **Redis** — replacing the Netlify + container-host + Redis-provider split.
Services reference each other's variables, so connection strings resolve automatically.

```
Railway project: inspire-crm
├── Postgres        (managed)         → provides DATABASE_URL
├── Redis           (managed)         → provides REDIS_URL
├── api   service   (Dockerfile: server/Dockerfile, root dir: server)
└── web   service   (Dockerfile: Dockerfile.web, root dir: repo root)
```

## 1. Create the project + datastores

```bash
npm i -g @railway/cli
railway login
railway init                      # creates the project
railway add --database postgres   # provisions managed Postgres
railway add --database redis      # provisions managed Redis
```

(Or use the dashboard: **New → Postgres**, **New → Redis**.)

## 2. API service

Create a service from this repo with **Root Directory = `server`** (it picks up `server/railway.json`
→ builds `server/Dockerfile`, runs `npm run migrate` as the pre-deploy step, starts `npm start`,
health-checks `/health`).

Set its variables (use Railway *reference variables* so they track the datastores):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (owner role — runs migrations/login, bypasses RLS) |
| `APP_DATABASE_URL` | same host/db as above but with user `inspire_app` and a password you choose |
| `BOOTSTRAP_APP_ROLE` | `true` (migration step creates the `inspire_app` RLS role on first deploy) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `JWT_SECRET` | a long random string |
| `CORS_ORIGIN` | the web service's public URL (set after step 3) |
| `PORT` | injected by Railway automatically |

> The two-role RLS model is preserved: `DATABASE_URL` is the privileged owner connection;
> `APP_DATABASE_URL` is the RLS-subject runtime role. With `BOOTSTRAP_APP_ROLE=true`, the migrate
> step provisions `inspire_app` from `APP_DATABASE_URL` before granting it table privileges.

## 3. Web (SPA) service

Create a second service from the same repo with **Root Directory = repo root** and **Dockerfile path
= `Dockerfile.web`**. Set one build-time variable:

| Variable | Value |
|---|---|
| `VITE_API_URL` | the **api** service's public URL, e.g. `https://inspire-api.up.railway.app` |

Generate public domains for both services (**Settings → Networking → Generate Domain**), then set the
api service's `CORS_ORIGIN` to the web domain and redeploy.

## 4. Seed (optional, first deploy)

```bash
railway run --service api npm run seed
```

Logins: `itx@inspirecrm.test`, `admin@demo.test`, `jane@demo.test` — all `password123`.

## Scaling notes

- **API** is stateless — raise its replica count; Railway load-balances. Run **workers** (BullMQ,
  Phase 1/5) as additional services off the same image with a worker start command.
- **Postgres**: enable backups; add PgBouncer (or Railway's pooling) and read replicas as tenant
  volume grows toward national scale (see the [architecture blueprint](inspire-crm-architecture.md) §9).
- Same code runs unchanged on Render/Fly/AWS — only the dashboard wiring differs.
