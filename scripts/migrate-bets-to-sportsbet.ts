#!/usr/bin/env node
/**
 * Migrate orphaned bets to actual Sportsbet races
 *
 * This script:
 * 1. Creates new races with actual Sportsbet meeting IDs
 * 2. Migrates pending bets to the new races
 * 3. Updates the meeting_id field
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Sportsbet track ID mapping
const TRACK_MAPPING = {
  'Alice Springs': '435951',
  'Ascot': '436088',
  'Ballina': '435964',
  'Bowen': '436054',
};

interface BetToMigrate {
  betId: number;
  trackName: string;
  raceNum: number;
  horseId: number;
  horseName: string;
  stake: number;
  openingOdds: number;
  closingOdds: number;
}

async function migrateBets() {
  console.log('\n🔄 MIGRATING BETS TO SPORTSBET RACES\n');

  let totalMigrated = 0;
  const results: Record<string, any> = {};

  // Process each track
  for (const [trackName, trackId] of Object.entries(TRACK_MAPPING)) {
    console.log(`\n📍 ${trackName} (Track ID: ${trackId})`);

    try {
      // Get pending bets for this track
      const bets: BetToMigrate[] = db.prepare(`
        SELECT
          b.id as betId,
          r.track as trackName,
          r.race_number as raceNum,
          b.horse_id as horseId,
          h.name as horseName,
          b.stake,
          b.opening_odds as openingOdds,
          b.closing_odds as closingOdds
        FROM bets b
        JOIN races r ON b.race_id = r.id
        JOIN horses h ON b.horse_id = h.id
        WHERE r.track = ?
          AND r.date = '2026-04-12'
          AND b.result IS NULL
        ORDER BY r.race_number
      `).all(trackName) as BetToMigrate[];

      if (bets.length === 0) {
        console.log(`   ℹ️  No pending bets`);
        continue;
      }

      console.log(`   Found ${bets.length} pending bets`);

      // Group bets by race number
      const betsByRace = new Map<number, BetToMigrate[]>();
      for (const bet of bets) {
        if (!betsByRace.has(bet.raceNum)) {
          betsByRace.set(bet.raceNum, []);
        }
        betsByRace.get(bet.raceNum)!.push(bet);
      }

      // For each race, create or find corresponding Sportsbet race
      let raceMigrated = 0;
      for (const [raceNum, raceBets] of betsByRace) {
        try {
          // Find or create race with meeting_id
          let newRaceId = db.prepare(`
            SELECT id FROM races
            WHERE track = ? AND date = '2026-04-12' AND race_number = ? AND meeting_id IS NOT NULL
          `).get(trackName, raceNum);

          if (!newRaceId) {
            // Create new race with meeting_id
            const stmt = db.prepare(`
              INSERT INTO races (track, date, race_number, race_name, meeting_id)
              VALUES (?, '2026-04-12', ?, ?, ?)
            `);

            const meetingId = `${trackId}_R${raceNum}`;
            const raceNameVar = `${trackName} Race ${raceNum}`;

            try {
              stmt.run(trackName, raceNum, raceNameVar, trackId);
              newRaceId = db.prepare('SELECT last_insert_rowid() as id').get();
            } catch (err: any) {
              // Race might already exist
              newRaceId = db.prepare(`
                SELECT id FROM races
                WHERE track = ? AND date = '2026-04-12' AND race_number = ?
              `).get(trackName, raceNum);
            }
          }

          if (!newRaceId) {
            console.log(`     ⚠️  Could not create/find race ${raceNum}`);
            continue;
          }

          // Migrate all bets for this race
          const raceId = (newRaceId as any).id;
          for (const bet of raceBets) {
            db.prepare(`
              UPDATE bets SET race_id = ? WHERE id = ?
            `).run(raceId, bet.betId);
          }

          raceMigrated++;
          console.log(`     ✓ Race ${raceNum}: ${raceBets.length} bets migrated`);
        } catch (err: any) {
          console.log(`     ❌ Race ${raceNum}: ${err.message}`);
        }
      }

      results[trackName] = {
        bets: bets.length,
        racesMigrated: raceMigrated,
        status: raceMigrated > 0 ? 'SUCCESS' : 'FAILED'
      };

      totalMigrated += bets.length;
    } catch (err: any) {
      console.log(`   ❌ Error: ${err.message}`);
      results[trackName] = { status: 'ERROR', error: err.message };
    }
  }

  // Summary
  console.log('\n\n📊 MIGRATION SUMMARY\n');
  console.log('Track'.padEnd(15) + ' Bets'.padEnd(8) + ' Status');
  console.log(''.padEnd(30, '─'));
  for (const [track, info] of Object.entries(results)) {
    const icon = info.status === 'SUCCESS' ? '✓' : '❌';
    console.log(icon + ' ' + track.padEnd(13) + (info.bets || 0).toString().padEnd(6) + ' ' + info.status);
  }
  console.log(''.padEnd(30, '─'));
  console.log(`Total bets migrated: ${totalMigrated}\n`);

  // Check remaining unmapped bets
  const unmappedCount = db.prepare(`
    SELECT COUNT(*) as count FROM bets b
    JOIN races r ON b.race_id = r.id
    WHERE r.date = '2026-04-12'
      AND b.result IS NULL
      AND r.track NOT IN ('Ascot', 'Bowen', 'Alice Springs', 'Ballina')
  `).get();

  console.log(`⚠️  Unmapped bets (Caulfield, Geraldton): ${(unmappedCount as any).count}`);
  console.log('\n');
}

migrateBets().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
