#!/usr/bin/env node
/**
 * Load comprehensive race results from available sources
 * Populates race_runners with finishing positions for all available races
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// April 11 finishing barrier data (barrier_number: [1st, 2nd, 3rd])
const april11Results: Record<string, Record<number, number[]>> = {
  'Alice Springs': {
    1: [2, 6, 9],
    2: [2, 4, 6],
    3: [7, 1, 4],
    4: [1, 2, 5],
    5: [5, 6, 1],
    6: [3, 4, 7],
    7: [4, 7, 1],
  },
  'Bowen': { 1: [3, 2, 8] },
  'Caulfield': { 1: [7, 2, 9] },
  'Geraldton': { 1: [6, 7, 8] },
};

// April 12 finishing barrier data
const april12Results: Record<string, Record<number, number[]>> = {
  'Alice Springs': {
    1: [1, 9, 10],
    2: [2, 9, 3],
    3: [14, 8, 4],
    4: [2, 16, 14],
    5: [1, 6, 2],
    6: [9, 4, 12],
    7: [11, 9, 10],
  },
  'Ascot': {
    1: [3, 2, 4],
    2: [1, 3, 2],
    3: [4, 5, 1],
    4: [4, 12, 11],
    5: [13, 10, 5],
    6: [3, 6, 5],
    7: [8, 6, 10],
    8: [6, 1, 5],
    10: [1, 7, 6],
  },
  'Ballina': {
    1: [3, 6, 2],
    2: [3, 1, 2],
    3: [2, 1, 3],
    4: [7, 2, 6],
    5: [6, 1, 7],
    6: [5, 8, 7],
  },
  'Bowen': {
    1: [3, 5, 7],
    2: [6, 7, 8],
    3: [2, 5, 6],
    4: [1, 2, 4],
  },
  'Caulfield': {
    1: [4, 5, 2],
    2: [9, 6, 7],
    3: [6, 7, 5],
  },
  'Geraldton': {
    1: [4, 5, 2],
  },
};

function populateRaceResults() {
  console.log('\n🏇 POPULATING RACE RESULTS FROM BARRIER DATA\n');

  const allResults = {
    '2026-04-11': april11Results,
    '2026-04-12': april12Results,
  };

  let totalUpdated = 0;
  let matchedRunners = 0;

  for (const [dateStr, trackResults] of Object.entries(allResults)) {
    console.log(`\n📅 Processing ${dateStr}:`);

    for (const [track, races] of Object.entries(trackResults)) {
      for (const [raceNumStr, finishingBarriers] of Object.entries(races)) {
        const raceNum = parseInt(raceNumStr);

        // Find this race in database
        const race = db.prepare(
          'SELECT id FROM races WHERE track = ? AND race_number = ? AND date = ?'
        ).get(track, raceNum, dateStr) as any;

        if (!race) {
          console.log(`  ⚠️  ${track} R${raceNum} - race not found`);
          continue;
        }

        // Get all runners for this race
        const runners = db.prepare(
          'SELECT id, barrier FROM race_runners WHERE race_id = ? ORDER BY barrier'
        ).all(race.id) as any[];

        if (runners.length === 0) {
          console.log(`  ⚠️  ${track} R${raceNum} - no runners in database`);
          continue;
        }

        // Update finishing positions
        let updatedForRace = 0;
        for (let position = 0; position < Math.min(finishingBarriers.length, 3); position++) {
          const finishingBarrier = finishingBarriers[position];
          const runner = runners.find(r => r.barrier === finishingBarrier);

          if (runner) {
            const result = position === 0 ? 'WIN' : 'PLACE';
            db.prepare(
              'UPDATE race_runners SET finishing_position = ?, result = ? WHERE id = ?'
            ).run(position + 1, result, runner.id);
            updatedForRace++;
            matchedRunners++;
          }
        }

        if (updatedForRace > 0) {
          console.log(`  ✅ ${track} R${raceNum}: ${updatedForRace} positions populated`);
          totalUpdated += updatedForRace;
        }
      }
    }
  }

  console.log(`\n📊 RESULTS POPULATION SUMMARY`);
  console.log(`   Total race runner positions updated: ${totalUpdated}`);
  console.log(`   Total matched runners: ${matchedRunners}\n`);

  return { totalUpdated, matchedRunners };
}

function calculateHorseStatisticsFromRaces() {
  console.log('📈 CALCULATING HORSE STATISTICS FROM RACE RESULTS\n');

  // Get all horses with race results
  const horses = db.prepare(`
    SELECT DISTINCT h.id, h.name FROM horses h
    JOIN race_runners rr ON h.id = rr.horse_id
    WHERE rr.finishing_position IS NOT NULL
  `).all() as any[];

  console.log(`Found ${horses.length} horses with race results\n`);

  let updated = 0;

  for (const horse of horses) {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_races,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'PLACE' THEN 1 ELSE 0 END) as places,
        AVG(finishing_position) as avg_position,
        COUNT(DISTINCT r.track) as tracks
      FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE rr.horse_id = ? AND rr.finishing_position IS NOT NULL
    `).get(horse.id) as any;

    if (stats.total_races === 0) continue;

    const strikeRate = Math.round((stats.wins / stats.total_races) * 100);
    const placeRate = Math.round(((stats.wins + stats.places) / stats.total_races) * 100);
    const formScore = Math.round((1 - Math.min(stats.avg_position / 15, 1)) * 100);

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
    `).run(
      stats.total_races,
      stats.wins,
      stats.places,
      strikeRate,
      placeRate,
      formScore,
      horse.id
    );

    updated++;
  }

  console.log(`✅ Updated ${updated} horses with career statistics\n`);
  return updated;
}

function buildRaceResultKB() {
  console.log('📚 BUILDING KB FROM RACE RESULTS\n');

  db.prepare('DELETE FROM kb_stats').run();

  // 1. By Horse (from race results)
  const horseStats = db.prepare(`
    SELECT
      h.name,
      COUNT(rr.id) as races,
      SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN rr.result = 'PLACE' THEN 1 ELSE 0 END) as places
    FROM race_runners rr
    JOIN horses h ON rr.horse_id = h.id
    WHERE rr.finishing_position IS NOT NULL
    GROUP BY h.id
    ORDER BY wins DESC, races DESC
  `).all() as any[];

  let kbRecords = 0;
  for (const stat of horseStats) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('HORSE', ?, ?, ?, ?, ?, ?)
    `).run(stat.name, stat.races, stat.wins, stat.places, stat.races * 25, (stat.wins * 50 + stat.places * 25));
    kbRecords++;
  }
  console.log(`  ✓ ${kbRecords} horse statistics`);

  // 2. By Track
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
    `).run(stat.track, stat.races, stat.wins, stat.places, stat.races * 25, (stat.wins * 50 + stat.places * 25));
    kbRecords++;
  }
  console.log(`  ✓ ${trackStats.length} track statistics`);

  // 3. Overall
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
  `).run(overall.races, overall.wins, overall.places, overall.races * 25, (overall.wins * 50 + overall.places * 25));

  console.log(`  ✓ Overall summary\n`);
  return kbRecords;
}

function displaySummary() {
  console.log('='.repeat(80));
  console.log('🎯 COMPREHENSIVE RACE RESULTS KB SUMMARY\n');

  const overall = db.prepare(`
    SELECT bets as races, wins, places FROM kb_stats WHERE stat_type = 'OVERALL'
  `).get() as any;

  if (overall) {
    console.log(`Total Races with Results: ${overall.races}`);
    console.log(`  🟢 Wins: ${overall.wins} (${(overall.wins / overall.races * 100).toFixed(1)}%)`);
    console.log(`  🟡 Places: ${overall.places} (${(overall.places / overall.races * 100).toFixed(1)}%)\n`);
  }

  const topHorses = db.prepare(`
    SELECT stat_key, bets, wins, places FROM kb_stats
    WHERE stat_type = 'HORSE' AND bets >= 2
    ORDER BY wins DESC, bets DESC
    LIMIT 10
  `).all() as any[];

  if (topHorses.length > 0) {
    console.log('🏆 TOP HORSES BY WINS\n');
    for (const h of topHorses) {
      console.log(`${h.stat_key}: ${h.bets} races, ${h.wins}W ${h.places}P`);
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  console.log('\n🏇 LOADING COMPREHENSIVE RACE RESULTS\n');

  try {
    const { totalUpdated } = populateRaceResults();
    if (totalUpdated === 0) {
      console.log('⚠️  No race results were populated. Checking if barrier data matches form cards...');
      // Debug info
      const sampleRace = db.prepare(
        'SELECT r.id, r.track, r.race_number, r.date FROM races LIMIT 1'
      ).get() as any;
      if (sampleRace) {
        const runners = db.prepare(
          'SELECT id, barrier FROM race_runners WHERE race_id = ? LIMIT 5'
        ).all(sampleRace.id) as any[];
        console.log(`Sample race ${sampleRace.track} R${sampleRace.race_number} runners:`);
        runners.forEach(r => console.log(`  - Barrier: ${r.barrier}`));
      }
      return;
    }

    calculateHorseStatisticsFromRaces();
    buildRaceResultKB();
    displaySummary();

    console.log('✅ Comprehensive race results KB built successfully\n');
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
