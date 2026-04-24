#!/usr/bin/env node
/**
 * Generate synthetic historical race data for KB bootstrapping
 * Creates realistic Australian racing scenarios for backtesting
 *
 * Usage: npx tsx scripts/generate-synthetic-kb.ts [count]
 * Example: npx tsx scripts/generate-synthetic-kb.ts 500
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

// Australian racing tracks
const TRACKS = [
  'Flemington', 'Caulfield', 'Sandown', 'Moonee Valley',
  'Morphettville', 'Gawler', 'Adelaide Oval',
  'Sydney', 'Randwick', 'Rosehill', 'Hawkesbury',
  'Melbourne', 'Hobart', 'Launceston',
  'Eagle Farm', 'Doomben', 'Toowoomba',
  'Perth', 'Ascot', 'Belmont'
];

// Real jockeys from existing KB
const JOCKEYS = [
  'James McDonald', 'Craig Williams', 'Damien Oliver',
  'Beau Mertens', 'Lachlan Neindorf', 'Daniel Stackhouse',
  'Valentin Le Boeuf', 'Zac Spain', 'Jake Noonan',
  'Stephen Massingham', 'Rachael Singleton', 'Maria Potiris',
  'Cejay Graham', 'Damien Thornton', 'John Allen'
];

// Real trainers from existing KB
const TRAINERS = [
  'Peter Gelagotis', 'B Will & J Hayes', 'G Eurell',
  'M Price & M K Jnr', 'Tim Hughes', 'A & S Freedman',
  'A & J Williams', 'Charlotte Littlefield', 'T Busuttin & N Young',
  'R C Manning', 'Ryan Wiggins', 'Samantha Pointon',
  'Aidan Holt', 'Jack Bruce', 'J W Mason'
];

// Sample horse names
const HORSE_PREFIXES = [
  'Desert', 'Mountain', 'River', 'Storm', 'Fire', 'Wind',
  'Shadow', 'Golden', 'Royal', 'Thunder', 'Fortune', 'Dragon'
];

const HORSE_SUFFIXES = [
  'Runner', 'Dancer', 'Flyer', 'Raider', 'Strike', 'Blaze',
  'Storm', 'Queen', 'King', 'Spirit', 'Heart', 'Soul'
];

function randomHorseName(): string {
  const prefix = HORSE_PREFIXES[Math.floor(Math.random() * HORSE_PREFIXES.length)];
  const suffix = HORSE_SUFFIXES[Math.floor(Math.random() * HORSE_SUFFIXES.length)];
  return `${prefix} ${suffix}`;
}

function randomOdds(min: number = 1.2, max: number = 50): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomConfidence(): number {
  // Distribution: 40-80% confidence (realistic for form-based picking)
  return Math.floor(Math.random() * 40 + 40);
}

function randomResult(): 'WIN' | 'PLACE' | 'LOSS' {
  const rand = Math.random();
  if (rand < 0.25) return 'WIN';
  if (rand < 0.50) return 'PLACE';
  return 'LOSS';
}

interface SyntheticRace {
  date: string;
  track: string;
  raceNum: number;
  distance: number;
  condition: 'Firm' | 'Good' | 'Soft' | 'Heavy';
  runners: Array<{
    horseName: string;
    jockey: string;
    trainer: string;
    barrier: number;
    weight: number;
    odds: number;
    confidence: number;
    result: 'WIN' | 'PLACE' | 'LOSS';
  }>;
}

function generateSyntheticRace(date: string, trackIndex: number, raceNum: number): SyntheticRace {
  const track = TRACKS[trackIndex % TRACKS.length];
  const distance = [1000, 1200, 1400, 1600, 2000, 2400][Math.floor(Math.random() * 6)];
  const condition: 'Firm' | 'Good' | 'Soft' | 'Heavy' = ['Firm', 'Good', 'Soft', 'Heavy'][Math.floor(Math.random() * 4)] as any;

  const runnerCount = Math.floor(Math.random() * 8) + 8; // 8-15 runners
  const runners = [];

  for (let i = 0; i < runnerCount; i++) {
    const odds = randomOdds();
    const confidence = randomConfidence();

    runners.push({
      horseName: randomHorseName(),
      jockey: JOCKEYS[Math.floor(Math.random() * JOCKEYS.length)],
      trainer: TRAINERS[Math.floor(Math.random() * TRAINERS.length)],
      barrier: i + 1,
      weight: Math.round(Math.random() * 10 + 50) + (Math.random() * 0.5), // 50-60kg range
      odds,
      confidence,
      result: randomResult()
    });
  }

  return { date, track, raceNum, distance, condition, runners };
}

async function generateKB(count: number) {
  console.log(`[Synthetic KB Generator]`);
  console.log(`🎲 Generating ${count} synthetic races...\n`);

  let racesAdded = 0;
  let runnersAdded = 0;
  const startDate = new Date('2026-02-01');

  for (let i = 0; i < count; i++) {
    const daysOffset = Math.floor(i / 8); // ~8 races per day
    const raceNum = (i % 8) + 1;

    const date = new Date(startDate);
    date.setDate(date.getDate() + daysOffset);
    const dateStr = date.toISOString().split('T')[0];

    const trackIndex = Math.floor(Math.random() * TRACKS.length);
    const race = generateSyntheticRace(dateStr, trackIndex, raceNum);

    try {
      // Insert race (using simple insert without distance/condition for now)
      const raceResult = await sql`
        INSERT INTO races (date, track, race_num)
        VALUES (${race.date}, ${race.track}, ${race.raceNum})
        ON CONFLICT DO NOTHING
        RETURNING id
      `;

      if (raceResult.length > 0) {
        racesAdded++;
      }

      // Insert runners and update stats
      for (const runner of race.runners) {
        // Insert runner (link to race if race was created)
        if (raceResult.length > 0) {
          const raceId = raceResult[0].id;
          await sql`
            INSERT INTO runners (race_id, horse_name, jockey, trainer, barrier, weight, odds)
            VALUES (${raceId}, ${runner.horseName}, ${runner.jockey}, ${runner.trainer}, ${runner.barrier}, ${runner.weight}, ${runner.odds})
            ON CONFLICT DO NOTHING
          `;
          runnersAdded++;
        }

        // Update horse stats
        const isWin = runner.result === 'WIN' ? 1 : 0;
        const isPlace = runner.result === 'PLACE' ? 1 : 0;

        await sql`
          INSERT INTO horse_stats (horse_name, track, total_runs, total_wins, total_places)
          VALUES (${runner.horseName}, ${race.track}, 1, ${isWin}, ${isPlace})
          ON CONFLICT (horse_name, track) DO UPDATE SET
            total_runs = horse_stats.total_runs + 1,
            total_wins = horse_stats.total_wins + ${isWin},
            total_places = horse_stats.total_places + ${isPlace}
        `;

        // Update jockey stats
        await sql`
          INSERT INTO jockey_stats (jockey_name, total_runs, total_wins, total_places)
          VALUES (${runner.jockey}, 1, ${isWin}, ${isPlace})
          ON CONFLICT (jockey_name) DO UPDATE SET
            total_runs = jockey_stats.total_runs + 1,
            total_wins = jockey_stats.total_wins + ${isWin},
            total_places = jockey_stats.total_places + ${isPlace}
        `;

        // Update trainer stats
        await sql`
          INSERT INTO trainer_stats (trainer_name, total_runs, total_wins, total_places)
          VALUES (${runner.trainer}, 1, ${isWin}, ${isPlace})
          ON CONFLICT (trainer_name) DO UPDATE SET
            total_runs = trainer_stats.total_runs + 1,
            total_wins = trainer_stats.total_wins + ${isWin},
            total_places = trainer_stats.total_places + ${isPlace}
        `;
      }

      // Progress indicator
      if ((i + 1) % 50 === 0) {
        console.log(`  ✓ Generated ${i + 1}/${count} races`);
      }
    } catch (err) {
      console.error(`Error processing race ${i}:`, err);
    }
  }

  console.log(`\n✅ Synthetic KB Generated!`);
  console.log(`   Races added: ${racesAdded}`);
  console.log(`   Runners added: ${runnersAdded}`);
  console.log(`   KB is now ready for backtesting and model validation\n`);

  await sql.end();
}

const count = parseInt(process.argv[2] ?? '500', 10);
generateKB(count).catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
