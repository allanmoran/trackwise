#!/usr/bin/env node

/**
 * Synthesize realistic odds from strike rates
 * Create reasonable odds distribution for betting validation
 */

import Database from 'better-sqlite3';

const db = new Database('./data/trackwise.db');

console.log(`\n💰 SYNTHESIZING REALISTIC ODDS`);
console.log(`${'='.repeat(60)}\n`);

// For each runner, calculate realistic odds based on strike rate
// Inverse relationship: higher SR → lower odds
// Base odds on market: assume 1/SR with 110% book (10% margin)

const runners = db.prepare(`
  SELECT rr.id, h.strike_rate, rr.starting_odds as old_odds
  FROM race_runners rr
  JOIN horses h ON rr.horse_id = h.id
  WHERE h.strike_rate > 0
  LIMIT 700
`).all();

console.log(`Processing ${runners.length} runners...\n`);

let updated = 0;
let priceOffered = 0; // Bets with positive EV

const updateOdds = db.transaction((runners) => {
  for (const runner of runners) {
    // For a horse with SR%, the market inverse odds = 1/SR
    // Add ~10% margin (110% book) and adjust
    const fairOdds = 1.0 / runner.strike_rate;

    // Add 15% margin (reduce odds) to account for bookmaker margin
    const syntheticOdds = Math.max(1.01, fairOdds * 0.85);

    // Slightly randomize to avoid exact prices
    const variance = 0.95 + Math.random() * 0.10; // ±5%
    const finalOdds = Math.round(syntheticOdds * variance * 100) / 100;

    // Calculate EV with new odds
    const ev = (runner.strike_rate * finalOdds) - 1;
    if (ev > 0) priceOffered++;

    db.prepare(`
      UPDATE race_runners
      SET starting_odds = ?
      WHERE id = ?
    `).run(finalOdds, runner.id);

    updated++;
  }
});

updateOdds(runners);

console.log(`✅ Updated ${updated} runners with synthetic odds\n`);

// Show the distribution
const stats = db.prepare(`
  SELECT
    MIN(starting_odds) as min_odds,
    MAX(starting_odds) as max_odds,
    AVG(starting_odds) as avg_odds,
    COUNT(CASE WHEN starting_odds >= 2.0 AND starting_odds <= 5.0 THEN 1 END) as favorite_range,
    COUNT(CASE WHEN starting_odds > 5.0 THEN 1 END) as longshot_range
  FROM race_runners
  WHERE starting_odds > 1.0
`).get();

console.log(`New odds distribution:`);
console.log(`  Range: $${stats.min_odds.toFixed(2)} - $${stats.max_odds.toFixed(2)}`);
console.log(`  Average: $${stats.avg_odds.toFixed(2)}`);
console.log(`  Favorites ($2-5): ${stats.favorite_range}`);
console.log(`  Longshots (>$5): ${stats.longshot_range}`);

// Sample a race
const sample = db.prepare(`
  SELECT r.track, r.race_number,
    GROUP_CONCAT(PRINTF('%s@$%.2f', h.name, rr.starting_odds), ' | ') as picks
  FROM races r
  JOIN race_runners rr ON r.id = rr.race_id
  JOIN horses h ON rr.horse_id = h.id
  WHERE r.track = 'Alice Springs' AND r.race_number = 1
`).get();

console.log(`\nSample: ${sample.track} R${sample.race_number}`);
console.log(`  Runners: ${sample.picks}\n`);
