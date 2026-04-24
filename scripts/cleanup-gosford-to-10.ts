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

  // Keep only newest 10 Gosford bets
  const gosfToDelete = await sql`
    SELECT id FROM bets
    WHERE track = 'Gosford'
    ORDER BY created_at ASC
    LIMIT (SELECT COUNT(*) - 10 FROM bets WHERE track = 'Gosford')
  `;

  if (gosfToDelete.length > 0) {
    await sql`
      DELETE FROM bets
      WHERE id = ANY(${gosfToDelete.map(g => g.id)})
    `;
    console.log(`\n✓ Deleted ${gosfToDelete.length} old Gosford duplicates`);
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

  console.log(`\n   TOTAL: ${afterTotal} bets\n`);

  await sql.end();
}

cleanup().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
