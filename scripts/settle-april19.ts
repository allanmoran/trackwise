#!/usr/bin/env node
/**
 * Settle April 19, 2026 bets using barrier results + form card data
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  const an = a.length, bn = b.length;
  const dp: number[][] = Array(an + 1).fill(0).map(() => Array(bn + 1).fill(0));
  for (let i = 0; i <= an; i++) dp[i][0] = i;
  for (let j = 0; j <= bn; j++) dp[0][j] = j;
  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[an][bn];
}

function fuzzyMatch(a: string, b: string, threshold = 0.85): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const an = norm(a), bn = norm(b);
  const dist = levenshteinDistance(an, bn);
  const maxLen = Math.max(an.length, bn.length);
  const similarity = 1 - (dist / maxLen);
  return similarity >= threshold;
}

// Barrier results for April 19
const barrierResults: Record<string, Record<number, number[]>> = {
  'Geraldton': { 1: [8, 6, 9], 2: [3, 2, 4], 3: [6, 3, 9], 4: [6, 7, 2], 5: [6, 3, 11], 6: [8, 9, 11] },
  'Grafton': { 1: [1, 7, 3], 2: [8, 7, 9], 3: [4, 10, 3], 4: [7, 6, 11], 5: [2, 1, 9] },
  'Naracoorte': { 1: [3, 9, 6], 2: [6, 10, 3], 3: [2, 5, 9], 4: [2, 9, 4], 5: [4, 5, 1], 6: [13, 12, 2], 7: [2, 10, 6] },
  'Sale': { 1: [5, 6, 3], 2: [8, 6, 2], 3: [8, 5, 4], 4: [9, 6, 8], 5: [6, 7, 8], 6: [5, 2, 3], 7: [5, 6, 11], 8: [9, 3, 2] },
  'Sunshine Coast': { 1: [6, 3, 7], 2: [6, 3, 5], 3: [5, 3, 15], 4: [5, 6, 12], 5: [8, 7, 12], 6: [3, 5, 2], 7: [9, 13, 5], 8: [4, 15, 11] },
  'Terang': { 1: [8, 1, 5], 2: [4, 1, 0], 3: [4, 2, 7], 4: [2, 8, 1], 5: [1, 0, 0], 6: [4, 5, 1], 7: [2, 8, 3] },
  'Wagga': { 1: [4, 7, 2], 2: [8, 10, 6], 3: [1, 5, 8], 4: [5, 8, 4], 5: [1, 4, 3], 6: [6, 11, 7], 7: [6, 7, 12], 8: [7, 12, 3] }
};

async function settleBets() {
  console.log('\n' + '='.repeat(70));
  console.log('🏇 SETTLING APRIL 19, 2026 BETS\n');

  // Get all bets for April 19
  const bets = db.prepare(`
    SELECT
      b.id,
      b.race_id,
      b.horse_id,
      b.bet_type,
      b.stake,
      b.status,
      h.name as horse_name,
      r.track,
      r.race_number,
      rr.barrier
    FROM bets b
    JOIN races r ON b.race_id = r.id
    JOIN horses h ON b.horse_id = h.id
    LEFT JOIN race_runners rr ON rr.race_id = r.id AND rr.horse_id = h.id
    WHERE r.date = '2026-04-19'
    ORDER BY r.track, r.race_number
  `).all();

  if (bets.length === 0) {
    console.log('❌ No bets found for April 19');
    return;
  }

  console.log(`📋 Found ${bets.length} bets to settle\n`);

  let settled = 0, wins = 0, places = 0, losses = 0;
  let totalStake = 0, totalReturn = 0;

  for (const bet of bets) {
    const results = barrierResults[bet.track]?.[bet.race_number];

    if (!results) {
      console.log(`⚠️  ${bet.track} R${bet.race_number}: No barrier results`);
      continue;
    }

    // Get all horses in the finishing barriers to find a match
    const finishingHorses = db.prepare(`
      SELECT DISTINCT h.name, rr.barrier
      FROM race_runners rr
      JOIN horses h ON rr.horse_id = h.id
      WHERE rr.race_id = ? AND rr.barrier IN (${results.join(',')})
    `).all(bet.race_id);

    let result = 'LOSS';
    let position = -1;

    // Try to match bet horse with finishing horses
    for (const [idx, barrier] of results.entries()) {
      const finishingHorse = finishingHorses.find(h => h.barrier === barrier);
      if (finishingHorse && fuzzyMatch(bet.horse_name, finishingHorse.name)) {
        position = idx;
        result = idx === 0 ? 'WIN' : 'PLACE';
        break;
      }
    }

    const status = result === 'WIN' || result === 'PLACE' ? 'SETTLED_WIN' : 'SETTLED_LOSS';
    const multiplier = result === 'WIN' ? (bet.bet_type === 'WIN' ? bet.odds || 1 : ((bet.odds || 1) - 1) / 4 + 1) : 0;
    const returnAmount = result !== 'LOSS' ? bet.stake * multiplier : 0;
    const profitLoss = returnAmount - bet.stake;

    // Update bet
    db.prepare(`
      UPDATE bets SET status = ?, result = ?, return_amount = ?, profit_loss = ?, settled_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, result, returnAmount, profitLoss, bet.id);

    totalStake += bet.stake;
    totalReturn += returnAmount;

    console.log(`  ${result === 'WIN' ? '✓' : result === 'PLACE' ? '→' : '✗'} ${bet.track} R${bet.race_number}: ${bet.horse_name} (B${bet.barrier}) - ${result}`);

    if (result === 'WIN') wins++;
    if (result === 'PLACE') places++;
    if (result === 'LOSS') losses++;
    settled++;
  }

  const roi = ((totalReturn - totalStake) / totalStake * 100).toFixed(2);
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 SETTLEMENT COMPLETE`);
  console.log(`   Settled: ${settled} bets (${wins} WIN, ${places} PLACE, ${losses} LOSS)`);
  console.log(`   Stake: $${totalStake.toFixed(2)}`);
  console.log(`   Return: $${totalReturn.toFixed(2)}`);
  console.log(`   P&L: $${(totalReturn - totalStake).toFixed(2)} (${roi}% ROI)`);
  console.log('\n' + '='.repeat(70) + '\n');
}

settleBets().catch(err => {
  console.error('❌ Settlement error:', err.message);
  process.exit(1);
});
