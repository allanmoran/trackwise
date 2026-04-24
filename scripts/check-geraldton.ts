#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function check() {
  const cairns = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Cairns'
  `;

  const geraldton = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Geraldton'
  `;

  const allBets = await sql`
    SELECT COUNT(*) as count FROM bets
  `;

  console.log('\n📊 Bet Counts:\n');
  console.log(`   Cairns: ${cairns[0].count}`);
  console.log(`   Geraldton: ${geraldton[0].count}`);
  console.log(`   Total: ${allBets[0].count}\n`);

  if (geraldton[0].count > 0) {
    const g = await sql`
      SELECT race_num, horse, stake FROM bets WHERE track = 'Geraldton' LIMIT 5
    `;
    console.log('   Sample Geraldton bets:');
    for (const bet of g) {
      console.log(`     R${bet.race_num}: ${bet.horse} - $${bet.stake}`);
    }
    console.log();
  }

  await sql.end();
}

check().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
