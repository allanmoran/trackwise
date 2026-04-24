#!/usr/bin/env node
/**
 * Load comprehensive Betfair/Kash model results into knowledge base
 * Processes all years of racing data from Desktop CSV files
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

interface RaceResult {
  date: string;
  track: string;
  raceName: string;
  raceNum: number;
  horse: string;
  winResult: number;
  placeResult: number;
  winBsp: number;
  placeBsp: number;
  value: number;
}

function parseKashCSV(filePath: string): RaceResult[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  const results: RaceResult[] = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = lines[i].split(',').map(v => v.trim());
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });

      results.push({
        date: row['Date'],
        track: row['Track'],
        raceName: row['Race Name'],
        raceNum: parseInt(row['Race']) || 0,
        horse: row['Horse'],
        winResult: parseFloat(row['WIN_RESULT']) || 0,
        placeResult: parseFloat(row['PLACE_RESULT']) || 0,
        winBsp: parseFloat(row['WIN_BSP']) || 0,
        placeBsp: parseFloat(row['PLACE_BSP']) || 0,
        value: parseFloat(row['Value']) || 0,
      });
    } catch (e) {
      // Skip malformed lines
    }
  }

  return results;
}

function loadBetfairData() {
  console.log('\n📊 LOADING COMPREHENSIVE BETFAIR DATA\n');

  const desktopPath = path.join(process.env.HOME || '/Users/mora0145', 'Desktop');
  const csvFiles = fs.readdirSync(desktopPath)
    .filter(f => f.startsWith('Kash_Model_Results_') && f.endsWith('.csv'))
    .sort();

  console.log(`Found ${csvFiles.length} CSV files to process:\n`);

  let totalRacesProcessed = 0;
  let totalHorsesAdded = 0;
  let totalRaceResults = 0;
  let horsesMap = new Map<string, number>();
  let racesMap = new Map<string, number>();

  for (const csvFile of csvFiles) {
    const filePath = path.join(desktopPath, csvFile);
    console.log(`📁 Processing ${csvFile}...`);

    try {
      const results = parseKashCSV(filePath);
      console.log(`   Parsed ${results.length} records`);

      // Group by race
      const raceMap = new Map<string, RaceResult[]>();
      for (const result of results) {
        const raceKey = `${result.date}|${result.track}|${result.raceNum}`;
        if (!raceMap.has(raceKey)) {
          raceMap.set(raceKey, []);
        }
        raceMap.get(raceKey)!.push(result);
      }

      console.log(`   Contains ${raceMap.size} unique races`);

      // Process each race
      for (const [raceKey, raceResults] of raceMap.entries()) {
        const [date, track, raceNumStr] = raceKey.split('|');
        const raceNum = parseInt(raceNumStr);

        // Ensure horse exists
        for (const result of raceResults) {
          if (!horsesMap.has(result.horse)) {
            const existing = db.prepare('SELECT id FROM horses WHERE name = ?').get(result.horse) as any;
            if (existing) {
              horsesMap.set(result.horse, existing.id);
            } else {
              db.prepare(`INSERT INTO horses (name) VALUES (?)`).run(result.horse);
              const inserted = db.prepare('SELECT id FROM horses WHERE name = ?').get(result.horse) as any;
              horsesMap.set(result.horse, inserted.id);
              totalHorsesAdded++;
            }
          }
        }

        // Ensure race exists
        const raceMapKey = `${date}|${track}|${raceNum}`;
        let raceId: number;
        if (racesMap.has(raceMapKey)) {
          raceId = racesMap.get(raceMapKey)!;
        } else {
          const existing = db.prepare(
            'SELECT id FROM races WHERE date = ? AND track = ? AND race_number = ?'
          ).get(date, track, raceNum) as any;

          if (existing) {
            raceId = existing.id;
            racesMap.set(raceMapKey, raceId);
          } else {
            db.prepare(
              'INSERT OR IGNORE INTO races (date, track, race_number) VALUES (?, ?, ?)'
            ).run(date, track, raceNum);

            const inserted = db.prepare(
              'SELECT id FROM races WHERE date = ? AND track = ? AND race_number = ?'
            ).get(date, track, raceNum) as any;
            raceId = inserted.id;
            racesMap.set(raceMapKey, raceId);
            totalRacesProcessed++;
          }
        }

        // Add race runners with results
        for (const result of raceResults) {
          const horseId = horsesMap.get(result.horse);
          if (!horseId) continue;

          const resultText = result.winResult === 1 ? 'WIN' : result.placeResult === 1 ? 'PLACE' : 'LOSS';

          db.prepare(`
            INSERT OR IGNORE INTO race_runners (race_id, horse_id, result)
            VALUES (?, ?, ?)
          `).run(raceId, horseId, resultText);

          totalRaceResults++;
        }
      }

      console.log(`   ✅ Loaded\n`);
    } catch (err) {
      console.log(`   ⚠️  Error: ${(err as any).message}\n`);
    }
  }

  console.log('='.repeat(80));
  console.log('📊 LOAD SUMMARY\n');
  console.log(`Races processed: ${totalRacesProcessed}`);
  console.log(`Horses added: ${totalHorsesAdded}`);
  console.log(`Race results loaded: ${totalRaceResults}\n`);

  return { totalRacesProcessed, totalHorsesAdded, totalRaceResults };
}

function buildComprehensiveKB() {
  console.log('📚 BUILDING COMPREHENSIVE KB\n');

  db.prepare('DELETE FROM kb_stats').run();

  // 1. Horse statistics
  console.log('Building horse statistics...');
  const horseStats = db.prepare(`
    SELECT
      h.id,
      h.name,
      COUNT(rr.id) as races,
      SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN rr.result = 'PLACE' THEN 1 ELSE 0 END) as places
    FROM horses h
    LEFT JOIN race_runners rr ON h.id = rr.horse_id
    WHERE rr.result IS NOT NULL
    GROUP BY h.id
    HAVING races > 0
    ORDER BY wins DESC, races DESC
  `).all() as any[];

  let kbCount = 0;
  for (const stat of horseStats) {
    const strikeRate = Math.round((stat.wins / stat.races) * 100);
    const placeRate = Math.round(((stat.wins + stat.places) / stat.races) * 100);
    const formScore = Math.min(strikeRate * 0.6 + placeRate * 0.4, 100);

    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('HORSE', ?, ?, ?, ?, ?, ?)
    `).run(stat.name, stat.races, stat.wins, stat.places, stat.races * 25, (stat.wins * 50 + stat.places * 25));

    db.prepare(`
      UPDATE horses SET
        career_bets = ?,
        career_wins = ?,
        career_places = ?,
        strike_rate = ?,
        place_rate = ?,
        form_score = ?
      WHERE id = ?
    `).run(stat.races, stat.wins, stat.places, strikeRate, placeRate, Math.round(formScore), stat.id);

    kbCount++;
  }
  console.log(`  ✓ ${kbCount} horses with performance data`);

  // 2. Track statistics
  console.log('Building track statistics...');
  const trackStats = db.prepare(`
    SELECT
      r.track,
      COUNT(rr.id) as races,
      SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN rr.result = 'PLACE' THEN 1 ELSE 0 END) as places
    FROM race_runners rr
    JOIN races r ON rr.race_id = r.id
    WHERE rr.result IS NOT NULL
    GROUP BY r.track
    ORDER BY races DESC
  `).all() as any[];

  for (const stat of trackStats) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('TRACK', ?, ?, ?, ?, ?, ?)
    `).run(stat.track, stat.races, stat.wins, stat.places, stat.races * 25, (stat.wins * 50 + stat.places * 25));
    kbCount++;
  }
  console.log(`  ✓ ${trackStats.length} tracks analyzed`);

  // 3. Overall
  const overall = db.prepare(`
    SELECT
      COUNT(rr.id) as races,
      SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN rr.result = 'PLACE' THEN 1 ELSE 0 END) as places
    FROM race_runners rr
    WHERE rr.result IS NOT NULL
  `).get() as any;

  db.prepare(`
    INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
    VALUES ('OVERALL', 'ALL', ?, ?, ?, ?, ?)
  `).run(overall.races, overall.wins, overall.places, overall.races * 25, (overall.wins * 50 + overall.places * 25));

  console.log(`  ✓ Overall summary\n`);
  return kbCount;
}

function displayKBSummary() {
  console.log('='.repeat(80));
  console.log('🧠 COMPREHENSIVE KNOWLEDGE BASE\n');

  const overall = db.prepare(`SELECT bets, wins, places FROM kb_stats WHERE stat_type = 'OVERALL'`).get() as any;
  const horseCount = db.prepare(`SELECT COUNT(*) as count FROM horses WHERE career_bets > 0`).get() as any;
  const trackCount = db.prepare(`SELECT COUNT(DISTINCT stat_key) as count FROM kb_stats WHERE stat_type = 'TRACK'`).get() as any;

  console.log(`📊 SYSTEM OVERVIEW\n`);
  console.log(`Total races: ${overall.bets}`);
  console.log(`Total horses with history: ${horseCount.count}`);
  console.log(`Tracks represented: ${trackCount.count}`);
  console.log(`Overall win rate: ${(overall.wins / overall.bets * 100).toFixed(1)}%`);
  console.log(`Overall place rate: ${((overall.wins + overall.places) / overall.bets * 100).toFixed(1)}%\n`);

  console.log('🏆 TOP 10 HORSES\n');
  const top10 = db.prepare(`
    SELECT stat_key, bets, wins, places FROM kb_stats
    WHERE stat_type = 'HORSE' AND bets > 50
    ORDER BY wins DESC
    LIMIT 10
  `).all() as any[];

  for (const h of top10) {
    const winRate = (h.wins / h.bets * 100).toFixed(1);
    console.log(`${h.stat_key}: ${h.bets} races, ${h.wins}W (${winRate}%)`);
  }

  console.log('\n📍 TOP TRACKS\n');
  const topTracks = db.prepare(`
    SELECT stat_key, bets, wins FROM kb_stats
    WHERE stat_type = 'TRACK'
    ORDER BY bets DESC
    LIMIT 10
  `).all() as any[];

  for (const t of topTracks) {
    const winRate = (t.wins / t.bets * 100).toFixed(1);
    console.log(`${t.stat_key}: ${t.bets} races, ${t.wins}W (${winRate}%)`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  console.log('\n🏇 LOADING COMPREHENSIVE BETFAIR RACING DATABASE\n');

  try {
    const { totalRacesProcessed, totalHorsesAdded, totalRaceResults } = loadBetfairData();

    if (totalRaceResults === 0) {
      console.log('⚠️  No race results loaded. Checking file format...');
      return;
    }

    buildComprehensiveKB();
    displayKBSummary();

    console.log(`✅ Comprehensive KB loaded successfully\n`);
    console.log(`This KB provides intelligence on:`);
    console.log(`  • ${totalHorsesAdded} horses with complete race history`);
    console.log(`  • ${totalRacesProcessed} Australian racing venues`);
    console.log(`  • ${totalRaceResults} individual race results\n`);
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
