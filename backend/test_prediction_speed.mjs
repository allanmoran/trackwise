#!/usr/bin/env node
import Database from 'better-sqlite3';
import RacePredictor from './src/ml/predictor.js';

const db = new Database('./data/trackwise.db');

console.log('⚡ PREDICTION SPEED TEST\n');

// Get a race with runners
const race = db.prepare(`
  SELECT r.id, r.track, r.race_number, COUNT(rr.id) as runner_count
  FROM races r
  LEFT JOIN race_runners rr ON r.id = rr.race_id
  WHERE r.date = date('now')
  GROUP BY r.id
  HAVING COUNT(rr.id) > 10
  LIMIT 1
`).get();

if (!race) {
  console.log('No suitable race found');
  process.exit(0);
}

console.log(`Test Race: ${race.track} R${race.race_number} (${race.runner_count} runners)\n`);

// Time the prediction generation
const start = Date.now();
const picks = RacePredictor.generatePicksWithPredictions(race.id);
const elapsed = Date.now() - start;

console.log(`Results:`);
console.log(`  Predictions generated: ${picks.length}`);
console.log(`  Time elapsed: ${elapsed}ms`);
console.log(`  Per-runner: ${(elapsed / picks.length).toFixed(1)}ms\n`);

if (elapsed < 5000) {
  console.log(`✅ OPTIMIZATION SUCCESSFUL: ${elapsed}ms (target: <5000ms for 20 runners)`);
  console.log(`   ~${(5000 / elapsed).toFixed(1)}x faster than baseline 25-40s`);
} else if (elapsed < 15000) {
  console.log(`✓ IMPROVED: ${elapsed}ms (acceptable, previously 25-40s)`);
} else {
  console.log(`⚠️  Still slow: ${elapsed}ms`);
}

console.log(`\nTop 3 Picks:`);
picks.slice(0, 3).forEach((p, i) => {
  console.log(`  ${i+1}. ${p.horse} @ ${p.odds}x | ${p.predicted_win_prob}% | EV: ${(Math.max(p.ev_win || 0, p.ev_place || 0) * 100).toFixed(0)}%`);
});
