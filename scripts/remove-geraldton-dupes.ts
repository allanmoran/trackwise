#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function removeDupes() {
  // Find Geraldton duplicates
  const dupes = await sql`
    SELECT track, race_num, horse, COUNT(*) as cnt
    FROM bets
    WHERE track = 'Geraldton'
    GROUP BY track, race_num, horse
    HAVING COUNT(*) > 1
  `;

  console.log(`\n🔍 Found ${dupes.length} duplicate Geraldton bets\n`);
  for (const d of dupes) {
    console.log(`   R${d.race_num}: ${d.horse} (${d.cnt}x)`);
  }

  // Keep only the newest, delete old ones
  const bets = await sql`
    SELECT id, track, race_num, horse, created_at,
           ROW_NUMBER() OVER (PARTITION BY track, race_num, horse ORDER BY created_at DESC) as rn
    FROM bets
    WHERE track = 'Geraldton'
  `;

  const toDelete = bets.filter(b => b.rn > 1).map(b => b.id);

  if (toDelete.length > 0) {
    await sql`
      DELETE FROM bets
      WHERE id = ANY(${toDelete})
    `;
    console.log(`\n✓ Deleted ${toDelete.length} old duplicate bets\n`);
  }

  const remaining = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Geraldton'
  `;

  console.log(`   Remaining Geraldton bets: ${remaining[0].count}\n`);

  await sql.end();
}

removeDupes().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
