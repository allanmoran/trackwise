#!/usr/bin/env node
/**
 * Sync comprehensive KB from SQLite to Neon PostgreSQL cloud database
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const neonUrl = process.env.DATABASE_URL;

if (!neonUrl) {
  console.error('❌ DATABASE_URL not configured in .env.local');
  process.exit(1);
}

async function initializeNeonSchema(client: pg.Client) {
  console.log('📊 Initializing Neon schema...');

  const schema = `
    -- Horses table
    CREATE TABLE IF NOT EXISTS horses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      age INTEGER,
      career_wins INTEGER DEFAULT 0,
      career_places INTEGER DEFAULT 0,
      career_bets INTEGER DEFAULT 0,
      career_stake REAL DEFAULT 0,
      career_return REAL DEFAULT 0,
      strike_rate REAL,
      place_rate REAL,
      roi REAL,
      form_score INTEGER,
      avg_odds REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Races table
    CREATE TABLE IF NOT EXISTS races (
      id SERIAL PRIMARY KEY,
      track TEXT NOT NULL,
      date DATE NOT NULL,
      race_number INTEGER NOT NULL,
      race_name TEXT,
      race_time TEXT,
      distance INTEGER,
      condition TEXT,
      prize_pool REAL,
      meeting_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(track, date, race_number)
    );

    -- Race runners table
    CREATE TABLE IF NOT EXISTS race_runners (
      id SERIAL PRIMARY KEY,
      race_id INTEGER REFERENCES races(id),
      horse_id INTEGER REFERENCES horses(id),
      barrier INTEGER,
      finishing_position INTEGER,
      result TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- KB stats table
    CREATE TABLE IF NOT EXISTS kb_stats (
      id SERIAL PRIMARY KEY,
      stat_type TEXT NOT NULL,
      stat_key TEXT NOT NULL,
      bets INTEGER,
      wins INTEGER,
      places INTEGER,
      stake REAL,
      return_amount REAL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(stat_type, stat_key)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_horses_name ON horses(name);
    CREATE INDEX IF NOT EXISTS idx_races_track_date ON races(track, date);
    CREATE INDEX IF NOT EXISTS idx_race_runners_result ON race_runners(result);
    CREATE INDEX IF NOT EXISTS idx_kb_stats_type ON kb_stats(stat_type);
  `;

  for (const statement of schema.split(';').filter(s => s.trim())) {
    await client.query(statement);
  }

  console.log('   ✅ Schema initialized\n');
}

async function syncHorses(localDb: any, neonClient: pg.Client) {
  console.log('🐴 Syncing horses...');

  const horses = localDb.prepare('SELECT * FROM horses').all() as any[];

  await neonClient.query('TRUNCATE horses CASCADE');

  let inserted = 0;
  for (const horse of horses) {
    await neonClient.query(
      `INSERT INTO horses (id, name, age, career_wins, career_places, career_bets, career_stake,
                          career_return, strike_rate, place_rate, roi, form_score, avg_odds, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (name) DO UPDATE SET
         career_wins = $4, career_places = $5, career_bets = $6, strike_rate = $9,
         place_rate = $10, roi = $11, form_score = $12`,
      [
        horse.id, horse.name, horse.age, horse.career_wins, horse.career_places,
        horse.career_bets, horse.career_stake, horse.career_return, horse.strike_rate,
        horse.place_rate, horse.roi, horse.form_score, horse.avg_odds, new Date(),
      ]
    );
    inserted++;
  }

  console.log(`   ✅ ${inserted} horses synced\n`);
}

async function syncRaces(localDb: any, neonClient: pg.Client) {
  console.log('🏇 Syncing races...');

  const races = localDb.prepare('SELECT * FROM races').all() as any[];

  await neonClient.query('TRUNCATE races CASCADE');

  let inserted = 0;
  for (const race of races) {
    try {
      await neonClient.query(
        `INSERT INTO races (id, track, date, race_number, race_name, race_time, distance, condition, prize_pool, meeting_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (track, date, race_number) DO NOTHING`,
        [race.id, race.track, race.date, race.race_number, race.race_name, race.race_time, race.distance, race.condition, race.prize_pool, race.meeting_id]
      );
      inserted++;
    } catch (err) {
      // Skip if insert fails
    }
  }

  console.log(`   ✅ ${inserted} races synced\n`);
}

async function syncRaceRunners(localDb: any, neonClient: pg.Client) {
  console.log('🏁 Syncing race results...');

  const runners = localDb.prepare('SELECT * FROM race_runners').all() as any[];

  await neonClient.query('TRUNCATE race_runners');

  let inserted = 0;
  for (const runner of runners) {
    await neonClient.query(
      `INSERT INTO race_runners (id, race_id, horse_id, barrier, finishing_position, result)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [runner.id, runner.race_id, runner.horse_id, runner.barrier, runner.finishing_position, runner.result]
    );
    inserted++;
  }

  console.log(`   ✅ ${inserted} race results synced\n`);
}

async function syncKBStats(localDb: any, neonClient: pg.Client) {
  console.log('📊 Syncing KB statistics...');

  const stats = localDb.prepare('SELECT * FROM kb_stats').all() as any[];

  await neonClient.query('TRUNCATE kb_stats');

  let inserted = 0;
  for (const stat of stats) {
    await neonClient.query(
      `INSERT INTO kb_stats (id, stat_type, stat_key, bets, wins, places, stake, return_amount, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [stat.id, stat.stat_type, stat.stat_key, stat.bets, stat.wins, stat.places, stat.stake, stat.return_amount, new Date()]
    );
    inserted++;
  }

  console.log(`   ✅ ${inserted} KB statistics synced\n`);
}

async function verifySyncComplete(localDb: any, neonClient: pg.Client) {
  console.log('✅ Verifying sync...\n');

  const localStats = {
    horses: (localDb.prepare('SELECT COUNT(*) as count FROM horses').get() as any).count,
    races: (localDb.prepare('SELECT COUNT(*) as count FROM races').get() as any).count,
    runners: (localDb.prepare('SELECT COUNT(*) as count FROM race_runners').get() as any).count,
    kbStats: (localDb.prepare('SELECT COUNT(*) as count FROM kb_stats').get() as any).count,
  };

  const neonStats = {
    horses: (await neonClient.query('SELECT COUNT(*) as count FROM horses')).rows[0].count,
    races: (await neonClient.query('SELECT COUNT(*) as count FROM races')).rows[0].count,
    runners: (await neonClient.query('SELECT COUNT(*) as count FROM race_runners')).rows[0].count,
    kbStats: (await neonClient.query('SELECT COUNT(*) as count FROM kb_stats')).rows[0].count,
  };

  console.log('📈 SYNC VERIFICATION\n');
  console.log('Local SQLite → Neon PostgreSQL\n');

  const matches = {
    horses: localStats.horses === parseInt(neonStats.horses),
    races: localStats.races === parseInt(neonStats.races),
    runners: localStats.runners === parseInt(neonStats.runners),
    kbStats: localStats.kbStats === parseInt(neonStats.kbStats),
  };

  console.log(`Horses:       ${localStats.horses.toLocaleString()} → ${neonStats.horses} ${matches.horses ? '✅' : '❌'}`);
  console.log(`Races:        ${localStats.races.toLocaleString()} → ${neonStats.races} ${matches.races ? '✅' : '❌'}`);
  console.log(`Race Results: ${localStats.runners.toLocaleString()} → ${neonStats.runners} ${matches.runners ? '✅' : '❌'}`);
  console.log(`KB Stats:     ${localStats.kbStats.toLocaleString()} → ${neonStats.kbStats} ${matches.kbStats ? '✅' : '❌'}\n`);

  return Object.values(matches).every(m => m);
}

async function main() {
  console.log('\n☁️  SYNCING KB TO NEON CLOUD DATABASE\n');

  const localDb = new Database(dbPath);
  const neonClient = new pg.Client({ connectionString: neonUrl });

  try {
    console.log('🔗 Connecting to Neon...');
    await neonClient.connect();
    console.log('   ✅ Connected\n');

    // Initialize schema
    await initializeNeonSchema(neonClient);

    // Sync all tables
    await syncHorses(localDb, neonClient);
    await syncRaces(localDb, neonClient);
    await syncRaceRunners(localDb, neonClient);
    await syncKBStats(localDb, neonClient);

    // Verify
    const verified = await verifySyncComplete(localDb, neonClient);

    console.log(verified ? '✅ SYNC COMPLETE - All data verified\n' : '⚠️  SYNC COMPLETE - Review counts above\n');

    console.log('💾 Backup Locations:\n');
    console.log(`   Local: /Users/mora0145/Downloads/TrackWise/backups/2026-04-16/`);
    console.log(`   Cloud: Neon PostgreSQL (ap-southeast-2)\n`);
  } catch (err) {
    console.error(`❌ Sync failed: ${(err as any).message}`);
    process.exit(1);
  } finally {
    localDb.close();
    await neonClient.end();
  }
}

main();
