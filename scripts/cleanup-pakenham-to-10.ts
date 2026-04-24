#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function cleanup() {
  const before = await sql`
    SELECT track, COUNT(*) as count FROM bets GROUP BY track ORDER BY track
  `;

  console.log(`\n📊 Before cleanup:\n`);
  let beforeTotal = 0;
  for (const b of before) {
    console.log(`   ${b.track}: ${b.count}`);
    beforeTotal += b.count;
  }
  console.log(`   TOTAL: ${beforeTotal}`);

  // Keep only newest 10 Pakenham bets
  const pakenhamCount = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Pakenham'
  `;

  const toDelete = pakenhamCount[0].count - 10;

  if (toDelete > 0) {
    const deleteIds = await sql`
      SELECT id FROM bets
      WHERE track = 'Pakenham'
      ORDER BY created_at ASC
      LIMIT ${toDelete}
    `;

    await sql`
      DELETE FROM bets
      WHERE id = ANY(${deleteIds.map(d => d.id)})
    `;
    console.log(`\n✓ Deleted ${toDelete} old Pakenham duplicates`);
  }

  const after = await sql`
    SELECT track, COUNT(*) as count FROM bets GROUP BY track ORDER BY track
  `;

  console.log(`\n📊 Final bet count:\n`);
  let afterTotal = 0;
  for (const b of after) {
    console.log(`   ${b.track}: ${b.count}`);
    afterTotal += b.count;
  }

  console.log(`\n   TOTAL PENDING: ${afterTotal} bets\n`);

  await sql.end();
}

cleanup().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
