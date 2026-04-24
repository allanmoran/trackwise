#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function check() {
  const kyneton = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Kyneton'
  `;

  const all = await sql`
    SELECT track, COUNT(*) as count FROM bets GROUP BY track ORDER BY track
  `;

  console.log('\n📊 Bets by Track:\n');
  for (const b of all) {
    console.log(`   ${b.track}: ${b.count}`);
  }

  console.log(`\n   Kyneton: ${kyneton[0].count}\n`);

  if (kyneton[0].count > 0) {
    const sample = await sql`
      SELECT race_num, horse, stake FROM bets WHERE track = 'Kyneton' LIMIT 3
    `;
    console.log('   Sample Kyneton bets:');
    for (const s of sample) {
      console.log(`     R${s.race_num}: ${s.horse} - $${s.stake}`);
    }
    console.log();
  }

  await sql.end();
}

check().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
