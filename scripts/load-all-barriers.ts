#!/usr/bin/env node
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

function parseCSV(content: string) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const numIdx = header.indexOf('Num');
  const nameIdx = header.indexOf('Horse Name');

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < Math.max(numIdx, nameIdx) + 1) continue;

    const num = (parts[numIdx] || '').trim().replace(/^"|"$/g, '');
    const name = (parts[nameIdx] || '').trim().replace(/^"|"$/g, '');

    if (name && num) {
      rows.push({ Num: num, 'Horse Name': name });
    }
  }
  return rows;
}

const csvDir = '/Users/mora0145/Downloads';
const csvFiles = fs.readdirSync(csvDir)
  .filter(f => f.match(/20260411.*\.csv$/))
  .sort();

console.log(`\n📥 Loading barriers from ${csvFiles.length} CSV files\n`);

let updated = 0;

for (const csvFile of csvFiles) {
  const filePath = path.join(csvDir, csvFile);
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(fileContent);

  const match = csvFile.match(/20260411-(.+?)-r(\d+)\.csv/i);
  if (!match) continue;

  let track = match[1]
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  track = track.replace(/alice springs/i, 'Alice Springs')
    .replace(/ascot/i, 'Ascot')
    .replace(/bowen/i, 'Bowen')
    .replace(/caulfield/i, 'Caulfield')
    .replace(/ballina/i, 'Ballina')
    .replace(/geraldton/i, 'Geraldton');

  const raceNum = parseInt(match[2]);

  for (const row of rows) {
    const horseName = row['Horse Name'];
    const barrierNum = parseInt(row.Num);

    if (!barrierNum || barrierNum <= 0) continue;

    const horse = db.prepare(`SELECT id FROM horses WHERE name = ? LIMIT 1`).get(horseName) as any;
    if (!horse) continue;

    const result = db.prepare(`
      UPDATE race_runners
      SET barrier = ?
      WHERE horse_id = ? AND race_id IN (
        SELECT id FROM races WHERE track = ? AND race_number = ? AND date = '2026-04-12'
      )
    `).run(barrierNum, horse.id, track, raceNum);

    if (result.changes > 0) {
      updated++;
    }
  }
}

console.log(`✅ Updated ${updated} horse barrier positions\n`);

// Verify
const withBarriers = db.prepare(`SELECT COUNT(*) as cnt FROM race_runners WHERE barrier IS NOT NULL`).get() as any;
const total = db.prepare(`SELECT COUNT(*) as cnt FROM race_runners`).get() as any;

console.log(`📊 Barriers populated: ${withBarriers.cnt}/${total.cnt}\n`);

process.exit(0);
