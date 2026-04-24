#!/usr/bin/env node
/**
 * Populate comprehensive knowledge base with finishing positions and aggregate statistics
 * This is the key intelligence asset for predicting winners
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// April 11 barrier results (finishing position: barrier → [1st barrier, 2nd barrier, 3rd barrier])
const april11BarrierResults: Record<string, Record<number, number[]>> = {
  'Alice Springs': { 1: [2,6,9], 2: [2,4,6], 3: [7,1,4], 4: [1,2,5], 5: [5,6,1], 6: [3,4,7], 7: [4,7,1] },
  'Bowen': { 1: [3,2,8] },
  'Caulfield': { 1: [7,2,9] },
  'Geraldton': { 1: [6,7,8] },
};

// April 12 barrier results
const april12BarrierResults: Record<string, Record<number, number[]>> = {
  'Alice Springs': { 1: [1,9,10], 2: [2,9,3], 3: [14,8,4], 4: [2,16,14], 5: [1,6,2], 6: [9,4,12], 7: [11,9,10] },
  'Ascot': { 1: [3,2,4], 2: [1,3,2], 3: [4,5,1], 4: [4,12,11], 5: [13,10,5], 6: [3,6,5], 7: [8,6,10], 8: [6,1,5], 10: [1,7,6] },
  'Ballina': { 1: [3,6,2], 2: [3,1,2], 3: [2,1,3], 4: [7,2,6], 5: [6,1,7], 6: [5,8,7] },
  'Bowen': { 1: [3,5,7], 2: [6,7,8], 3: [2,5,6], 4: [1,2,4] },
  'Caulfield': { 1: [4,5,2], 2: [9,6,7], 3: [6,7,5] },
  'Geraldton': { 1: [4,5,2] },
};

function getFinishingResult(position: number): 'WIN' | 'PLACE' | 'LOSS' {
  if (position === 1) return 'WIN';
  if (position <= 3) return 'PLACE';
  return 'LOSS';
}

function fuzzyMatch(a: string, b: string, threshold: number = 0.85): boolean {
  const aNorm = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const bNorm = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  if (aNorm === bNorm) return true;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;

  const matrix: number[][] = [];
  for (let i = 0; i <= bNorm.length; i++) matrix[i] = [i];
  for (let j = 0; j <= aNorm.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= bNorm.length; i++) {
    for (let j = 1; j <= aNorm.length; j++) {
      const cost = aNorm[j - 1] === bNorm[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  const distance = matrix[bNorm.length][aNorm.length];
  const similarity = 1 - (distance / Math.max(aNorm.length, bNorm.length));
  return similarity >= threshold;
}

function populateRaceRunnerResults() {
  console.log('\n📍 POPULATING RACE RUNNER FINISHING POSITIONS\n');

  const allBarriers = { ...april11BarrierResults, ...april12BarrierResults };
  let updated = 0;
  let matched = 0;
  let unmatched = 0;

  for (const [track, dates] of Object.entries(allBarriers)) {
    for (const [raceStr, finishingBarriers] of Object.entries(dates)) {
      const raceNum = parseInt(raceStr);

      // Find races for this track/race
      const races = db.prepare(`
        SELECT id, date FROM races WHERE track = ? AND race_number = ?
      `).all(track, raceNum) as any[];

      for (const race of races) {
        // Get all runners for this race
        const runners = db.prepare(`
          SELECT rr.id, rr.barrier, h.name, rr.horse_id FROM race_runners rr
          JOIN horses h ON rr.horse_id = h.id
          WHERE rr.race_id = ?
        `).all(race.id) as any[];

        // Map finishing barriers to horses
        for (let pos = 0; pos < Math.min(finishingBarriers.length, 3); pos++) {
          const finishingBarrier = finishingBarriers[pos];
          const runner = runners.find(r => r.barrier === finishingBarrier);

          if (runner) {
            const result = getFinishingResult(pos + 1);
            db.prepare(`
              UPDATE race_runners SET finishing_position = ?, result = ?
              WHERE id = ?
            `).run(pos + 1, result, runner.id);
            updated++;
            matched++;
          }
        }
      }
    }
  }

  console.log(`✅ Updated ${updated} race runner finishing positions`);
  console.log(`   Matched: ${matched}\n`);
}

function calculateHorseStatistics() {
  console.log('📊 CALCULATING HORSE STATISTICS\n');

  // Get all horses with race results
  const horses = db.prepare(`
    SELECT DISTINCT h.id, h.name FROM horses h
    JOIN race_runners rr ON h.id = rr.horse_id
    WHERE rr.finishing_position IS NOT NULL
  `).all() as any[];

  let updated = 0;

  for (const horse of horses) {
    // Get all race runner records for this horse
    const runs = db.prepare(`
      SELECT rr.finishing_position, rr.result, r.track, r.distance, r.condition, rr.barrier
      FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE rr.horse_id = ? AND rr.finishing_position IS NOT NULL
      ORDER BY r.date DESC
    `).all(horse.id) as any[];

    if (runs.length === 0) continue;

    const wins = runs.filter(r => r.result === 'WIN').length;
    const places = runs.filter(r => r.result === 'PLACE').length;
    const losses = runs.filter(r => r.result === 'LOSS').length;
    const totalRuns = runs.length;
    const winRate = Math.round((wins / totalRuns) * 100);
    const placeRate = Math.round(((wins + places) / totalRuns) * 100);

    // Calculate average form score (simple: better finishing positions = higher score)
    const avgPosition = runs.reduce((sum, r) => sum + r.finishing_position, 0) / totalRuns;
    const formScore = Math.round((1 - Math.min(avgPosition / 10, 1)) * 100);

    db.prepare(`
      UPDATE horses SET
        career_bets = ?,
        career_wins = ?,
        career_places = ?,
        strike_rate = ?,
        place_rate = ?,
        form_score = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(totalRuns, wins, places, winRate, placeRate, formScore, horse.id);

    updated++;
  }

  console.log(`✅ Updated ${updated} horse statistics\n`);
}

function buildComprehensiveKBStats() {
  console.log('📚 BUILDING COMPREHENSIVE KB STATISTICS\n');

  // Clear existing stats
  db.prepare('DELETE FROM kb_stats').run();

  // 1. By Horse
  console.log('Building KB stats by horse...');
  const horseStats = db.prepare(`
    SELECT
      h.name,
      COUNT(rr.id) as races,
      SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN rr.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      ROUND(AVG(rr.finishing_position), 1) as avg_position
    FROM race_runners rr
    JOIN horses h ON rr.horse_id = h.id
    WHERE rr.finishing_position IS NOT NULL
    GROUP BY h.id
    ORDER BY wins DESC, races DESC
  `).all() as any[];

  let statCount = 0;
  for (const stat of horseStats) {
    const roi = stat.wins > 0 ? Math.round((stat.wins * 2 + stat.places) / stat.races * 100) : 0;
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('HORSE', ?, ?, ?, ?, ?, ?)
    `).run(stat.name, stat.races, stat.wins, stat.places, stat.races * 25, (stat.wins * 50 + stat.places * 25) || 0);
    statCount++;
  }
  console.log(`  ✓ ${statCount} horse statistics`);

  // 2. By Track
  console.log('Building KB stats by track...');
  const trackStats = db.prepare(`
    SELECT
      r.track,
      COUNT(rr.id) as races,
      SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN rr.result = 'PLACE' THEN 1 ELSE 0 END) as places
    FROM race_runners rr
    JOIN races r ON rr.race_id = r.id
    WHERE rr.finishing_position IS NOT NULL
    GROUP BY r.track
    ORDER BY races DESC
  `).all() as any[];

  for (const stat of trackStats) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('TRACK', ?, ?, ?, ?, ?, ?)
    `).run(stat.track, stat.races, stat.wins, stat.places, stat.races * 25, (stat.wins * 50 + stat.places * 25) || 0);
    statCount++;
  }
  console.log(`  ✓ ${statCount - 1} track statistics`);

  // 3. By Barrier
  console.log('Building KB stats by barrier...');
  const barrierStats = db.prepare(`
    SELECT
      rr.barrier,
      COUNT(rr.id) as races,
      SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN rr.result = 'PLACE' THEN 1 ELSE 0 END) as places
    FROM race_runners rr
    WHERE rr.finishing_position IS NOT NULL AND rr.barrier IS NOT NULL
    GROUP BY rr.barrier
    ORDER BY races DESC
  `).all() as any[];

  for (const stat of barrierStats) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('BARRIER', ?, ?, ?, ?, ?, ?)
    `).run(`Barrier ${stat.barrier}`, stat.races, stat.wins, stat.places, stat.races * 25, (stat.wins * 50 + stat.places * 25) || 0);
    statCount++;
  }
  console.log(`  ✓ ${statCount - 1} barrier statistics`);

  // 4. Overall Summary
  console.log('Building overall summary...');
  const overall = db.prepare(`
    SELECT
      COUNT(rr.id) as races,
      SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN rr.result = 'PLACE' THEN 1 ELSE 0 END) as places
    FROM race_runners rr
    WHERE rr.finishing_position IS NOT NULL
  `).get() as any;

  db.prepare(`
    INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
    VALUES ('OVERALL', 'ALL', ?, ?, ?, ?, ?)
  `).run(overall.races, overall.wins, overall.places, overall.races * 25, (overall.wins * 50 + overall.places * 25) || 0);

  console.log(`  ✓ Overall summary\n`);
}

function displayKBSummary() {
  console.log('='.repeat(70));
  console.log('📚 COMPREHENSIVE KB SUMMARY\n');

  const overall = db.prepare(`
    SELECT bets, wins, places FROM kb_stats WHERE stat_type = 'OVERALL'
  `).get() as any;

  if (overall) {
    const losses = overall.bets - overall.wins - overall.places;
    console.log(`Total Races Analyzed: ${overall.bets}`);
    console.log(`  🟢 Wins: ${overall.wins} (${(overall.wins / overall.bets * 100).toFixed(1)}%)`);
    console.log(`  🟡 Places: ${overall.places} (${(overall.places / overall.bets * 100).toFixed(1)}%)`);
    console.log(`  🔴 Losses: ${losses} (${(losses / overall.bets * 100).toFixed(1)}%)\n`);
  }

  // Top horses
  console.log('🏆 TOP 10 PERFORMING HORSES\n');
  const topHorses = db.prepare(`
    SELECT stat_key, bets, wins, places FROM kb_stats
    WHERE stat_type = 'HORSE' AND bets >= 2
    ORDER BY wins DESC, bets DESC
    LIMIT 10
  `).all() as any[];

  for (const horse of topHorses) {
    console.log(`${horse.stat_key}: ${horse.bets} races, ${horse.wins}W ${horse.places}P (${(horse.wins / horse.bets * 100).toFixed(0)}% win rate)`);
  }

  // Best tracks
  console.log('\n📍 TRACK PERFORMANCE\n');
  const tracks = db.prepare(`
    SELECT stat_key, bets, wins, places FROM kb_stats
    WHERE stat_type = 'TRACK'
    ORDER BY wins DESC, bets DESC
  `).all() as any[];

  for (const track of tracks) {
    console.log(`${track.stat_key}: ${track.bets} races, ${track.wins}W ${track.places}P (${(track.wins / track.bets * 100).toFixed(0)}% win rate)`);
  }

  console.log('\n🚧 BARRIER INSIGHTS\n');
  const barriers = db.prepare(`
    SELECT stat_key, bets, wins, places FROM kb_stats
    WHERE stat_type = 'BARRIER'
    ORDER BY wins DESC, bets DESC
    LIMIT 5
  `).all() as any[];

  for (const barrier of barriers) {
    console.log(`${barrier.stat_key}: ${barrier.bets} races, ${barrier.wins}W ${barrier.places}P (${(barrier.wins / barrier.bets * 100).toFixed(0)}% win rate)`);
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

async function main() {
  console.log('\n🧠 BUILDING COMPREHENSIVE KNOWLEDGE BASE\n');
  console.log('This KB contains performance data on all horses, tracks, and barriers');
  console.log('to inform predictive betting decisions.\n');

  try {
    populateRaceRunnerResults();
    calculateHorseStatistics();
    buildComprehensiveKBStats();
    displayKBSummary();

    console.log('✅ Comprehensive KB population complete\n');
    console.log('🎯 This KB is now ready to inform bet selection and prediction\n');
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
