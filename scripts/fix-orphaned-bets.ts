#!/usr/bin/env node
/**
 * Fix orphaned bets by linking them to actual Sportsbet races
 *
 * Problem: Database has orphaned races with no meeting_id
 * Solution: Create new races with actual Sportsbet meeting IDs and migrate bets
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Track ID to name mapping (from extract-daily-races.ts and scrape-today-results.ts)
const TRACK_MAPPING: Record<string, string> = {
  '435951': 'Alice Springs',
  '435956': 'Doomben',
  '435963': 'Benalla',
  '435964': 'Ballina',
  '435965': 'Warrnambool',
  '435966': 'Rockhampton',
  '435967': 'Toowoomba',
  '435975': 'Werribee',
  '435979': 'Morphettville',
  '435955': 'Goulburn',
  '435974': 'Caulfield',
  '436054': 'Bowen',
  '436088': 'Ascot',
  '436089': 'Narrogin',
  '436344': 'Newcastle',
  // More complete list
  '435950': 'Darwin',
  '435960': 'Gatton',
  '435967': 'Geelong',
  '435954': 'Gold Coast',
  '435951': 'Launceston',
  '435955': 'Murray Bridge',
  '435956': 'Tamworth',
  '435957': 'Wellington',
  '435973': 'Sandown',
  '435968': 'Moonee Valley',
  '435969': 'Caulfield',
  '435970': 'Flemington',
};

// Races from SPORTSBET_ALL_TRACK_IDS.json for today
const SPORTSBET_RACES: Record<string, string[]> = {
  '436088': ['3308971', '3308972', '3308973', '3308974', '3308975', '3308976', '3308977'], // Ascot - 7 races
  '436054': ['3309020', '3309027', '3309031', '3309033', '3309035'], // Bowen - 5 races
  '435951': ['3308201', '3308203', '3308206', '3308207', '3308208', '3308209', '3308210'], // Alice Springs - 7 races (old ID)
};

interface OrphanedRace {
  id: number;
  track: string;
  race_number: number;
  date: string;
  bet_count: number;
}

async function analyzeOrphanedBets() {
  console.log('\n🔍 ANALYZING ORPHANED BETS\n');

  // Get all orphaned races (with no meeting_id)
  const orphaned: OrphanedRace[] = db.prepare(`
    SELECT DISTINCT r.id, r.track, r.race_number, r.date, COUNT(b.id) as bet_count
    FROM races r
    LEFT JOIN bets b ON r.id = b.race_id
    WHERE r.date = '2026-04-12'
      AND r.meeting_id IS NULL
      AND b.result IS NULL
    GROUP BY r.id
    ORDER BY r.track, r.race_number
  `).all() as OrphanedRace[];

  console.log(`Found ${orphaned.length} orphaned races with pending bets:\n`);

  // Group by track
  const byTrack = new Map<string, OrphanedRace[]>();
  for (const race of orphaned) {
    if (!byTrack.has(race.track)) {
      byTrack.set(race.track, []);
    }
    byTrack.get(race.track)!.push(race);
  }

  let totalBets = 0;
  const results: Record<string, any> = {};

  for (const [track, races] of Array.from(byTrack.entries()).sort()) {
    const trackBets = races.reduce((sum, r) => sum + r.bet_count, 0);
    totalBets += trackBets;

    // Find matching Sportsbet track ID
    const trackId = Object.entries(TRACK_MAPPING).find(([, name]) => name === track)?.[0];
    const hasRaces = trackId && SPORTSBET_RACES[trackId];

    console.log(`  📍 ${track}: ${races.length} races, ${trackBets} pending bets`);
    console.log(`     Race numbers: ${races.map(r => `R${r.race_number}`).join(', ')}`);
    if (trackId) {
      console.log(`     Sportsbet track ID: ${trackId}${hasRaces ? ' ✓' : ' ❌ (no races found)'}`);
    } else {
      console.log(`     Sportsbet track ID: ❌ (NOT IN MAPPING)`);
    }

    results[track] = {
      races: races.length,
      bets: trackBets,
      trackId: trackId || null,
      hasRaces: hasRaces || false,
      status: !trackId ? 'UNMAPPED' : !hasRaces ? 'NO_RACES_FOUND' : 'CAN_MIGRATE'
    };
  }

  console.log(`\n📊 SUMMARY\n`);
  console.log(`Total orphaned races: ${orphaned.length}`);
  console.log(`Total pending bets: ${totalBets}\n`);

  console.log('MIGRATION STATUS:\n');
  let canMigrate = 0, noRaces = 0, unmapped = 0;
  for (const [track, info] of Object.entries(results)) {
    const icon = info.status === 'CAN_MIGRATE' ? '✓' : info.status === 'NO_RACES_FOUND' ? '⚠️' : '❌';
    console.log(`${icon} ${track.padEnd(15)} ${info.status.padEnd(18)} (${info.bets} bets)`);

    if (info.status === 'CAN_MIGRATE') canMigrate += info.bets;
    else if (info.status === 'NO_RACES_FOUND') noRaces += info.bets;
    else unmapped += info.bets;
  }

  console.log(`\n${' '.repeat(35)} ─────`);
  console.log(`Can migrate:    ${canMigrate.toString().padStart(3)} bets ✓`);
  console.log(`No races found: ${noRaces.toString().padStart(3)} bets ⚠️`);
  console.log(`Unmapped:       ${unmapped.toString().padStart(3)} bets ❌`);
  console.log(`\n🎯 Recommended action: Migrate ${canMigrate} bets, investigate ${noRaces + unmapped} orphaned\n`);

  return { orphaned, results, canMigrate, noRaces, unmapped };
}

// Run analysis
analyzeOrphanedBets().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
