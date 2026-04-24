#!/usr/bin/env node
/**
 * Settle pending bets using actual race results
 * Parses finishing positions and matches to pending bets
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Race results data: Track -> Race Number -> [1st place horse name, 2nd place horse name, 3rd place horse name]
const raceResults: Record<string, Record<number, string[]>> = {
  'Alice Springs': {
    1: ['Verbosity', 'Pompeii Empire', 'Limited Risk'],
    2: ['Mr Jones', 'Dolce D\'amour', 'Lucky Fortuna'],
    3: ['Pub Crawl', 'Our Squamosa', 'Bon\'s A Lad'],
    4: ['Delago Lad', 'Flying Yishu', 'Rewards And More']
    // R5-R7: no results provided, will default to LOSS
  },
  // Other tracks: no results provided, will default to LOSS
};

function log(msg: string) {
  console.log(msg);
}

function settleBet(betId: number, result: 'WIN' | 'PLACE' | 'LOSS') {
  try {
    const bet = db.prepare('SELECT stake, opening_odds, closing_odds FROM bets WHERE id = ?').get(betId) as any;
    if (!bet) return false;

    const odds = bet.closing_odds || bet.opening_odds || 0;
    let profitLoss = 0;

    if (result === 'WIN') {
      profitLoss = bet.stake * (odds - 1);
    } else if (result === 'PLACE') {
      const placeOdds = 1 + (odds - 1) / 4;
      profitLoss = bet.stake * (placeOdds - 1);
    } else if (result === 'LOSS') {
      profitLoss = -bet.stake;
    }

    db.prepare(`
      UPDATE bets
      SET result = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(result, Math.round(profitLoss * 100) / 100, betId);

    return true;
  } catch (err) {
    log(`❌ Error settling bet ${betId}: ${err}`);
    return false;
  }
}

async function main() {
  log('\n' + '='.repeat(70));
  log('🏇 SETTLING PENDING BETS FROM RACE RESULTS\n');

  // Get all pending bets
  const pendingBets = db.prepare(`
    SELECT b.id, r.track, r.race_number, b.horse_id, h.name as horse_name
    FROM bets b
    JOIN races r ON b.race_id = r.id
    JOIN horses h ON b.horse_id = h.id
    WHERE b.result IS NULL AND r.date = '2026-04-12'
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

    const finishingHorses = trackResults[bet.race_number];
    if (!finishingHorses || finishingHorses.length === 0) {
      log(`⚠️  No results for ${bet.track} R${bet.race_number} - marking as LOSS`);
      settleBet(bet.id, 'LOSS');
      notFound++;
      settled++;
      settledByTrack[bet.track] = (settledByTrack[bet.track] || 0) + 1;
      continue;
    }

    // Match by horse name (case-insensitive, fuzzy match)
    const position = finishingHorses.findIndex(h =>
      h.toLowerCase().replace(/[^a-z0-9]/g, '') ===
      bet.horse_name.toLowerCase().replace(/[^a-z0-9]/g, '')
    );

    if (position === -1) {
      // Horse didn't place in top 3
      settleBet(bet.id, 'LOSS');
      log(`  ✓ ${bet.track} R${bet.race_number} - ${bet.horse_name}: LOSS`);
    } else if (position === 0) {
      // First place = WIN
      settleBet(bet.id, 'WIN');
      log(`  ✓ ${bet.track} R${bet.race_number} - ${bet.horse_name}: WIN (1st)`);
    } else if (position <= 2) {
      // 2nd or 3rd place = PLACE
      settleBet(bet.id, 'PLACE');
      log(`  ✓ ${bet.track} R${bet.race_number} - ${bet.horse_name}: PLACE (${position + 1}th)`);
    }

    settled++;
    settledByTrack[bet.track] = (settledByTrack[bet.track] || 0) + 1;
  }

  // Summary
  log('\n' + '='.repeat(70));
  log('📊 SETTLEMENT SUMMARY\n');
  log(`Settled: ${settled}/${pendingBets.length}`);
  log(`Not found: ${notFound}`);
  log('\nBy track:');
  for (const [track, count] of Object.entries(settledByTrack)) {
    log(`  ${track}: ${count} bets`);
  }

  // Final DB check
  const finalStatus = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN result IS NULL THEN 1 END) as pending,
      COUNT(CASE WHEN result IS NOT NULL THEN 1 END) as settled,
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
      COUNT(CASE WHEN result = 'PLACE' THEN 1 END) as places,
      COUNT(CASE WHEN result = 'LOSS' THEN 1 END) as losses,
      ROUND(SUM(CASE WHEN result IS NOT NULL THEN profit_loss ELSE 0 END), 2) as total_pnl
    FROM bets
    WHERE placed_at >= '2026-04-12'
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
