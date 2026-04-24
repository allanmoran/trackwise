#!/usr/bin/env node
/**
 * Import Betfair Kash Model Results (2021-2026)
 * Analyzes model predictions vs outcomes to validate TrackWise strategy
 *
 * Usage: npx tsx scripts/import-betfair-model.ts [--recent]
 */

import https from 'https';
import { parse } from 'csv-parse/sync';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

const FILES = [
  'Kash_Model_Results_2026_03.csv',
  'Kash_Model_Results_2026_02.csv',
  'Kash_Model_Results_2026_01.csv',
  'Kash_Model_Results_2025.csv',
  'Kash_Model_Results_2024.csv',
  'Kash_Model_Results_2023.csv',
  'Kash_Model_Results_2022.csv',
  'Kash_Model_Results_2021.csv',
];

interface ModelRow {
  Date: string;
  Track: string;
  Race: string;
  Horse: string;
  Number: string;
  Race_Speed: string;
  Speed_Cat: string;
  Early_Speed: string;
  Late_Speed: string;
  RP: string;
  WIN_RESULT: string;
  WIN_BSP: string;
  Value: string;
}

async function downloadCSV(filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://betfair-datascientists.github.io/data/assets/${filename}`;
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

function parseCSV(csv: string): ModelRow[] {
  const records = parse(csv, { columns: true, skip_empty_lines: true });
  return records as ModelRow[];
}

async function main() {
  const args = process.argv.slice(2);
  const recentOnly = args.includes('--recent');
  const filesToImport = recentOnly ? FILES.slice(0, 3) : FILES;

  console.log('\n🤖 Betfair Kash Model Import - 2021-2026\n');
  console.log(`📥 Processing ${filesToImport.length} files...\n`);

  // Create model results table
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_predictions (
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      track TEXT NOT NULL,
      race_number INTEGER NOT NULL,
      horse_name TEXT NOT NULL,
      race_speed TEXT,
      speed_cat TEXT,
      early_speed REAL,
      late_speed REAL,
      rp REAL,
      predicted_result INTEGER,
      actual_result INTEGER,
      actual_odds REAL,
      model_value REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, track, race_number, horse_name)
    );
  `);

  const insertPrediction = db.prepare(`
    INSERT OR REPLACE INTO model_predictions
    (date, track, race_number, horse_name, race_speed, speed_cat, early_speed, late_speed, rp, predicted_result, actual_result, actual_odds, model_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalRecords = 0;
  let modelAccuracy = { correct: 0, total: 0 };
  let valueAnalysis = { positive: 0, negative: 0, neutral: 0 };

  for (const filename of filesToImport) {
    try {
      process.stdout.write(`  ⏳ ${filename}... `);
      const csv = await downloadCSV(filename);
      const rows = parseCSV(csv);

      for (const row of rows) {
        try {
          const raceNum = parseInt(row.Race) || 1;
          const predictedWin = parseFloat(row.WIN_RESULT) > 0.5 ? 1 : 0;
          const actualResult = parseInt(row.WIN_RESULT) || 0;
          const odds = parseFloat(row.WIN_BSP) || 0;
          const value = parseFloat(row.Value) || 0;

          insertPrediction.run(
            row.Date,
            row.Track,
            raceNum,
            row.Horse.toUpperCase(),
            row.Speed_Cat,
            row.Speed_Cat,
            parseFloat(row.Early_Speed) || 0,
            parseFloat(row.Late_Speed) || 0,
            parseFloat(row.RP) || 0,
            predictedWin,
            actualResult,
            odds,
            value
          );

          // Calculate accuracy
          if (predictedWin === actualResult) modelAccuracy.correct++;
          modelAccuracy.total++;

          // Value analysis
          if (value > 0) valueAnalysis.positive++;
          else if (value < 0) valueAnalysis.negative++;
          else valueAnalysis.neutral++;

          totalRecords++;
        } catch (e) {
          // Skip parse errors
        }
      }

      console.log(`✅ ${rows.length} predictions`);
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`);
    }
  }

  // Analyze model performance
  console.log('\n📊 Betfair Model Performance Analysis:\n');

  const accuracy = (modelAccuracy.correct / modelAccuracy.total * 100).toFixed(1);
  const positivePct = (valueAnalysis.positive / (valueAnalysis.positive + valueAnalysis.negative) * 100).toFixed(1);

  const modelStats = (db.prepare(`
    SELECT
      ROUND(SUM(CASE WHEN predicted_result = 1 AND actual_result = 1 THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as win_accuracy,
      ROUND(SUM(CASE WHEN model_value > 0 THEN model_value ELSE 0 END), 2) as total_positive_value,
      ROUND(COUNT(CASE WHEN model_value > 0 THEN 1 END) / COUNT(*) * 100, 1) as positive_pct,
      COUNT(*) as total_predictions
    FROM model_predictions
  `).get()) as any;

  console.log(`  • Total predictions: ${modelStats.total_predictions.toLocaleString()}`);
  console.log(`  • Win prediction accuracy: ${modelStats.win_accuracy}%`);
  console.log(`  • Value positive opportunities: ${modelStats.positive_pct}%`);
  console.log(`  • Combined model value: ${modelStats.total_positive_value}\n`);

  // Compare with TrackWise
  console.log('🎯 Comparison Data Ready:\n');
  console.log(`  Use query to compare TrackWise picks vs Betfair model:`);
  console.log(`  SELECT horse_name, actual_result, model_value FROM model_predictions`);
  console.log(`  WHERE date > '2026-01-01' AND model_value > 0\n`);

  const horseComparisons = (db.prepare(`
    SELECT
      h.name,
      h.career_wins,
      h.strike_rate,
      ROUND(m.model_value, 2) as model_value,
      m.race_speed,
      m.rp
    FROM horses h
    LEFT JOIN model_predictions m ON UPPER(h.name) = UPPER(m.horse_name)
    WHERE h.strike_rate > 0.15 AND m.model_value IS NOT NULL
    LIMIT 10
  `).all()) as any[];

  console.log('📈 Top Rated Horses (Model + TrackWise):\n');
  for (const h of horseComparisons) {
    const sr = (h.strike_rate * 100).toFixed(1);
    console.log(`  ${h.name}: ${sr}% SR | Model: ${h.model_value} | Speed: ${h.race_speed}`);
  }

  console.log('\n✅ Model results imported and ready for analysis\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
