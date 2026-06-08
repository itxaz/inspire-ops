// Idempotent-ish demo seed. Runs on the privileged pool (bypasses RLS).
// Creates an ITX admin, two carriers, one demo agency with an admin + agent,
// a commission rule, a policy, and a projected ledger row.
import { adminPool, closePools } from '../db.js';
import { hashPassword } from '../auth/password.js';
import { computeExpectedCommission, agentAdvance } from '../domain/commission.js';

async function seed(): Promise<void> {
  const pw = await hashPassword('password123');

  // ITX super-admin (no agency).
  await adminPool.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('itx@inspirecrm.test', $1, 'itx_admin')
     ON CONFLICT (email) DO NOTHING`,
    [pw],
  );

  // Carriers (global).
  const carrier = await adminPool.query<{ id: string }>(
    `INSERT INTO carriers (name, naic_code) VALUES ('Great West Cargo', '12345')
     ON CONFLICT DO NOTHING RETURNING id`,
  );
  const carrierId =
    carrier.rows[0]?.id ??
    (await adminPool.query<{ id: string }>(`SELECT id FROM carriers WHERE name='Great West Cargo'`)).rows[0]!.id;
  await adminPool.query(
    `INSERT INTO carriers (name, naic_code) VALUES ('Transit Mutual', '67890') ON CONFLICT DO NOTHING`,
  );

  // Demo agency + admin + agent.
  let agencyId = (
    await adminPool.query<{ id: string }>(`SELECT id FROM agencies WHERE name='Demo Transit Agency'`)
  ).rows[0]?.id;
  if (!agencyId) {
    agencyId = (
      await adminPool.query<{ id: string }>(
        `INSERT INTO agencies (name, tier) VALUES ('Demo Transit Agency','base') RETURNING id`,
      )
    ).rows[0]!.id;
  }
  await adminPool.query(
    `INSERT INTO users (agency_id, email, password_hash, role)
     VALUES ($1, 'admin@demo.test', $2, 'agency_admin')
     ON CONFLICT (email) DO NOTHING`,
    [agencyId, pw],
  );

  let agentId = (
    await adminPool.query<{ id: string }>(`SELECT id FROM agents WHERE agency_id=$1 AND email='jane@demo.test'`, [
      agencyId,
    ])
  ).rows[0]?.id;
  if (!agentId) {
    agentId = (
      await adminPool.query<{ id: string }>(
        `INSERT INTO agents (agency_id, display_name, email, default_split)
         VALUES ($1, 'Jane Agent', 'jane@demo.test', 0.6) RETURNING id`,
        [agencyId],
      )
    ).rows[0]!.id;
  }
  // Agent portal login linked to the agent record.
  await adminPool.query(
    `INSERT INTO users (agency_id, email, password_hash, role, agent_id)
     VALUES ($1, 'jane@demo.test', $2, 'agent', $3)
     ON CONFLICT (email) DO NOTHING`,
    [agencyId, pw, agentId],
  );

  // Appointment + commission rule (upfront, agency retains renewals).
  await adminPool.query(
    `INSERT INTO agency_carrier_appointments (agency_id, carrier_id, carrier_code)
     VALUES ($1, $2, 'DEMO-001') ON CONFLICT (agency_id, carrier_id) DO NOTHING`,
    [agencyId, carrierId],
  );
  const rule = { basis: 'upfront_first_term' as const, first_term_pct: 0.15, renewal_pct: 0.05, agency_retains_renewal: true };
  await adminPool.query(
    `INSERT INTO commission_rules (agency_id, carrier_id, product_line, basis, first_term_pct, renewal_pct, agency_retains_renewal)
     SELECT $1,$2,'cargo','upfront_first_term',0.15,0.05,true
     WHERE NOT EXISTS (SELECT 1 FROM commission_rules WHERE agency_id=$1 AND carrier_id=$2 AND product_line='cargo')`,
    [agencyId, carrierId],
  );

  // A policy + projected ledger row.
  let policyId = (
    await adminPool.query<{ id: string }>(
      `SELECT id FROM policies WHERE agency_id=$1 AND carrier_id=$2 AND policy_number='POL-1001'`,
      [agencyId, carrierId],
    )
  ).rows[0]?.id;
  if (!policyId) {
    policyId = (
      await adminPool.query<{ id: string }>(
        `INSERT INTO policies (agency_id, carrier_id, agent_id, policy_number, insured_name, product_line, effective_date, term_months)
         VALUES ($1,$2,$3,'POL-1001','Acme Freight','cargo', CURRENT_DATE, 12) RETURNING id`,
        [agencyId, carrierId, agentId],
      )
    ).rows[0]!.id;

    const premium = 10000;
    const { expectedAmount } = computeExpectedCommission(rule, premium, false);
    const advance = agentAdvance(expectedAmount, 0.6);
    await adminPool.query(
      `INSERT INTO premium_transactions (agency_id, policy_id, txn_type, premium_amount, txn_date)
       VALUES ($1,$2,'new',$3,CURRENT_DATE)`,
      [agencyId, policyId, premium],
    );
    await adminPool.query(
      `INSERT INTO commission_ledger
         (agency_id, policy_id, agent_id, carrier_id, premium_basis, expected_amount, agent_advance_amount, expected_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CURRENT_DATE + INTERVAL '45 days')`,
      [agencyId, policyId, agentId, carrierId, premium, expectedAmount, advance],
    );
  }

  console.log('Seed complete.');
  console.log('  ITX admin:    itx@inspirecrm.test / password123');
  console.log('  Agency admin: admin@demo.test / password123');
  console.log('  Agent:        jane@demo.test / password123');
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
