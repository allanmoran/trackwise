#!/usr/bin/env node
/**
 * Load barrier data from April 11 CSV form files into database
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

const TARGET_HORSES = ['Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace'];

// Simple CSV parser
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const numIdx = header.indexOf('Num');
  const nameIdx = header.indexOf('Horse Name');
  const barrierIdx = header.indexOf('Barrier');

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < Math.max(numIdx, nameIdx) + 1) continue;

    const num = (parts[numIdx] || '').trim().replace(/^"|"$/g, '');
    const name = (parts[nameIdx] || '').trim().replace(/^"|"$/g, '');
    const barrier = (parts[barrierIdx] || '').trim().replace(/^"|"$/g, '');

    if (name) {
      rows.push({ Num: num, 'Horse Name': name, Barrier: barrier });
    }
  }
  return rows;
}

// Find all April 11 CSV files
const csvDir = '/Users/mora0145/Downloads';
const csvFiles = fs.readdirSync(csvDir)
  .filter(f => f.match(/20260411.*\.csv$/))
  .sort();

console.log(`📥 Found ${csvFiles.length} CSV files\n`);

let totalUpdated = 0;
let totalProcessed = 0;

for (const csvFile of csvFiles) {
  const filePath = path.join(csvDir, csvFile);
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  // Parse CSV
  const rows = parseCSV(fileContent);

  // Extract track and race from filename: 20260411-{track}-r{num}.csv
  const match = csvFile.match(/20260411-(.+?)-r(\d+)\.csv/i);
  if (!match) continue;

  let track = match[1]
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const raceNum = parseInt(match[2]);

  // Normalize track name (alice-springs -> Alice Springs)
  track = track.replace(/alice springs/i, 'Alice Springs')
    .replace(/ascot/i, 'Ascot')
    .replace(/bowen/i, 'Bowen')
    .replace(/caulfield/i, 'Caulfield');

  // Find race in database (April 12 races - next day settlement)
  const race = db.prepare(`
    SELECT id FROM races WHERE track = ? AND race_number = ?
    LIMIT 1
  `).get(track, raceNum) as any;

  if (!race) {
    continue;
  }

  // Process each horse in the CSV
  for (const row of rows) {
    if (!row || !row['Horse Name']) continue;

    const horseName = row['Horse Name'];
    const barrierStr = row.Num || row.Barrier || '';
    const barrierNum = parseInt(barrierStr);

    if (!barrierNum || barrierNum <= 0) continue;

    // Get horse ID from database
    const horse = db.prepare(`
      SELECT id FROM horses WHERE name = ?
      LIMIT 1
    `).get(horseName) as any;

    if (!horse) continue;

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
      totalUpdated++;
    }

    totalProcessed++;
  }
}

console.log(`\n✅ Processed ${totalProcessed} horses, updated ${totalUpdated} barriers\n`);

// Verify target horses now have barrier data
const targetWithBarriers = db.prepare(`
  SELECT COUNT(*) as cnt FROM race_runners rr
  JOIN horses h ON rr.horse_id = h.id
  WHERE h.name IN ('Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace')
  AND rr.barrier IS NOT NULL
`).get() as any;

const targetTotal = db.prepare(`
  SELECT COUNT(*) as cnt FROM race_runners rr
  JOIN horses h ON rr.horse_id = h.id
  WHERE h.name IN ('Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace')
`).get() as any;

console.log(`📊 Target horses: ${targetWithBarriers.cnt}/${targetTotal.cnt} have barrier data\n`);

process.exit(0);
