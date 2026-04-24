#!/usr/bin/env node
/**
 * Quick race entry tool - manually input races while browsing websites
 * Stores races in database for knowledge base accumulation
 * Usage: npm run entry
 */

import 'dotenv/config';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '', {
  idle_timeout: 30,
  max_lifetime: 60 * 30,
  prepare: false,
});

interface ManualRace {
  track: string;
  raceNum: number;
  raceTime: string;
  date: string;
  runners: Array<{
    name: string;
    jockey?: string;
    trainer?: string;
    odds: number;
    barrier?: string;
    weight?: string;
  }>;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

async function initDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS manual_races (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      track TEXT NOT NULL,
      race_num INTEGER NOT NULL,
      race_time TEXT,
      runners JSONB NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  console.log('✓ Database ready\n');
}

async function enterRace(): Promise<ManualRace | null> {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║    RACE DATA ENTRY                     ║');
  console.log('╚════════════════════════════════════════╝\n');

  const track = (await prompt('Track (e.g., EAGLE FARM): ')).toUpperCase().trim();
  if (!track) return null;

  const raceNumStr = await prompt('Race # (e.g., 1): ');
  const raceNum = parseInt(raceNumStr);
  if (!raceNum) return null;

  const raceTime = await prompt('Race time (e.g., 2:15pm): ');
  const date = new Date().toISOString().split('T')[0];

  console.log('\nEnter horses (enter empty horse name when done):\n');

  const runners: ManualRace['runners'] = [];
  let horseNum = 1;

  while (true) {
    console.log(`\n--- Horse ${horseNum} ---`);
    const name = (await prompt('Horse name: ')).toUpperCase().trim();

    if (!name) break; // Done entering horses

    const oddsStr = await prompt('Odds (e.g., 2.50): ');
    const odds = parseFloat(oddsStr);

    if (!odds || odds < 1) {
      console.log('⚠ Odds must be > 1');
      continue;
    }

    const jockey = (await prompt('Jockey (optional): ')).trim() || undefined;
    const trainer = (await prompt('Trainer (optional): ')).trim() || undefined;
    const barrier = (await prompt('Barrier (optional): ')).trim() || undefined;
    const weight = (await prompt('Weight (optional): ')).trim() || undefined;

    runners.push({
      name,
      odds,
      jockey,
      trainer,
      barrier,
      weight,
    });

    horseNum++;
  }

  if (runners.length < 3) {
    console.log('⚠ Need at least 3 horses for a race');
    return null;
  }

  return {
    track,
    raceNum,
    raceTime,
    date,
    runners,
  };
}

async function saveRace(race: ManualRace): Promise<boolean> {
  try {
    const id = `${race.date}-${race.track}-${race.raceNum}`;

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${id},
        ${race.date},
        ${race.track},
        ${race.raceNum},
        ${race.raceTime},
        ${JSON.stringify(race.runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners,
        race_time = EXCLUDED.race_time
    `;

    console.log(`\n✓ Saved: ${race.track} R${race.raceNum} (${race.runners.length} horses)`);
    return true;
  } catch (err) {
    console.error('✗ Error saving race:', err);
    return false;
  }
}

async function showStats() {
  try {
    const result = await sql`
      SELECT
        COUNT(*) as total_races,
        COUNT(DISTINCT date) as dates,
        SUM(jsonb_array_length(runners)) as total_horses
      FROM manual_races
    `;

    const stats = result[0];
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    KNOWLEDGE BASE STATS                ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`Total races entered: ${stats.total_races}`);
    console.log(`Unique dates: ${stats.dates}`);
    console.log(`Total horses: ${stats.total_horses}`);
    console.log(
      `Progress: ${stats.total_races}/50 races for full KB (${((stats.total_races / 50) * 100).toFixed(0)}%)\n`
    );
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

async function main() {
  try {
    await initDatabase();

    while (true) {
      console.log('Options:');
      console.log('  1. Enter new race');
      console.log('  2. View stats');
      console.log('  3. Exit\n');

      const choice = await prompt('Choice (1-3): ');

      if (choice === '1') {
        const race = await enterRace();
        if (race) {
          await saveRace(race);
        }
      } else if (choice === '2') {
        await showStats();
      } else if (choice === '3') {
        console.log('\n✓ Goodbye\n');
        break;
      } else {
        console.log('⚠ Invalid choice\n');
      }
    }
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    rl.close();
    await sql.end();
  }
}

main();
