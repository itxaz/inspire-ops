# Inspire CRM

ITX's branded SaaS for transit insurance agencies. Solves the commission-float problem: agencies front commissions to agents for ~30 days then wait ~15 more for carrier settlement. Agents get no statements, breeding mistrust. This system provides real-time owed-vs-paid visibility and automated agent commission statements.

Two clients are live (~$5M and ~$50M revenue).

## Architecture

- **Frontend:** React/Vite SPA (`src/`) — light theme, module-based UI with per-role access control
- **Backend:** Node + Fastify + TypeScript (`server/`) — REST API with JWT auth (access + refresh tokens)
- **Database:** Postgres 16 with Row-Level Security (RLS), shared DB multi-tenancy keyed on `agency_id`
- **Deploy:** Railway (managed Postgres + Redis + api container + web container via Caddy)
- **Local dev:** `docker compose up --build` mirrors the Railway topology

### Two-role database model

- **Owner role** (`inspire` / `DATABASE_URL`): runs migrations, handles login, bypasses RLS
- **Runtime role** (`inspire_app` / `APP_DATABASE_URL`): subject to RLS, serves tenant requests
- `BOOTSTRAP_APP_ROLE=true` creates `inspire_app` automatically on managed Postgres

### Per-request tenant context

Every authenticated request sets `SET LOCAL app.current_agency`, `app.role`, `app.user_id`, `app.agent_id` — RLS policies enforce isolation.

## RBAC roles

- `itx_admin` — ITX super-admin, sees all agencies
- `agency_admin` — agency owner, full access within their agency
- `agency_staff` — agency employee, all modules except admin
- `agent` — read-only portal, sees own commissions + statements only

## Key directories

```
src/                    React SPA (Vite)
src/App.jsx             Main app shell, routing, login, sidebar, CSS variables
src/lib/api.js          API client (fetch wrapper, JWT token management)
src/modules/            UI modules (CommissionHub, Uploads, Statements, etc.)
server/                 Node/Fastify backend
server/src/server.ts    App entry point, route registration
server/src/config.ts    Environment config
server/src/db.ts        Postgres pool setup (adminPool + appPool)
server/src/auth/        JWT + password (argon2) + tenant context
server/src/domain/      Pure business logic (commission math, CSV parsing, reconciliation, statements)
server/src/routes/      REST route handlers
server/src/db/          Migrations + seed
docs/                   Architecture docs, deploy guide, Phase 5 scope
```

## API routes

All routes defined in `server/src/routes/`:

| Route file | Endpoints | Purpose |
|---|---|---|
| `auth.ts` | `POST /auth/login`, `POST /auth/refresh` | JWT authentication |
| `agencies.ts` | `GET /agencies`, `PATCH /agencies/:id` | Agency management |
| `agents.ts` | `GET/POST/PATCH /agents` | Agent CRUD |
| `carriers.ts` | `GET/POST /carriers`, appointments | Carrier directory + agency appointments |
| `commissionRules.ts` | `GET/POST/DELETE /commission-rules` | Per-carrier commission basis rules |
| `policies.ts` | `GET/POST /policies`, premium transactions | Policy + premium recording |
| `uploads.ts` | `GET/POST /uploads` | Raw file upload tracking |
| `mappingProfiles.ts` | `GET/POST/DELETE /mapping-profiles` | CSV column mapping profiles |
| `imports.ts` | `POST /imports/preview`, `POST/GET /imports` | CSV ingest pipeline with auto-reconcile |
| `ledger.ts` | `GET /ledger` | Commission ledger (expected vs paid) |
| `statements.ts` | `POST /statements/generate`, `GET/PATCH /statements` | Agent commission statements |
| `reserves.ts` | `GET/POST/PATCH /reserves`, `/factoring` | Premium-tier reserves + factoring |

## Domain logic

Pure functions in `server/src/domain/`:

- **`commission.ts`** — `expectedPct()`, `computeExpectedCommission()`, `agentAdvance()`, `round2()`
- **`parse.ts`** — RFC-4180 CSV parser, `suggestMapping()` auto-mapper, `parseMoney()`/`parsePct()` coercers, `normalizeRows()` with flagging + confidence scoring
- **`parse-ai.ts`** — Claude-assisted parsing fallback (`maybeParseWithClaude()`), fires when confidence < 0.7 and `ANTHROPIC_API_KEY` is set
- **`reconcile.ts`** — `reconcile()` comparing expected vs actual, producing status + exceptions
- **`statements.ts`** — `generateStatement()` builds statement lines + totals, `renderStatementHtml()` produces print-quality HTML

## Product phases (implementation status)

| Phase | Slice | Status | Tier |
|---|---|---|---|
| P1 CSV ingest + parsing | Slice 2 | Done | Base |
| P2 Auto-reconciliation | Slice 2 | Done | Base |
| P3 Agent statements | Slice 3 | Done | Base |
| Claude parsing fallback | Slice 5 | Done | Base |
| P4 Reserves + factoring | Slice 6 | Done | Premium |
| P5 Carrier portal bot | Slice 7 | Scoped only (`docs/phase5-portal-bot-scope.md`) | Premium |
| Admin setup screens | Slice 1 | Done | Base |
| React UI wired to API | Slice 4 | Done | Base |

## Frontend modules

All in `src/modules/`:

- `CommissionHub.jsx` — main dashboard, ledger view
- `UploadsModule.jsx` — 3-step CSV upload wizard (upload → map & review → done)
- `StatementsModule.jsx` — agent statement list, generate, view HTML, mark paid
- `ReservesModule.jsx` — premium-tier reserves config + factoring advances
- `AgentsModule.jsx` — agent CRUD, split %, active toggle
- `CarriersModule.jsx` — carrier directory + agency appointments
- `CommissionRulesModule.jsx` — per-carrier basis rules
- `PoliciesModule.jsx` — policy list, create, premium recording

## Database

Single migration: `server/src/db/migrations/0001_init.sql`

Key tables: `agencies`, `users`, `agents`, `carriers`, `agency_carrier_appointments`, `commission_rules`, `policies`, `premium_transactions`, `uploads`, `mapping_profiles`, `import_batches`, `carrier_statements`, `statement_line_items`, `commission_ledger`, `reconciliation_exceptions`, `agent_payout_statements`, `agent_payout_lines`, `commission_reserves`, `factoring_advances`, `audit_log`

## Running locally

```bash
docker compose up --build                  # Postgres + API + SPA
docker compose run --rm api npm run seed   # one-time demo data
open http://localhost:8080                  # SPA (API on :4000)
```

Demo logins (password `password123`): `admin@demo.test`, `jane@demo.test`, `itx@inspirecrm.test`

## Running tests

```bash
cd server && npm test                      # domain unit tests
cd server && npm run typecheck             # TypeScript type checking
```

## Deploy (Railway)

See `docs/DEPLOY-RAILWAY.md` for full instructions. The project runs as 4 Railway services:

- **Postgres** (managed) — provides `DATABASE_URL`
- **Redis** (managed) — provides `REDIS_URL`
- **api** — builds from `server/Dockerfile`, root dir `server`, pre-deploys `npm run migrate`
- **web** — builds from `Dockerfile.web`, root dir repo root, serves SPA via Caddy

Key env vars on api: `DATABASE_URL`, `APP_DATABASE_URL`, `BOOTSTRAP_APP_ROLE`, `REDIS_URL`, `JWT_SECRET`, `CORS_ORIGIN`
Key env var on web: `VITE_API_URL` (build-time, must include `https://`)

## Styling

Light theme. CSS variables defined in two places in `src/App.jsx` (login screen + main app shell). Fonts: Syne (display), DM Sans (body). Accent: `#4f8ef7` blue.

## Valuation notes (rough, as of 2026-06)

> Not financial advice — a real valuation comes from a buyer reviewing actual books (ARR, contracts, margins). Estimates below assume an as-is sale.

**Two things could be sold:**
1. **The codebase as an IP asset** — modern multi-tenant vertical-SaaS MVP (Postgres + RLS, JWT auth, commission-reconciliation engine, CSV ingest with AI fallback, agent statements, premium reserves/factoring). Roughly 4–8 months of solid engineering. As pure IP with no revenue attached: **~$30K–$150K** (cost-to-replicate minus integration/maintenance risk). Lower end given it's early, single migration, no E2E tests, Phase 5 scoped-but-unbuilt.
2. **The business** — sells on a multiple of recurring revenue. Early, two-customer, founder-dependent B2B SaaS typically trades at **2–5× ARR**.

**Key distinction:** the "~$5M and ~$50M revenue" figures are the *agencies' (customers')* sizes, NOT Inspire CRM's revenue. The valuation driver is what those two clients actually *pay Inspire*, under what contract.

**Ballpark by ARR (what Inspire bills the two clients combined):**
- $0 (unpaid pilots) → falls back to the code-asset number (**~$30K–$150K**)
- ~$60K/yr → **~$120K–$300K**
- ~$200K/yr → **~$400K–$1M**

**Biggest value levers:** (1) convert the two clients to signed, paying, multi-year contracts; (2) reduce key-person dependency (docs, tests, a second person who knows the system); (3) reduce customer concentration (two customers = high risk — losing one loses ~half the business). Commission systems are sticky once they're the source of truth, which supports retention.

## Competitive positioning

See `docs/competitive-analysis.md` for the full breakdown. Summary: Inspire CRM is a **back-office, vertical** product (commission reconciliation + agent transparency for transit insurance). Most insurtech tools we get compared to — e.g. **Gail (meetgail.com)**, an AI front-office assistant that handles calls/quoting/service — solve a *different* problem and are **complementary, not direct competitors**. Moat = depth in the commission/transit niche.
