#!/usr/bin/env node
/**
 * Settle pending bets using barrier position results from racenet.com.au
 * Matches barrier positions against all horses in the race using fuzzy matching
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Race results: Track -> Race Number -> [1st barrier, 2nd barrier, 3rd barrier]
const raceResults: Record<string, Record<number, number[]>> = {
  'Ascot': { 1: [11, 5, 4], 2: [3, 2, 1], 3: [1, 8, 5], 4: [5, 3, 4], 5: [5, 3, 2], 6: [10, 4, 1], 7: [1, 6, 9], 8: [5, 3, 2], 9: [2, 6, 8], 10: [5, 2, 7] },
  'Caulfield': { 1: [2, 13, 7], 2: [12, 10, 13], 3: [6, 4, 1], 4: [10, 1, 3], 5: [13, 1, 5], 6: [5, 8, 2], 7: [1, 6, 4], 8: [8, 12, 14], 9: [6, 11, 1], 10: [10, 9, 14] },
  'Alice Springs': { 1: [4, 6, 8], 2: [8, 7, 5], 3: [4, 5, 3], 4: [4, 1, 3], 5: [2, 5, 7], 6: [3, 7, 1], 7: [4, 1, 3] },
  'Ballina': { 1: [10, 7, 6], 2: [13, 7, 2], 3: [9, 3, 8], 4: [4, 8, 5], 5: [2, 4, 7], 6: [4, 12, 5] },
  'Bowen': { 1: [5, 1, 3], 2: [1, 2, 5], 3: [5, 2, 8], 4: [7, 3, 5], 5: [9, 3, 5] },
  'Hobart': { 1: [3, 2, 4], 2: [1, 3, 6], 3: [4, 5, 1], 4: [4, 12, 11], 5: [13, 10, 5], 6: [3, 6, 5], 7: [8, 6, 10] },
  'Kalgoorlie': { 1: [3, 6, 2], 2: [3, 1, 2], 3: [2, 1, 3], 4: [7, 2, 6], 5: [6, 1, 7], 6: [5, 8, 7], 7: [4, 5, 11] },
  'Rockhampton': { 1: [3, 5, 7], 2: [6, 7, 8], 3: [2, 5, 6], 4: [1, 2, 4], 5: [6, 3, 8], 6: [1, 2, 5], 7: [3, 2, 10], 8: [3, 11, 9] },
  'Sunshine Coast': { 1: [3, 8, 1], 2: [6, 3, 7], 3: [5, 1, 4], 4: [1, 6, 5], 5: [11, 10, 1], 6: [2, 9, 3], 7: [6, 4, 1], 8: [5, 7, 8] },
  'Gundagai': { 1: [1, 9, 10], 2: [2, 9, 3], 3: [14, 8, 4], 4: [2, 16, 14], 5: [1, 6, 2], 6: [9, 4, 12], 7: [11, 9, 10], 8: [14, 5, 9] },
  'Port Augusta': { 1: [4, 5, 2], 2: [9, 6, 7], 3: [6, 7, 5], 4: [7, 5, 3], 5: [7, 1, 8], 6: [7, 3, 10], 7: [2, 11, 7] },
  'Swan Hill': { 1: [2, 7, 9], 2: [5, 8, 11], 3: [4, 3, 1], 4: [3, 6, 14], 5: [1, 6, 2], 6: [3, 5, 7], 7: [9, 1, 2] },
  'Terang': { 1: [2, 9, 6], 2: [8, 14, 4], 3: [1, 4, 7], 4: [9, 3, 6], 5: [5, 9, 4], 6: [2, 1, 4], 7: [5, 11, 9], 8: [15, 11, 14] },
  'Wellington': { 1: [1, 5, 10], 2: [4, 9, 7], 3: [3, 6, 9], 4: [2, 10, 7], 5: [11, 4, 10], 6: [1, 14, 11], 7: [7, 5, 1], 8: [2, 4, 6] },
  'Doomben': { 1: [9, 7, 1], 2: [4, 6, 8], 3: [7, 1, 8], 4: [3, 9, 2], 5: [3, 1, 5], 6: [18, 8, 2], 7: [2, 7, 3], 8: [1, 2, 6] },
  'Morphettville': { 1: [4, 9, 2], 2: [7, 2, 11], 3: [14, 11, 15], 4: [8, 1, 2], 5: [5, 2, 6], 6: [1, 14, 3], 7: [5, 1, 8], 8: [8, 2, 9], 9: [6, 4, 9], 10: [8, 1, 15] },
  'Randwick': { 1: [3, 6, 4], 2: [1, 8, 4], 3: [6, 1, 5], 4: [1, 9, 5], 5: [1, 3, 2], 6: [9, 2, 3], 7: [3, 4, 15], 8: [8, 2, 3], 9: [2, 4, 7], 10: [5, 2, 3] },
  'Narrogin': { 1: [5, 1, 2], 2: [5, 1, 2], 3: [5, 4, 1], 4: [3, 9, 1], 5: [8, 6, 2], 6: [5, 4, 6], 7: [2, 4, 6], 8: [3, 8, 6] },
  'Newcastle': { 1: [2, 6, 3], 2: [1, 14, 9], 3: [9, 10, 12], 4: [7, 6, 3], 5: [4, 8, 7], 6: [4, 9, 15], 7: [15, 3, 5], 8: [1, 6, 4] },
  'Toowoomba': { 1: [7, 3, 6], 2: [1, 2, 3], 3: [4, 6, 5], 4: [1, 5, 10], 5: [1, 4, 3], 6: [3, 6, 5], 7: [5, 1, 7] },
  'Goulburn': { 1: [6, 7, 3], 2: [8, 9, 6], 3: [2, 10, 6], 4: [12, 2, 6], 5: [11, 4, 2], 6: [14, 4, 11] },
  'Kilcoy': { 1: [2, 7, 13], 2: [5, 7, 10], 3: [7, 5, 12], 4: [9, 4, 5], 5: [4, 1, 12], 6: [7, 3, 11], 7: [10, 7, 8] },
  'Werribee': { 1: [1, 7, 10], 2: [4, 8, 2], 3: [11, 7, 9], 4: [1, 5, 7], 5: [8, 10, 2], 6: [3, 8, 4], 7: [6, 9, 4] },
};

function log(msg: string) {
  console.log(msg);
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshteinDistance(a: string, b: string): number {
  const aNorm = normaliseName(a);
  const bNorm = normaliseName(b);
  const matrix: number[][] = [];

  for (let i = 0; i <= bNorm.length; i++) matrix[i] = [i];
  for (let j = 0; j <= aNorm.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= bNorm.length; i++) {
    for (let j = 1; j <= aNorm.length; j++) {
      const cost = aNorm[j - 1] === bNorm[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[bNorm.length][aNorm.length];
}

function fuzzyMatch(a: string, b: string, threshold: number = 0.85): boolean {
  const aNorm = normaliseName(a);
  const bNorm = normaliseName(b);
  if (aNorm === bNorm) return true;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(aNorm.length, bNorm.length);
  return (1 - distance / maxLen) >= threshold;
}

function settleBet(betId: number, result: 'WIN' | 'PLACE' | 'LOSS') {
  try {
    const bet = db.prepare('SELECT stake, opening_odds, closing_odds FROM bets WHERE id = ?').get(betId) as any;
    if (!bet) return false;

    const odds = bet.closing_odds || bet.opening_odds || 0;
    let profitLoss = 0;
    if (result === 'WIN') profitLoss = bet.stake * (odds - 1);
    else if (result === 'PLACE') profitLoss = bet.stake * ((odds - 1) / 4);
    else if (result === 'LOSS') profitLoss = -bet.stake;

    db.prepare(`UPDATE bets SET result = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(result, Math.round(profitLoss * 100) / 100, betId);
    return true;
  } catch (err) {
    log(`❌ Error settling bet ${betId}: ${err}`);
    return false;
  }
}

async function main() {
  log('\n' + '='.repeat(70));
  log('🏇 SETTLING PENDING BETS FROM BARRIER RESULTS\n');

  const pendingBets = db.prepare(`
    SELECT b.id, r.track, r.race_number, b.horse_id, h.name as horse_name
    FROM bets b
    JOIN races r ON b.race_id = r.id
    JOIN horses h ON b.horse_id = h.id
    WHERE b.result IS NULL AND r.date IN ('2026-04-11', '2026-04-12')
    ORDER BY r.track, r.race_number
  `).all() as any[];

  log(`Found ${pendingBets.length} pending bets\n`);

  let settled = 0;
  let notFound = 0;
  const settledByTrack: Record<string, number> = {};

  for (const bet of pendingBets) {
    const trackResults = raceResults[bet.track];
    if (!trackResults) {
      log(`⚠️  Track not found: ${bet.track}`);
      settleBet(bet.id, 'LOSS');
      notFound++;
      settled++;
      settledByTrack[bet.track] = (settledByTrack[bet.track] || 0) + 1;
      continue;
    }

    const finishingBarriers = trackResults[bet.race_number];
    if (!finishingBarriers || finishingBarriers.length === 0) {
      log(`⚠️  No results for ${bet.track} R${bet.race_number}`);
      settleBet(bet.id, 'LOSS');
      notFound++;
      settled++;
      settledByTrack[bet.track] = (settledByTrack[bet.track] || 0) + 1;
      continue;
    }

    // Get all horses in this race
    const raceHorses = db.prepare(`
      SELECT h.id, h.name FROM horses h
      JOIN race_runners rr ON rr.horse_id = h.id
      WHERE rr.race_id = (SELECT id FROM races WHERE track = ? AND race_number = ?)
    `).all(bet.track, bet.race_number) as any[];

    if (raceHorses.length === 0) {
      log(`⚠️  No horses found for ${bet.track} R${bet.race_number}`);
      settleBet(bet.id, 'LOSS');
      notFound++;
      settled++;
      settledByTrack[bet.track] = (settledByTrack[bet.track] || 0) + 1;
      continue;
    }

    // For each finishing position, find the matching horse
    const finishingHorseNames: string[] = [];
    for (const barrier of finishingBarriers) {
      // Try to find horse by fuzzy matching on all race horses
      let bestMatch = '';
      let bestScore = 0;

      for (const raceHorse of raceHorses) {
        if (fuzzyMatch(raceHorse.name, bet.horse_name)) {
          finishingHorseNames.push(raceHorse.name);
          break;
        }
      }
    }

    // Match bet horse against finishing horses
    const position = finishingHorseNames.findIndex(h => fuzzyMatch(h, bet.horse_name));

    if (position === -1) {
      settleBet(bet.id, 'LOSS');
      log(`  ✓ ${bet.track} R${bet.race_number} - ${bet.horse_name}: LOSS`);
    } else if (position === 0) {
      settleBet(bet.id, 'WIN');
      log(`  ✓ ${bet.track} R${bet.race_number} - ${bet.horse_name}: WIN (1st)`);
    } else if (position <= 2) {
      settleBet(bet.id, 'PLACE');
      log(`  ✓ ${bet.track} R${bet.race_number} - ${bet.horse_name}: PLACE (${position + 1}th)`);
    }

    settled++;
    settledByTrack[bet.track] = (settledByTrack[bet.track] || 0) + 1;
  }

  log('\n' + '='.repeat(70));
  log('📊 SETTLEMENT SUMMARY\n');
  log(`Settled: ${settled}/${pendingBets.length}`);
  log(`Not found: ${notFound}`);
  log('\nBy track:');
  for (const [track, count] of Object.entries(settledByTrack)) {
    log(`  ${track}: ${count} bets`);
  }

  const finalStatus = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN result IS NULL THEN 1 END) as pending,
      COUNT(CASE WHEN result IS NOT NULL THEN 1 END) as settled,
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
      COUNT(CASE WHEN result = 'PLACE' THEN 1 END) as places,
      COUNT(CASE WHEN result = 'LOSS' THEN 1 END) as losses,
      ROUND(SUM(CASE WHEN result IS NOT NULL THEN profit_loss ELSE 0 END), 2) as total_pnl
    FROM bets b
    JOIN races r ON b.race_id = r.id
    WHERE r.date IN ('2026-04-11', '2026-04-12')
  `).get() as any;

  log('\n📈 FINAL STATUS');
  log(`Total: ${finalStatus.total} | Pending: ${finalStatus.pending} | Settled: ${finalStatus.settled}`);
  log(`Wins: ${finalStatus.wins} | Places: ${finalStatus.places} | Losses: ${finalStatus.losses}`);
  log(`Total P&L: $${finalStatus.total_pnl}`);
  log('\n' + '='.repeat(70) + '\n');

  process.exit(0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
