#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function checkBets() {
  const bets = await sql`
    SELECT id, track, race_num, horse, stake, odds, result, status, created_at
    FROM bets
    WHERE result IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const bank = await sql`
    SELECT date, bank
    FROM session_bank
    ORDER BY date DESC
    LIMIT 5
  `;

  console.log('\n📊 Recent Bets with Results:\n');
  for (const b of bets) {
    const pnl = b.result === 'WIN' ? parseFloat(b.stake) * (parseFloat(b.odds) - 1) :
                b.result === 'PLACE' ? parseFloat(b.stake) * ((parseFloat(b.odds) - 1) * 0.25) :
                -parseFloat(b.stake);
    console.log(`${b.track} R${b.race_num} | ${b.horse} | ${b.result} | Stake: $${b.stake} | Odds: ${b.odds} | P&L: $${pnl.toFixed(2)}`);
  }

  console.log('\n💰 Bank History:\n');
  for (const row of bank) {
    console.log(`${row.date}: $${row.bank}`);
  }

  await sql.end();
}

checkBets().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
