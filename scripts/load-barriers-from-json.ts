#!/usr/bin/env node
/**
 * Load barrier data from correct-races.json into database
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

const TARGET_HORSES = ['Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace'];

// Load correct-races.json
const racesData = JSON.parse(fs.readFileSync('/Users/mora0145/Downloads/TrackWise/correct-races.json', 'utf-8'));

console.log(`📥 Loading barriers from ${racesData.length} races\n`);

let updated = 0;
let notFound = 0;

for (const raceData of racesData) {
  const { track, raceNum, horses } = raceData;

  // Get race ID from database
  const race = db.prepare(`
    SELECT id FROM races WHERE track = ? AND race_number = ? AND date = '2026-04-12'
    LIMIT 1
  `).get(track, raceNum) as any;

  if (!race) {
    console.log(`⚠️  Race not found: ${track} R${raceNum}`);
    notFound++;
    continue;
  }

  // For each barrier, get horse ID and update
  for (const [barrier, horseName] of Object.entries(horses)) {
    const barrierNum = parseInt(barrier);

    // Get horse ID
    const horse = db.prepare(`
      SELECT id FROM horses WHERE name = ?
      LIMIT 1
    `).get(horseName) as any;

    if (!horse) {
      // Horse not in database
      continue;
    }

    // Update race_runner with barrier
    const result = db.prepare(`
      UPDATE race_runners
      SET barrier = ?
      WHERE race_id = ? AND horse_id = ?
    `).run(barrierNum, race.id, horse.id);

    if (result.changes > 0) {
      const isTarget = TARGET_HORSES.includes(horseName);
      if (isTarget) {
        console.log(`  ✓ ${track} R${raceNum}: ${horseName} → B${barrierNum}`);
      }
      updated++;
    }
  }
}

console.log(`\n✅ Updated ${updated} race_runner records with barrier data`);
console.log(`⚠️  ${notFound} races not found in database\n`);

// Verify target horses now have barrier data
const targetWithBarriers = db.prepare(`
  SELECT COUNT(*) as cnt FROM race_runners rr
  JOIN horses h ON rr.horse_id = h.id
  WHERE h.name IN ('Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace')
  AND rr.barrier IS NOT NULL
`).get() as any;

console.log(`📊 Target horses with barrier data: ${targetWithBarriers.cnt}\n`);

process.exit(0);
