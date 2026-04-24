#!/usr/bin/env node

import Database from 'better-sqlite3';

const db = new Database('./data/trackwise.db');

console.log('🏁 DAILY SETTLEMENT SCRAPER - 8PM RUN');
console.log('=====================================\n');

// Get active bets that might have settled
const activeBets = db.prepare(`
  SELECT b.id, b.race_id, b.horse_id, h.name as horse
  FROM bets b
  LEFT JOIN horses h ON b.horse_id = h.id
  WHERE b.status = 'ACTIVE'
  AND b.placed_at >= datetime('now', '-7 days')
  ORDER BY b.placed_at DESC
`).all();

console.log(`Found ${activeBets.length} active bets to check for settlement\n`);

let settled = 0;
let updated = 0;
let errors = 0;

// Check each race for results
for (const bet of activeBets) {
  try {
    // Get race details
    const race = db.prepare('SELECT id, track, race_number, date FROM races WHERE id = ?').get(bet.race_id);
    if (!race) continue;

    // Check if race runner has a result
    const result = db.prepare(`
      SELECT rr.id, rr.result, rr.finishing_position, rr.starting_odds
      FROM race_runners rr
      WHERE rr.race_id = ? AND rr.horse_id = ?
    `).get(bet.race_id, bet.horse_id);

    if (result && result.result) {
      // Calculate profit/loss based on result
      let profitLoss = 0;

      if (result.result === 'WIN') {
        // Won: stake × (odds - 1)
        profitLoss = bet.stake * (result.starting_odds - 1);
      } else if (result.result === 'PLACE') {
        // Placed: stake × (place_odds - 1), typically ~1/4 of win odds
        profitLoss = bet.stake * ((result.starting_odds - 1) / 4);
      } else {
        // Lost: -stake
        profitLoss = -bet.stake;
      }

      // Update bet with result
      db.prepare(`
        UPDATE bets
        SET status = 'SETTLED',
            result = ?,
            profit_loss = ?,
            settled_at = datetime('now')
        WHERE id = ?
      `).run(result.result, profitLoss, bet.id);

      settled++;
      console.log(`✅ Settled: ${bet.horse} (${race.track} R${race.race_number}) - ${result.result === 'WIN' ? 'WON' : result.result === 'PLACE' ? 'PLACED' : 'LOST'} (${profitLoss > 0 ? '+' : ''}$${profitLoss.toFixed(2)})`);
    }
  } catch (err) {
    errors++;
    console.log(`⚠️  Error processing bet ${bet.id}: ${err.message}`);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`📊 SETTLEMENT SUMMARY\n`);

// Get current status
const summary = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM bets WHERE status = 'SETTLED' AND placed_at >= datetime('now', '-7 days')) as settled_count,
    (SELECT COUNT(*) FROM bets WHERE status = 'ACTIVE' AND placed_at >= datetime('now', '-7 days')) as active_count,
    (SELECT ROUND(SUM(COALESCE(profit_loss, 0)), 2) FROM bets WHERE status = 'SETTLED' AND placed_at >= datetime('now', '-7 days')) as total_pl,
    (SELECT SUM(stake) FROM bets WHERE placed_at >= datetime('now', '-7 days')) as total_stake
`).get();

console.log(`Settled: ${summary.settled_count} bets`);
console.log(`Active: ${summary.active_count} bets`);
console.log(`\nProfit/Loss: $${summary.total_pl || 0}`);
console.log(`ROI: ${summary.total_stake > 0 ? (((summary.total_pl || 0) / summary.total_stake * 100).toFixed(1)) : 0}%`);

// Win rate
const winStats = db.prepare(`
  SELECT
    SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN result = 'PLACE' THEN 1 ELSE 0 END) as places,
    COUNT(*) as total
  FROM bets
  WHERE status = 'SETTLED' AND placed_at >= datetime('now', '-7 days')
`).get();

if (winStats.total > 0) {
  console.log(`\nWin Rate: ${(winStats.wins / winStats.total * 100).toFixed(1)}% (${winStats.wins}/${winStats.total})`);
  if (winStats.places > 0) {
    console.log(`Place Rate: ${(winStats.places / winStats.total * 100).toFixed(1)}%`);
  }
}

console.log(`\n📍 Status Checked: ${new Date().toLocaleString()}`);
console.log(`\n✅ Daily settlement check complete`);
