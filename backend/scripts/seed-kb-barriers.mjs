#!/usr/bin/env node

/**
 * Seed KB stats with track-specific barrier bias data
 * Aggregates historical race_runners to calculate win rate by track+distance+barrier
 */

import Database from 'better-sqlite3';

const db = new Database('./data/trackwise.db');

console.log(`\n📊 SEEDING KB BARRIER BIAS DATA`);
console.log(`${'='.repeat(60)}\n`);

// Ensure value column exists (for storing barrier data JSON)
try {
  db.prepare('SELECT value FROM kb_stats LIMIT 1').all();
} catch (e) {
  console.log('Adding value column to kb_stats...');
  db.exec('ALTER TABLE kb_stats ADD COLUMN value TEXT');
}

// Get all unique track+distance+barrier combinations with historical data
const barriers = db.prepare(`
  SELECT
    r.track,
    r.distance,
    rr.barrier,
    COUNT(*) as total_races,
    COUNT(CASE WHEN rr.result = 'WIN' THEN 1 END) as wins,
    ROUND(COUNT(CASE WHEN rr.result = 'WIN' THEN 1 END) * 100.0 / COUNT(*), 1) as win_rate
  FROM race_runners rr
  JOIN races r ON rr.race_id = r.id
  WHERE rr.barrier > 0 AND rr.barrier <= 30 AND rr.result IS NOT NULL
  GROUP BY r.track, r.distance, rr.barrier
  ORDER BY r.track, r.distance, rr.barrier
`).all();

console.log(`Found ${barriers.length} track+distance+barrier combinations\n`);

let inserted = 0;
const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO kb_stats (stat_type, stat_key, value, updated_at)
  VALUES ('track_barrier', ?, ?, datetime('now'))
`);

const transaction = db.transaction((barrierData) => {
  for (const b of barrierData) {
    const key = `${b.track}|${b.distance}|barrier_${b.barrier}`;
    const value = JSON.stringify({
      track: b.track,
      distance: b.distance,
      barrier: b.barrier,
      win_rate: b.win_rate / 100, // Convert to decimal
      sample_size: b.total_races,
      wins: b.wins
    });

    insertStmt.run(key, value);
    inserted++;

    if (inserted % 10 === 0) {
      console.log(`  ✓ Inserted ${inserted} entries...`);
    }
  }
});

transaction(barriers);

console.log(`\n✅ Seeded ${inserted} KB barrier bias entries\n`);

// Show sample
const sample = db.prepare(`
  SELECT stat_key, value FROM kb_stats
  WHERE stat_type = 'track_barrier'
  ORDER BY RANDOM()
  LIMIT 5
`).all();

console.log(`Sample entries:`);
sample.forEach(row => {
  try {
    const data = JSON.parse(row.value);
    console.log(`  ${row.stat_key}: ${(data.win_rate * 100).toFixed(1)}% win rate (${data.sample_size} races)`);
  } catch (e) {
    console.log(`  ${row.stat_key}: [parse error]`);
  }
});

console.log();
