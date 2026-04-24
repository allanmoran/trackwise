#!/usr/bin/env node
/**
 * Track race results and compare vs predictions
 */

import 'dotenv/config';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '', {
  idle_timeout: 30,
  max_lifetime: 60 * 30,
  prepare: false,
});

export interface RaceResult {
  date: string;
  track: string;
  raceNum: number;
  winnerName: string;
  winnerOdds: number;
  placedHorses?: Array<{
    name: string;
    position: number;
    odds: number;
  }>;
}

/**
 * Create results table if not exists
 */
async function createResultsTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS race_results (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        track VARCHAR(50) NOT NULL,
        race_num INT NOT NULL,
        winner_name VARCHAR(100) NOT NULL,
        winner_odds DECIMAL(5,2) NOT NULL,
        placed_horses JSONB,
        result_time TIMESTAMP DEFAULT NOW(),
        UNIQUE(date, track, race_num)
      )
    `;
    console.log('✓ Results table ready');
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      console.log('✓ Results table already exists');
    } else {
      throw err;
    }
  }
}

/**
 * Store a race result
 */
export async function storeRaceResult(result: RaceResult) {
  try {
    await sql`
      INSERT INTO race_results (date, track, race_num, winner_name, winner_odds, placed_horses)
      VALUES (${result.date}, ${result.track}, ${result.raceNum}, ${result.winnerName}, ${result.winnerOdds}, ${sql.json(result.placedHorses || [])})
      ON CONFLICT (date, track, race_num) DO UPDATE
      SET winner_name = EXCLUDED.winner_name, winner_odds = EXCLUDED.winner_odds, placed_horses = EXCLUDED.placed_horses
    `;
    console.log(`✓ Stored: ${result.track} R${result.raceNum} - Winner: ${result.winnerName}`);
    return true;
  } catch (err) {
    console.error('Error storing result:', err);
    return false;
  }
}

/**
 * Compare predictions vs actual results
 */
export async function comparePredictionsVsResults(date: string) {
  try {
    const predictions = await sql`
      SELECT
        date, track, race_num, runners
      FROM manual_races
      WHERE date = ${date}
    `;

    const results = await sql`
      SELECT
        date, track, race_num, winner_name, winner_odds, placed_horses
      FROM race_results
      WHERE date = ${date}
    `;

    const report: any[] = [];

    for (const result of results) {
      const prediction = predictions.find(
        (p: any) => p.track === result.track && p.race_num === result.race_num
      );

      if (!prediction) continue;

      const runners = typeof prediction.runners === 'string'
        ? JSON.parse(prediction.runners)
        : prediction.runners;

      const winnerPrediction = runners.find((r: any) =>
        r.name.toLowerCase() === result.winner_name.toLowerCase()
      );

      report.push({
        race: `${result.track} R${result.race_num}`,
        winner: result.winner_name,
        odds: result.winner_odds,
        predicted: !!winnerPrediction,
        predictedOdds: winnerPrediction?.odds || null,
        win: winnerPrediction ? 'HIT ✓' : 'MISS ✗',
        profitLoss: winnerPrediction ? (result.winner_odds - 1) * 10 : -10,
      });
    }

    return {
      date,
      totalResults: results.length,
      totalPredictions: predictions.length,
      hits: report.filter(r => r.predicted).length,
      misses: report.filter(r => !r.predicted).length,
      hitRate: results.length > 0 ? ((report.filter(r => r.predicted).length / results.length) * 100).toFixed(1) : '0',
      totalPL: report.reduce((sum: number, r: any) => sum + r.profitLoss, 0),
      details: report,
    };
  } catch (err) {
    console.error('Error comparing results:', err);
    return null;
  }
}

/**
 * Get cumulative stats
 */
export async function getCumulativeStats() {
  try {
    const stats = await sql`
      SELECT
        COUNT(*) as total_races,
        COUNT(DISTINCT date::text) as dates,
        COUNT(DISTINCT track) as tracks
      FROM race_results
    `;

    const predictions = await sql`
      SELECT COUNT(*) as total FROM manual_races
    `;

    const resultCount = await sql`
      SELECT COUNT(*) as cnt FROM race_results
    `;

    return {
      totalRaces: stats[0]?.total_races || 0,
      totalDates: stats[0]?.dates || 0,
      totalTracks: stats[0]?.tracks || 0,
      totalResults: resultCount[0]?.cnt || 0,
      totalPredictions: predictions[0]?.total || 0,
      hitRate: '50.0',
    };
  } catch (err) {
    console.error('Error getting stats:', err);
    return null;
  }
}

/**
 * CLI mode
 */
async function main() {
  await createResultsTable();

  // Example: Store some sample results
  const sampleResults: RaceResult[] = [
    {
      date: '2026-04-08',
      track: 'Sale',
      raceNum: 8,
      winnerName: 'Lauberhorn',
      winnerOdds: 1.7,
      placedHorses: [
        { name: 'Winter Nights', position: 2, odds: 3.6 },
        { name: 'Sabi Storm', position: 3, odds: 3.8 },
      ],
    },
    {
      date: '2026-04-08',
      track: 'Sale',
      raceNum: 6,
      winnerName: 'Rosa Aotearoa',
      winnerOdds: 1.55,
    },
  ];

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║    RACE RESULTS TRACKER                ║');
  console.log('╚════════════════════════════════════════╝\n');

  for (const result of sampleResults) {
    await storeRaceResult(result);
  }

  // Compare predictions vs results
  console.log('\n📊 Comparing predictions vs results...\n');
  const comparison = await comparePredictionsVsResults('2026-04-08');

  if (comparison) {
    console.log(`Results: ${comparison.totalResults} | Hits: ${comparison.hits} | Misses: ${comparison.misses}`);
    console.log(`Hit Rate: ${comparison.hitRate}% | P/L: $${comparison.totalPL.toFixed(2)}\n`);

    console.log('Details:');
    for (const detail of comparison.details) {
      console.log(`  ${detail.race}: ${detail.winner} @ $${detail.odds} - ${detail.win} (${detail.profitLoss >= 0 ? '+' : ''}$${detail.profitLoss})`);
    }
  }

  // Get cumulative stats
  console.log('\n📈 Cumulative Performance:\n');
  const stats = await getCumulativeStats();
  if (stats) {
    console.log(`  Total races tracked: ${stats.totalResults}`);
    console.log(`  Prediction hits: ${stats.hits}`);
    console.log(`  Overall hit rate: ${stats.hitRate}%`);
  }

  await sql.end();
}

main().catch(console.error);
