#!/usr/bin/env node
/**
 * Bulk import Betfair Aus/NZ Thoroughbred historical data (2020-2026)
 * Extracts horse performance stats from Betfair CSV and enriches KB
 *
 * Usage: npx tsx scripts/import-betfair-bulk.ts [--recent] [--year YYYY]
 */

import https from 'https';
import { parse } from 'csv-parse/sync';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

const BASE_URL = 'https://betfair-datascientists.github.io/data/assets';

const FILES = [
  'ANZ_Thoroughbreds_2026_03.csv',
  'ANZ_Thoroughbreds_2026_02.csv',
  'ANZ_Thoroughbreds_2026_01.csv',
  'ANZ_Thoroughbreds_2025.csv',
  'ANZ_Thoroughbreds_2024.csv',
  'ANZ_Thoroughbreds_2023.csv',
  'ANZ_Thoroughbreds_2022.csv',
  'ANZ_Thoroughbreds_2021.csv',
  'ANZ_Thoroughbreds_2020.csv',
];

interface BetfairRow {
  LOCAL_MEETING_DATE: string;
  TRACK: string;
  SELECTION_NAME: string;
  WIN_RESULT: 'WINNER' | 'LOSER';
  PLACE_RESULT: 'WINNER' | 'LOSER' | 'PLACED';
  WIN_BSP: string;
}

async function downloadCSV(filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/${filename}`;
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCSV(csv: string): BetfairRow[] {
  const records = parse(csv, { columns: true, skip_empty_lines: true });
  return records as BetfairRow[];
}

function processFile(rows: BetfairRow[]): { horses: Map<string, any>; races: number } {
  const horses = new Map<string, any>();
  let races = new Set<string>();

  for (const row of rows) {
    const horseName = row.SELECTION_NAME.toUpperCase();
    const isWin = row.WIN_RESULT === 'WINNER';
    const isPlace = row.PLACE_RESULT === 'WINNER' || row.PLACE_RESULT === 'PLACED';
    const raceKey = `${row.LOCAL_MEETING_DATE}-${row.TRACK}`;

    races.add(raceKey);

    if (!horses.has(horseName)) {
      horses.set(horseName, { wins: 0, places: 0, starts: 0 });
    }

    const horse = horses.get(horseName);
    horse.starts++;
    if (isWin) horse.wins++;
    if (isPlace) horse.places++;
  }

  return { horses, races: races.size };
}

async function main() {
  const args = process.argv.slice(2);
  const recentOnly = args.includes('--recent');
  const filesToImport = recentOnly ? FILES.slice(0, 3) : FILES;

  console.log('\n🐎 Betfair Bulk Import - Aus & NZ Thoroughbreds\n');
  console.log(`📥 Processing ${filesToImport.length} files...\n`);

  const allHorses = new Map<string, any>();
  let totalRaces = 0;

  for (const filename of filesToImport) {
    try {
      process.stdout.write(`  ⏳ ${filename}... `);
      const csv = await downloadCSV(filename);
      const rows = parseCSV(csv);
      const { horses, races } = processFile(rows);

      // Merge horse stats
      for (const [name, stats] of horses) {
        if (!allHorses.has(name)) {
          allHorses.set(name, { wins: 0, places: 0, starts: 0 });
        }
        const existing = allHorses.get(name);
        existing.wins += stats.wins;
        existing.places += stats.places;
        existing.starts += stats.starts;
      }

      totalRaces += races;
      console.log(`✅ ${horses.size} horses, ${races} races`);
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`);
    }
  }

  // Update KB horses with Betfair performance data
  console.log('\n💾 Updating Knowledge Base...\n');

  const upsertHorse = db.prepare(`
    INSERT INTO horses (name, career_wins, career_places, career_bets, strike_rate, place_rate, form_score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      career_wins = career_wins + excluded.career_wins,
      career_places = career_places + excluded.career_places,
      career_bets = career_bets + excluded.career_bets,
      strike_rate = (career_wins + excluded.career_wins) / (career_bets + excluded.career_bets),
      place_rate = (career_places + excluded.career_places) / (career_bets + excluded.career_bets)
  `);

  let updated = 0;
  for (const [name, stats] of allHorses) {
    if (stats.starts >= 3) {
      const strikeRate = stats.wins / stats.starts;
      const placeRate = stats.places / stats.starts;
      upsertHorse.run(name, stats.wins, stats.places, stats.starts, strikeRate, placeRate, Math.round(strikeRate * 100));
      updated++;
    }
  }

  const totalHorses = (db.prepare('SELECT COUNT(*) as count FROM horses').get() as any).count;
  const performanceHorses = (db.prepare('SELECT COUNT(*) as count FROM horses WHERE career_bets > 0').get() as any).count;

  console.log(`✅ Updated ${updated} horses with Betfair data`);
  console.log(`\n📈 KB Summary:`);
  console.log(`  • Total horses: ${totalHorses}`);
  console.log(`  • Horses with performance data: ${performanceHorses}`);
  console.log(`  • Races processed: ${totalRaces}`);
  console.log(`  • Historical data from: 2020-2026\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
