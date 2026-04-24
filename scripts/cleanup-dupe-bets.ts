#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function cleanup() {
  // Check current state
  const before = await sql`
    SELECT track, COUNT(*) as count FROM bets GROUP BY track ORDER BY track
  `;

  console.log(`\n📊 Before cleanup:\n`);
  for (const b of before) {
    console.log(`   ${b.track}: ${b.count}`);
  }

  // Delete old Sale bets (test data)
  await sql`
    DELETE FROM bets WHERE track = 'Sale'
  `;

  // Delete oldest 10 Kyneton bets (keep newest 10)
  const kynToDelete = await sql`
    SELECT id FROM bets
    WHERE track = 'Kyneton'
    ORDER BY created_at ASC
    LIMIT 10
  `;

  if (kynToDelete.length > 0) {
    await sql`
      DELETE FROM bets
      WHERE id = ANY(${kynToDelete.map(k => k.id)})
    `;
  }

  // Check final state
  const after = await sql`
    SELECT track, COUNT(*) as count FROM bets GROUP BY track ORDER BY track
  `;

  console.log(`\n✓ After cleanup:\n`);
  for (const b of after) {
    console.log(`   ${b.track}: ${b.count}`);
  }

  let total = 0;
  for (const b of after) {
    total += b.count;
  }
  console.log(`\n   TOTAL: ${total} bets\n`);

  await sql.end();
}

cleanup().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
