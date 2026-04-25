#!/usr/bin/env node

/**
 * Seed strike rates from odds data
 * Calculate implied probability from starting odds
 */

import Database from 'better-sqlite3';

const db = new Database('./data/trackwise.db');

console.log(`\n📊 SEEDING STRIKE RATES FROM ODDS`);
console.log(`${'='.repeat(60)}\n`);

// Get all race runners grouped by horse
const horses = db.prepare(`
  SELECT DISTINCT h.id, h.name,
    COUNT(rr.id) as appearances,
    AVG(rr.starting_odds) as avg_odds,
    MIN(rr.starting_odds) as min_odds,
    MAX(rr.starting_odds) as max_odds
  FROM race_runners rr
  JOIN horses h ON rr.horse_id = h.id
  WHERE rr.starting_odds > 1.0
  GROUP BY h.id, h.name
  ORDER BY appearances DESC
`).all();

console.log(`Updating ${horses.length} horses with strike rates...\n`);

let updated = 0;

for (const horse of horses) {
  // Convert odds to implied win probability
  // Implied prob = 1 / odds (without margin)
  const impliedProb = Math.max(0.01, Math.min(1.0, 1.0 / horse.avg_odds));

  // Adjust slightly based on number of appearances
  // More appearances = more confident in the probability
  const strikeRate = impliedProb * 0.95; // Apply 5% margin

  try {
    db.prepare(`
      UPDATE horses
      SET strike_rate = ?,
          place_rate = ?,
          avg_odds = ?
      WHERE id = ?
    `).run(
      strikeRate,
      strikeRate * 1.8, // Place rate typically ~1.8x win rate
      horse.avg_odds,
      horse.id
    );

    updated++;
    console.log(`  ✓ ${horse.name}: ${(strikeRate * 100).toFixed(1)}% strike rate (avg odds: $${horse.avg_odds.toFixed(2)})`);
  } catch (err) {
    console.log(`  ✗ ${horse.name}: ${err.message}`);
  }
}

console.log(`\n✅ Updated ${updated} horses with strike rates`);

// Verify the update
const summary = db.prepare(`
  SELECT
    COUNT(*) as total_horses,
    COUNT(CASE WHEN strike_rate IS NOT NULL THEN 1 END) as with_rates,
    ROUND(AVG(strike_rate), 4) as avg_rate
  FROM horses
`).get();

console.log(`\nVerification:`);
console.log(`  Total horses: ${summary.total_horses}`);
console.log(`  With strike rates: ${summary.with_rates}`);
console.log(`  Average strike rate: ${(summary.avg_rate * 100).toFixed(2)}%\n`);
