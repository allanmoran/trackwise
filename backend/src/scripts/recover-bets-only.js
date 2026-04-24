#!/usr/bin/env node

/**
 * recover-bets-only.js — Recover bets from cloud + match to races
 */

import postgres from 'postgres';
import db from '../db.js';

const CLOUD_URL = 'postgresql://neondb_owner:npg_5ukmJpGFd7al@ep-sweet-boat-a7jldduk-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

console.log('\n🌐 TrackWise Bets Recovery (Cloud → Local SQLite)\n');

try {
  const sql = postgres(CLOUD_URL, {
    ssl: 'require',
    idle_timeout: 30,
  });

  console.log('📋 Fetching bets from cloud...');

  const betsData = await sql`SELECT * FROM bets ORDER BY created_at DESC LIMIT 500`;

  console.log(`✅ Found ${betsData.length} bets\n`);

  if (betsData.length === 0) {
    console.log('No bets to recover.');
    process.exit(0);
  }

  console.log('💾 Importing to local SQLite...\n');

  let imported = 0;
  let errors = 0;

  for (const bet of betsData) {
    try {
      // Ensure horse exists
      let horseId = null;
      const existingHorse = db.prepare('SELECT id FROM horses WHERE name = ?').get(bet.horse);
      if (existingHorse) {
        horseId = existingHorse.id;
      } else {
        const horseResult = db.prepare('INSERT INTO horses (name, form_score, strike_rate, roi) VALUES (?, ?, ?, ?)').run(bet.horse, 60, 0, 0);
        horseId = horseResult.lastInsertRowid;
      }

      // Ensure jockey exists
      let jockeyId = null;
      if (bet.jockey) {
        const existingJockey = db.prepare('SELECT id FROM jockeys WHERE name = ?').get(bet.jockey);
        if (existingJockey) {
          jockeyId = existingJockey.id;
        } else {
          const jockeyResult = db.prepare('INSERT INTO jockeys (name, tier, strike_rate, roi) VALUES (?, ?, ?, ?)').run(bet.jockey, 'C', 0, 0);
          jockeyId = jockeyResult.lastInsertRowid;
        }
      }

      // Ensure trainer exists
      let trainerId = null;
      if (bet.trainer) {
        const existingTrainer = db.prepare('SELECT id FROM trainers WHERE name = ?').get(bet.trainer);
        if (existingTrainer) {
          trainerId = existingTrainer.id;
        } else {
          const trainerResult = db.prepare('INSERT INTO trainers (name, tier, strike_rate, roi) VALUES (?, ?, ?, ?)').run(bet.trainer, 'C', 0, 0);
          trainerId = trainerResult.lastInsertRowid;
        }
      }

      // Ensure race exists
      let raceId = null;
      const existingRace = db.prepare('SELECT id FROM races WHERE track = ? AND race_number = ? AND date = ?').get(bet.track, bet.race_num, bet.date);
      if (existingRace) {
        raceId = existingRace.id;
      } else {
        const raceResult = db.prepare(`
          INSERT INTO races (track, date, race_number, race_name, distance, condition, prize_pool)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(bet.track, bet.date, bet.race_num, `${bet.track} R${bet.race_num}`, 0, 'Good 4', 0);
        raceId = raceResult.lastInsertRowid;
      }

      // Insert the bet
      db.prepare(`
        INSERT INTO bets (
          horse_id, jockey_id, trainer_id, race_id,
          bet_type, stake, opening_odds, closing_odds,
          ev_percent, clv_percent,
          status, result, profit_loss,
          placed_at, settled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        horseId,
        jockeyId,
        trainerId,
        raceId,
        'WIN',
        parseFloat(bet.stake) || 0,
        parseFloat(bet.opening_odds || bet.odds) || 1.0,
        parseFloat(bet.closing_odds) || null,
        0,
        0,
        (bet.result ? 'SETTLED' : 'ACTIVE'),
        bet.result || null,
        0,
        new Date(bet.created_at).toISOString(),
        (bet.result ? new Date(bet.updated_at).toISOString() : null)
      );
      imported++;
    } catch (e) {
      errors++;
      if (errors <= 5) {
        console.log(`⚠️  Bet ${bet.id}: ${e.message}`);
      }
    }
  }

  console.log(`✅ Imported ${imported} bets (${errors} errors)`);

  // Verify
  const count = db.prepare('SELECT COUNT(*) as count FROM bets').get();
  const raceCount = db.prepare('SELECT COUNT(*) as count FROM races').get();
  console.log(`\nLocal database:\n  Bets: ${count.count}\n  Races: ${raceCount.count}`);

  await sql.end();
  process.exit(0);

} catch (err) {
  console.error('\n❌ Recovery failed:\n');
  console.error(err.message);
  console.error(err.stack);
  process.exit(1);
}
