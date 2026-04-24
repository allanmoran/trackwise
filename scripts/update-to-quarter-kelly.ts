#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function updateToQuarterKelly() {
  const bank = 2500; // Current bank
  
  // Get all current bets
  const bets = await sql`
    SELECT id, confidence, odds, stake
    FROM bets
    WHERE track IN ('Cairns', 'Geraldton', 'Gosford')
  `;

  console.log(`\n📊 Recalculating to Quarter Kelly:\n`);
  console.log(`   Processing ${bets.length} bets...\n`);

  let totalOldStake = 0;
  let totalNewStake = 0;

  for (const bet of bets) {
    const confidence = bet.confidence;
    const odds = parseFloat(bet.odds);
    
    // Quarter Kelly calculation
    const p = confidence / 100;
    const b = odds - 1;
    const q = 1 - p;
    const edge = (p * odds) - 1;
    
    let newStake = 0;
    if (edge > 0) {
      const kellyFraction = (b * p - q) / b;
      const quarterKelly = kellyFraction * 0.25; // Quarter Kelly
      newStake = Math.round((bank * quarterKelly) * 100) / 100;
    }

    totalOldStake += parseFloat(bet.stake);
    totalNewStake += newStake;

    // Update bet with new stake
    await sql`
      UPDATE bets SET stake = ${newStake}
      WHERE id = ${bet.id}
    `;
  }

  console.log(`   Old total staked: $${totalOldStake.toFixed(2)}`);
  console.log(`   New total staked: $${totalNewStake.toFixed(2)}`);
  console.log(`   Reduction: $${(totalOldStake - totalNewStake).toFixed(2)} (${((1 - totalNewStake/totalOldStake) * 100).toFixed(0)}%)\n`);

  await sql.end();
}

updateToQuarterKelly().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
