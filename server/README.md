# Inspire CRM — Backend API

Node + TypeScript (Fastify) API over PostgreSQL for the transit-insurance commission platform.
Implements the foundation of the [architecture blueprint](../docs/inspire-crm-architecture.md):
multi-tenant data model with **Row-Level Security**, JWT auth + RBAC, and the Phase 1–2 commission
workflow (carrier uploads → expected-vs-paid ledger → reconciliation exceptions).

## Architecture in brief

- **Two DB roles.** The privileged owner role (`DATABASE_URL`) runs migrations, login lookups, and
  ITX provisioning — it bypasses RLS. The runtime role (`APP_DATABASE_URL`) handles every
  tenant-scoped request and is *subject* to RLS. See `src/db.ts`.
- **Tenant context.** Each tenant request runs in a transaction that sets `app.current_agency`,
  `app.role`, `app.user_id`, `app.agent_id` via `SET LOCAL`; Postgres policies enforce isolation
  (`withTenant` in `src/db.ts`, policies in `src/db/migrations/0001_init.sql`).
- **Domain logic** is pure and unit-tested: `src/domain/commission.ts` (expected commission) and
  `src/domain/reconcile.ts` (discrepancy flagging).

## Prerequisites

- Node ≥ 20, PostgreSQL ≥ 14.
- Two roles + a database. For local dev:

```sql
CREATE ROLE inspire LOGIN PASSWORD 'inspire' CREATEDB;        -- owner / migrations
CREATE ROLE inspire_app LOGIN PASSWORD 'inspire_app';          -- runtime (RLS-subject)
CREATE DATABASE inspire_crm OWNER inspire;
GRANT CONNECT ON DATABASE inspire_crm TO inspire_app;
```

## Setup

```bash
cd server
cp .env.example .env        # adjust connection strings / JWT secret
npm install
npm run migrate             # apply SQL migrations (owner role)
npm run seed                # demo agency, carriers, agent, sample ledger row
npm run dev                 # start API on :4000
```

## Quick smoke test

```bash
# Log in as the demo agency admin
TOKEN=$(curl -s localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@demo.test","password":"password123"}' | jq -r .accessToken)

# Real-time owed-vs-paid dashboard
curl -s localhost:4000/dashboard/summary -H "authorization: Bearer $TOKEN" | jq
```

## Key endpoints

| Method & path | Role | Purpose |
|---|---|---|
| `POST /auth/login`, `/auth/refresh`, `GET /auth/me` | public / any | Authentication |
| `GET/POST /agencies` | itx_admin | Provision tenants + first admin |
| `GET/POST /carriers` | any / itx_admin | Global carrier registry |
| `GET/POST /appointments` | agency | Agency↔carrier appointments |
| `GET/POST /agents` | agency | Producers |
| `GET/POST /commission-rules` | agency | Carrier payout rules |
| `GET/POST /policies`, `POST /policies/:id/premiums` | agency | Policies; premium → projected ledger |
| `GET/POST /uploads` | agency | Phase 1 carrier-file metadata |
| `GET /ledger`, `/dashboard/summary`, `/exceptions` | agency / agent | Owed-vs-paid + discrepancies |
| `POST /reconcile` | agency | Phase 2: match a statement line to a ledger row |

Agents authenticate with the same `/auth/login` and are restricted by RLS to their own ledger and
statement rows.

## Tests

```bash
npm test          # domain unit tests (commission math + reconciliation)
npm run typecheck
```

## Not yet implemented (next slices)

Async parse workers (BullMQ) + Claude-assisted PDF extraction, object-storage upload signing,
statement-PDF generation/email (Phase 3 issue flow), and the Phase 4/5 premium features. The schema
and blueprint already account for these.
