// Minimal forward-only migration runner. Applies every *.sql file in ./migrations
// in lexical order exactly once, tracked in the schema_migrations table.
// Runs on the privileged (owner) connection.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminPool, closePools } from '../db.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function run(): Promise<void> {
  await adminPool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await adminPool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await adminPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✓ applied ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ failed ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }
  console.log(count === 0 ? 'Already up to date.' : `Applied ${count} migration(s).`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
