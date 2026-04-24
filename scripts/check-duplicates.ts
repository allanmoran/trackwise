#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function checkDuplicates() {
  const bets = await sql`
    SELECT track, race_num, horse, COUNT(*) as cnt
    FROM bets
    WHERE track = 'Cairns'
    GROUP BY track, race_num, horse
    HAVING COUNT(*) > 1
    ORDER BY race_num, horse
  `;

  console.log('\n🔍 Duplicate Cairns Bets:\n');
  if (bets.length === 0) {
    console.log('   No duplicates found');
  } else {
    for (const b of bets) {
      console.log(`   R${b.race_num}: ${b.horse} (${b.cnt}x)`);
    }
  }

  const totalBets = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Cairns'
  `;

  console.log(`\n   Total Cairns bets: ${totalBets[0].count}\n`);

  await sql.end();
}

checkDuplicates().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
