#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function restore() {
  const today = new Date().toISOString().split('T')[0];
  
  const saleBets = [
    { track: 'Sale', raceNum: 2, horse: 'LAUBERHORN', jockey: 'Unknown', trainer: 'Unknown', odds: 1.70, stake: 66.00, result: 'WIN', marketId: 'sale-r2-1', selectionId: 'sale-r2-1' },
    { track: 'Sale', raceNum: 3, horse: 'She\'s Got The Cash', jockey: 'Unknown', trainer: 'Unknown', odds: 4.80, stake: 66.00, result: 'PLACE', marketId: 'sale-r3-1', selectionId: 'sale-r3-1' },
    { track: 'Sale', raceNum: 8, horse: 'Sabi Storm', jockey: 'Unknown', trainer: 'Unknown', odds: 3.80, stake: 66.00, result: 'LOSS', marketId: 'sale-r8-1', selectionId: 'sale-r8-1' }
  ];

  console.log(`\n✓ Restoring 3 Sale bets:\n`);

  for (const bet of saleBets) {
    await sql`
      INSERT INTO bets (track, race_num, horse, jockey, trainer, odds, stake, result, status, market_id, selection_id, date)
      VALUES (${bet.track}, ${bet.raceNum}, ${bet.horse}, ${bet.jockey}, ${bet.trainer}, ${bet.odds}, ${bet.stake}, ${bet.result}, 'COMPLETED', ${bet.marketId}, ${bet.selectionId}, ${today})
    `;
    console.log(`   R${bet.raceNum}: ${bet.horse} (${bet.result}) - $${bet.stake}`);
  }

  const all = await sql`
    SELECT track, COUNT(*) as count FROM bets GROUP BY track ORDER BY track
  `;

  console.log(`\n📊 Current bets:\n`);
  for (const b of all) {
    console.log(`   ${b.track}: ${b.count}`);
  }

  let total = 0;
  for (const b of all) {
    total += b.count;
  }
  console.log(`\n   TOTAL: ${total} bets\n`);

  await sql.end();
}

restore().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
