#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function checkStakes() {
  const bets = await sql`
    SELECT id, track, race_num, horse, stake
    FROM bets
    WHERE track = 'Cairns'
    ORDER BY race_num
    LIMIT 20
  `;

  const kellyLogs = await sql`
    SELECT id, track, race_num, horse_name, kelly_stake
    FROM kelly_logs
    WHERE track = 'Cairns'
    ORDER BY race_num
    LIMIT 20
  `;

  console.log('\n📊 Bets Table Stakes:\n');
  let totalStake = 0;
  for (const b of bets) {
    const s = parseFloat(b.stake || 0);
    console.log(`   R${b.race_num} ${b.horse}: $${s.toFixed(2)}`);
    totalStake += s;
  }
  console.log(`   TOTAL: $${totalStake.toFixed(2)}\n`);

  console.log('📊 Kelly Logs Stakes:\n');
  let totalKelly = 0;
  for (const k of kellyLogs) {
    const s = parseFloat(k.kelly_stake || 0);
    console.log(`   R${k.race_num} ${k.horse_name}: $${s.toFixed(2)}`);
    totalKelly += s;
  }
  console.log(`   TOTAL: $${totalKelly.toFixed(2)}\n`);

  await sql.end();
}

checkStakes().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
