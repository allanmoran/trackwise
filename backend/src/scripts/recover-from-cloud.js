#!/usr/bin/env node

/**
 * recover-from-cloud.js — Recover data from Neon Postgres cloud database
 *
 * Connects to the cloud Postgres, exports all tables, and imports into local SQLite
 */

import postgres from 'postgres';
import db from '../db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLOUD_URL = 'postgresql://neondb_owner:npg_5ukmJpGFd7al@ep-sweet-boat-a7jldduk-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

console.log('\n🌐 TrackWise Cloud Data Recovery\n');
console.log('Connecting to Neon Postgres cloud database...\n');

try {
  // Connect to cloud database
  const sql = postgres(CLOUD_URL, {
    ssl: 'require',
    idle_timeout: 30,
    max_lifetime: 60 * 30,
  });

  // Get all tables
  console.log('📋 Checking database schema...\n');

  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;

  console.log(`Found ${tables.length} tables:\n`);
  tables.forEach(t => console.log(`  - ${t.table_name}`));

  // Try to get bets data
  console.log('\n📊 Checking for bets data...\n');

  let betsCount = 0;
  let betsData = [];

  try {
    const betsResult = await sql`SELECT * FROM bets ORDER BY placed_at DESC`;
    betsCount = betsResult.length;
    betsData = betsResult;
    console.log(`✅ Found ${betsCount} bets in cloud database!\n`);
  } catch (err) {
    console.log(`⚠️  No bets table found or empty: ${err.message}\n`);
  }

  // Try horses
  let horsesCount = 0;
  let horsesData = [];
  try {
    const horsesResult = await sql`SELECT * FROM horses`;
    horsesCount = horsesResult.length;
    horsesData = horsesResult;
    console.log(`✅ Found ${horsesCount} horses`);
  } catch (err) {
    console.log(`⚠️  No horses data: ${err.message}`);
  }

  // Try jockeys
  let joceysCount = 0;
  let joceysData = [];
  try {
    const joceysResult = await sql`SELECT * FROM jockeys`;
    joceysCount = joceysResult.length;
    joceysData = joceysResult;
    console.log(`✅ Found ${joceysCount} jockeys`);
  } catch (err) {
    console.log(`⚠️  No jockeys data: ${err.message}`);
  }

  // Try trainers
  let trainersCount = 0;
  let trainersData = [];
  try {
    const trainersResult = await sql`SELECT * FROM trainers`;
    trainersCount = trainersResult.length;
    trainersData = trainersResult;
    console.log(`✅ Found ${trainersCount} trainers`);
  } catch (err) {
    console.log(`⚠️  No trainers data: ${err.message}`);
  }

  // Try races
  let racesCount = 0;
  let racesData = [];
  try {
    const racesResult = await sql`SELECT * FROM races`;
    racesCount = racesResult.length;
    racesData = racesResult;
    console.log(`✅ Found ${racesCount} races\n`);
  } catch (err) {
    console.log(`⚠️  No races data: ${err.message}\n`);
  }

  // If we found bets, import them to local database
  if (betsCount > 0) {
    console.log('\n💾 Importing to local SQLite database...\n');

    // Import bets
    for (const bet of betsData) {
      db.prepare(`
        INSERT OR REPLACE INTO bets (
          horse_id, jockey_id, trainer_id, bet_type, stake, odds,
          kelly_units, status, result, profit_loss, placed_at, settled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        bet.horse_id || null,
        bet.jockey_id || null,
        bet.trainer_id || null,
        bet.bet_type || 'WIN',
        bet.stake || 0,
        bet.odds || 1.0,
        bet.kelly_units || 0,
        bet.status || 'ACTIVE',
        bet.result || null,
        bet.profit_loss || 0,
        bet.placed_at,
        bet.settled_at || null
      );
    }
    console.log(`✅ Imported ${betsCount} bets`);
  }

  // Import horses if found
  if (horsesCount > 0) {
    for (const horse of horsesData) {
      db.prepare(`
        INSERT OR REPLACE INTO horses (
          name, form_score, class_rating, strike_rate, roi,
          career_bets, career_stake, career_return
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        horse.name,
        horse.form_score || 0,
        horse.class_rating || 0,
        horse.strike_rate || 0,
        horse.roi || 0,
        horse.career_bets || 0,
        horse.career_stake || 0,
        horse.career_return || 0
      );
    }
    console.log(`✅ Imported ${horsesCount} horses`);
  }

  // Import jockeys if found
  if (joceysCount > 0) {
    for (const jockey of joceysData) {
      db.prepare(`
        INSERT OR REPLACE INTO jockeys (
          name, tier, strike_rate, roi, recent_form,
          career_bets, career_stake, career_return
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        jockey.name,
        jockey.tier || 'C',
        jockey.strike_rate || 0,
        jockey.roi || 0,
        jockey.recent_form || 0.5,
        jockey.career_bets || 0,
        jockey.career_stake || 0,
        jockey.career_return || 0
      );
    }
    console.log(`✅ Imported ${joceysCount} jockeys`);
  }

  // Import trainers if found
  if (trainersCount > 0) {
    for (const trainer of trainersData) {
      db.prepare(`
        INSERT OR REPLACE INTO trainers (
          name, tier, strike_rate, roi, recent_form,
          career_bets, career_stake, career_return
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        trainer.name,
        trainer.tier || 'C',
        trainer.strike_rate || 0,
        trainer.roi || 0,
        trainer.recent_form || 0.5,
        trainer.career_bets || 0,
        trainer.career_stake || 0,
        trainer.career_return || 0
      );
    }
    console.log(`✅ Imported ${trainersCount} trainers`);
  }

  // Import races if found
  if (racesCount > 0) {
    for (const race of racesData) {
      db.prepare(`
        INSERT OR REPLACE INTO races (track, date, race_number, race_name, distance, condition, prize_pool)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        race.track,
        race.date,
        race.race_number,
        race.race_name,
        race.distance || 0,
        race.condition || 'Good 4',
        race.prize_pool || 0
      );
    }
    console.log(`✅ Imported ${racesCount} races`);
  }

  console.log('\n✅ Cloud data recovery complete!\n');
  console.log('Summary:');
  console.log(`  Bets:     ${betsCount}`);
  console.log(`  Horses:   ${horsesCount}`);
  console.log(`  Jockeys:  ${joceysCount}`);
  console.log(`  Trainers: ${trainersCount}`);
  console.log(`  Races:    ${racesCount}`);
  console.log('\n💾 All data has been imported to local SQLite database.\n');

  await sql.end();
  process.exit(0);

} catch (err) {
  console.error('\n❌ Recovery failed:\n');
  console.error(err.message);
  console.error('\nPossible issues:');
  console.error('  1. Database URL is invalid');
  console.error('  2. Network connection to Neon is blocked');
  console.error('  3. Database has been deleted');
  console.error('\nTo debug, try:');
  console.error('  psql "postgresql://neondb_owner:...@ep-sweet-boat...?sslmode=require"');
  console.error('\nIf you cannot connect, the cloud database may no longer be available.');
  process.exit(1);
}
