#!/usr/bin/env node
/**
 * Update race meeting_id fields with Sportsbet track IDs
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Sportsbet track ID mapping
const TRACK_MAPPING: Record<string, string> = {
  'Alice Springs': '435951',
  'Ascot': '436088',
  'Ballina': '435964',
  'Bowen': '436054',
};

console.log('\n🔧 UPDATING RACE MEETING IDs\n');

let totalUpdated = 0;

for (const [trackName, trackId] of Object.entries(TRACK_MAPPING)) {
  try {
    // Update all races for this track with the meeting_id
    const stmt = db.prepare(`
      UPDATE races
      SET meeting_id = ?
      WHERE track = ? AND date = '2026-04-12' AND meeting_id IS NULL
    `);

    const result = stmt.run(trackId, trackName);

    if ((result.changes as any) > 0) {
      console.log(`✓ ${trackName}: Updated ${(result.changes as any)} races with meeting_id = ${trackId}`);
      totalUpdated += (result.changes as any);
    } else {
      console.log(`ℹ️  ${trackName}: No races to update`);
    }
  } catch (err: any) {
    console.log(`❌ ${trackName}: ${err.message}`);
  }
}

console.log(`\n✅ Total races updated: ${totalUpdated}\n`);

// Verify
const verify = db.prepare(`
  SELECT r.track, COUNT(*) as race_count, SUM(CASE WHEN meeting_id IS NOT NULL THEN 1 ELSE 0 END) as with_ids
  FROM races r
  WHERE r.date = '2026-04-12'
  GROUP BY r.track
  ORDER BY r.track
`).all();

console.log('📋 Verification:\n');
console.log('Track'.padEnd(15) + ' Total   With ID');
console.log(''.padEnd(35, '─'));
for (const row of verify as any[]) {
  const icon = row.with_ids > 0 ? '✓' : '❌';
  console.log(icon + ' ' + row.track.padEnd(13) + row.race_count.toString().padEnd(6) + row.with_ids || 0);
}
console.log('');
