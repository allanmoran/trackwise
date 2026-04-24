#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function updateBankRetroactively() {
  const today = new Date().toISOString().split('T')[0];

  // Get all bets with results
  const bets = await sql`
    SELECT id, stake, odds, result
    FROM bets
    WHERE result IS NOT NULL
  `;

  let totalPnL = 0;

  for (const bet of bets) {
    const stake = parseFloat(bet.stake);
    const odds = parseFloat(bet.odds);
    let pnl = 0;

    if (bet.result === 'WIN') {
      pnl = stake * (odds - 1);
    } else if (bet.result === 'PLACE') {
      pnl = stake * ((odds - 1) * 0.25);
    } else if (bet.result === 'LOSS') {
      pnl = -stake;
    }

    totalPnL += pnl;
  }

  // Starting bank is $200
  const newBank = 200 + totalPnL;

  console.log(`\n💰 Bank Update:\n`);
  console.log(`   Bets processed: ${bets.length}`);
  console.log(`   Total P&L: $${totalPnL.toFixed(2)}`);
  console.log(`   New bank: $${Math.max(0, newBank).toFixed(2)}`);

  // Update session_bank for today
  await sql`
    INSERT INTO session_bank (date, bank, total_staked)
    VALUES (${today}, ${Math.max(0, newBank)}, 0)
    ON CONFLICT (date) DO UPDATE SET
      bank = ${Math.max(0, newBank)}
  `;

  console.log(`   ✓ Updated\n`);

  await sql.end();
}

updateBankRetroactively().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
