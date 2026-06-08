-- Inspire CRM — initial schema (Phases 1–4 tables) with multi-tenant Row-Level Security.
-- Applied by the table-owner role; the runtime role (inspire_app) is subject to the policies below.

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Tenant context helpers. The API sets these GUCs per request via SET LOCAL.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_agency() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.current_agency', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.role', true), '') $$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_agent() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.agent_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.is_itx() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT app.current_role() = 'itx_admin' $$;

-- True unless the caller is an agent looking at someone else's rows.
CREATE OR REPLACE FUNCTION app.can_see_agent(p_agent uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app.current_role() <> 'agent' OR p_agent = app.current_agent()
  $$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE user_role        AS ENUM ('itx_admin','agency_admin','agency_staff','agent');
CREATE TYPE upload_status    AS ENUM ('uploaded','scanning','parsing','parsed','needs_review','failed','imported');
CREATE TYPE ledger_status    AS ENUM ('expected','partially_paid','paid','overpaid','written_off');
CREATE TYPE exception_status AS ENUM ('open','investigating','resolved','accepted','disputed');
CREATE TYPE commission_basis AS ENUM ('upfront_first_term','level_each_term','renewal_only','split');
CREATE TYPE payout_status    AS ENUM ('draft','issued','paid');

-- ---------------------------------------------------------------------------
-- Tenancy & identity
-- ---------------------------------------------------------------------------
CREATE TABLE agencies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  legal_name    text,
  tier          text NOT NULL DEFAULT 'base',
  status        text NOT NULL DEFAULT 'active',
  settings      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid REFERENCES agencies(id),
  email         citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role          user_role NOT NULL,
  agent_id      uuid,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_agency_idx ON users (agency_id);

-- ---------------------------------------------------------------------------
-- Producers, carriers & rules
-- ---------------------------------------------------------------------------
CREATE TABLE agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  display_name  text NOT NULL,
  email         citext,
  tax_id_enc    bytea,
  default_split numeric(6,4),
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agents_agency_idx ON agents (agency_id);

-- Global carrier registry (shared reference; not tenant-scoped).
CREATE TABLE carriers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  naic_code     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agency_carrier_appointments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  carrier_id    uuid NOT NULL REFERENCES carriers(id),
  carrier_code  text,
  active        boolean NOT NULL DEFAULT true,
  UNIQUE (agency_id, carrier_id)
);

CREATE TABLE commission_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  carrier_id    uuid NOT NULL REFERENCES carriers(id),
  product_line  text,
  basis         commission_basis NOT NULL,
  first_term_pct numeric(6,4),
  renewal_pct   numeric(6,4),
  agency_retains_renewal boolean NOT NULL DEFAULT false,
  tiers         jsonb,
  effective_from date,
  effective_to   date
);
CREATE INDEX commission_rules_lookup_idx ON commission_rules (agency_id, carrier_id, product_line);

-- ---------------------------------------------------------------------------
-- Policies & premiums
-- ---------------------------------------------------------------------------
CREATE TABLE policies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  carrier_id    uuid NOT NULL REFERENCES carriers(id),
  agent_id      uuid REFERENCES agents(id),
  policy_number text NOT NULL,
  insured_name  text,
  product_line  text,
  effective_date date,
  term_months   int,
  is_renewal    boolean NOT NULL DEFAULT false,
  prior_policy_id uuid REFERENCES policies(id),
  status        text NOT NULL DEFAULT 'active',
  UNIQUE (agency_id, carrier_id, policy_number)
);
CREATE INDEX policies_agent_idx ON policies (agency_id, agent_id);

CREATE TABLE premium_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  policy_id     uuid NOT NULL REFERENCES policies(id),
  txn_type      text NOT NULL,
  premium_amount numeric(14,2) NOT NULL,
  txn_date      date NOT NULL
);
CREATE INDEX premium_txn_policy_idx ON premium_transactions (agency_id, policy_id);

-- ---------------------------------------------------------------------------
-- Ingestion (Phase 1)
-- ---------------------------------------------------------------------------
CREATE TABLE uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  carrier_id    uuid REFERENCES carriers(id),
  uploaded_by   uuid REFERENCES users(id),
  storage_key   text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text,
  byte_size     bigint,
  status        upload_status NOT NULL DEFAULT 'uploaded',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploads_agency_status_idx ON uploads (agency_id, status);

-- Reusable per-carrier mapping (global default has agency_id IS NULL).
CREATE TABLE mapping_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id    uuid NOT NULL REFERENCES carriers(id),
  agency_id     uuid REFERENCES agencies(id),
  name          text NOT NULL,
  format        text NOT NULL,
  field_map     jsonb NOT NULL,
  version       int NOT NULL DEFAULT 1
);
CREATE INDEX mapping_profiles_carrier_idx ON mapping_profiles (carrier_id);

CREATE TABLE import_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  upload_id     uuid NOT NULL REFERENCES uploads(id),
  mapping_profile_id uuid REFERENCES mapping_profiles(id),
  parser        text,
  confidence    numeric(5,4),
  rows_total    int,
  rows_flagged  int,
  status        upload_status NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_batches_upload_idx ON import_batches (agency_id, upload_id);

-- ---------------------------------------------------------------------------
-- Carrier statements & commission ledger (Phases 1–2)
-- ---------------------------------------------------------------------------
CREATE TABLE carrier_statements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  carrier_id    uuid NOT NULL REFERENCES carriers(id),
  import_batch_id uuid REFERENCES import_batches(id),
  statement_date date,
  period_start  date,
  period_end    date,
  total_amount  numeric(14,2),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX carrier_statements_idx ON carrier_statements (agency_id, carrier_id, statement_date);

CREATE TABLE statement_line_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  statement_id  uuid NOT NULL REFERENCES carrier_statements(id),
  policy_id     uuid REFERENCES policies(id),
  policy_number_raw text,
  premium_amount numeric(14,2),
  commission_amount numeric(14,2) NOT NULL,
  commission_pct numeric(6,4),
  is_renewal    boolean,
  raw           jsonb
);
CREATE INDEX sli_statement_idx ON statement_line_items (agency_id, statement_id);
CREATE INDEX sli_policy_idx ON statement_line_items (agency_id, policy_id);

CREATE TABLE commission_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  policy_id     uuid NOT NULL REFERENCES policies(id),
  agent_id      uuid REFERENCES agents(id),
  carrier_id    uuid NOT NULL REFERENCES carriers(id),
  premium_basis numeric(14,2),
  expected_amount numeric(14,2) NOT NULL,
  paid_amount   numeric(14,2) NOT NULL DEFAULT 0,
  agent_advance_amount numeric(14,2) NOT NULL DEFAULT 0,
  status        ledger_status NOT NULL DEFAULT 'expected',
  expected_date date,
  matched_line_item_id uuid REFERENCES statement_line_items(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_status_idx ON commission_ledger (agency_id, status);
CREATE INDEX ledger_agent_idx ON commission_ledger (agency_id, agent_id);

CREATE TABLE reconciliation_exceptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  ledger_id     uuid REFERENCES commission_ledger(id),
  line_item_id  uuid REFERENCES statement_line_items(id),
  kind          text NOT NULL,
  expected      numeric(14,2),
  actual        numeric(14,2),
  delta         numeric(14,2),
  status        exception_status NOT NULL DEFAULT 'open',
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recon_exc_status_idx ON reconciliation_exceptions (agency_id, status);

-- ---------------------------------------------------------------------------
-- Agent statements (Phase 3) & renewals
-- ---------------------------------------------------------------------------
CREATE TABLE agent_payout_statements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  agent_id      uuid NOT NULL REFERENCES agents(id),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  total_premium numeric(14,2),
  total_paid    numeric(14,2),
  total_outstanding numeric(14,2),
  pdf_storage_key text,
  status        payout_status NOT NULL DEFAULT 'draft',
  issued_at     timestamptz,
  UNIQUE (agency_id, agent_id, period_start, period_end)
);

CREATE TABLE agent_payout_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  statement_id  uuid NOT NULL REFERENCES agent_payout_statements(id),
  ledger_id     uuid NOT NULL REFERENCES commission_ledger(id),
  policy_number text,
  premium_amount numeric(14,2),
  commission_paid numeric(14,2),
  commission_outstanding numeric(14,2),
  is_renewal    boolean
);
CREATE INDEX payout_lines_stmt_idx ON agent_payout_lines (agency_id, statement_id);

CREATE TABLE renewals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  policy_id     uuid NOT NULL REFERENCES policies(id),
  due_date      date NOT NULL,
  expected_premium numeric(14,2),
  agency_retains boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'upcoming'
);
CREATE INDEX renewals_due_idx ON renewals (agency_id, due_date);

-- ---------------------------------------------------------------------------
-- Premium-tier tables (Phase 4) & audit
-- ---------------------------------------------------------------------------
CREATE TABLE commission_reserves (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  agent_id      uuid REFERENCES agents(id),
  reserve_pct   numeric(6,4),
  balance       numeric(14,2) NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE factoring_advances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  ledger_id     uuid NOT NULL REFERENCES commission_ledger(id),
  advance_amount numeric(14,2) NOT NULL,
  fee_amount    numeric(14,2) NOT NULL,
  advanced_on   date NOT NULL,
  repaid_on     date,
  status        text NOT NULL DEFAULT 'outstanding'
);

CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  agency_id     uuid,
  actor_user_id uuid,
  action        text NOT NULL,
  entity        text NOT NULL,
  entity_id     uuid,
  diff          jsonb,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_agency_idx ON audit_log (agency_id, at);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- The owner role bypasses RLS (migrations, login, provisioning). The runtime
-- role (inspire_app) is subject to these policies.
-- ---------------------------------------------------------------------------

-- agencies: a tenant sees only itself; ITX sees all.
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY agencies_rls ON agencies
  USING (id = app.current_agency() OR app.is_itx())
  WITH CHECK (id = app.current_agency() OR app.is_itx());

-- users: ITX sees all; agency staff/admin see their agency; agents see only themselves.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_rls ON users
  USING (
    app.is_itx()
    OR (agency_id = app.current_agency()
        AND (app.current_role() <> 'agent' OR id = app.current_user_id()))
  )
  WITH CHECK (app.is_itx() OR agency_id = app.current_agency());

-- mapping_profiles: global defaults (NULL agency) are visible to everyone; agency overrides are scoped.
ALTER TABLE mapping_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY mapping_profiles_rls ON mapping_profiles
  USING (agency_id IS NULL OR agency_id = app.current_agency() OR app.is_itx())
  WITH CHECK (agency_id = app.current_agency() OR app.is_itx());

-- Generic per-tenant isolation for the remaining tenant tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agents','agency_carrier_appointments','commission_rules','policies',
    'premium_transactions','uploads','import_batches','carrier_statements',
    'statement_line_items','reconciliation_exceptions','agent_payout_lines',
    'renewals','commission_reserves','factoring_advances'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_rls ON %I
        USING (agency_id = app.current_agency() OR app.is_itx())
        WITH CHECK (agency_id = app.current_agency() OR app.is_itx())
    $f$, t);
  END LOOP;
END $$;

-- Agent-facing tables: tenant isolation + agents restricted to their own rows.
ALTER TABLE commission_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_rls ON commission_ledger
  USING ((agency_id = app.current_agency() AND app.can_see_agent(agent_id)) OR app.is_itx())
  WITH CHECK (agency_id = app.current_agency() OR app.is_itx());

ALTER TABLE agent_payout_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY payout_stmt_rls ON agent_payout_statements
  USING ((agency_id = app.current_agency() AND app.can_see_agent(agent_id)) OR app.is_itx())
  WITH CHECK (agency_id = app.current_agency() OR app.is_itx());

-- ---------------------------------------------------------------------------
-- Grants for the runtime role
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public, app TO inspire_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO inspire_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO inspire_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO inspire_app;
