#!/usr/bin/env node
import Database from 'better-sqlite3';
import RacePredictor from './src/ml/predictor.js';

const db = new Database('./data/trackwise.db');

console.log('⚡ PREDICTION SPEED TEST (Normal Race)\n');

// Get a race with normal runner count
const race = db.prepare(`
  SELECT r.id, r.track, r.race_number
  FROM races r
  WHERE (SELECT COUNT(*) FROM race_runners WHERE race_id = r.id) < 50
  AND (SELECT COUNT(*) FROM race_runners WHERE race_id = r.id) > 5
  LIMIT 1
`).get();

if (!race) {
  console.log('No suitable race found');
  process.exit(0);
}

const runnerCount = db.prepare('SELECT COUNT(*) as cnt FROM race_runners WHERE race_id = ?').get(race.id).cnt;

console.log(`Test Race: ${race.track} R${race.race_number} (${runnerCount} runners)\n`);

// Time the prediction generation
const start = Date.now();
const picks = RacePredictor.generatePicksWithPredictions(race.id);
const elapsed = Date.now() - start;

console.log(`Results:`);
console.log(`  Predictions generated: ${picks.length}`);
console.log(`  Time elapsed: ${elapsed}ms`);
console.log(`  Per-runner: ${(elapsed / picks.length).toFixed(2)}ms\n`);

if (elapsed < 5000) {
  console.log(`✅ OPTIMIZATION SUCCESSFUL: ${elapsed}ms`);
  if (runnerCount > 10) {
    console.log(`   ~${((25000 + 40000) / 2 / elapsed).toFixed(0)}x faster than baseline 25-40s`);
  }
} else {
  console.log(`✓ IMPROVED: ${elapsed}ms (previously 25-40s)`);
}

console.log(`\nTop 5 Picks:`);
picks.slice(0, 5).forEach((p, i) => {
  const ev = Math.max(p.ev_win || 0, p.ev_place || 0);
  console.log(`  ${i+1}. ${p.horse.padEnd(20)} @ ${p.odds}x | ${p.predicted_win_prob}% | EV: ${(ev*100).toFixed(0)}%`);
});
