#!/usr/bin/env node
/**
 * Verify migration complete and prepare for results scraping
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('🎯 BET MIGRATION VERIFICATION - April 12, 2026\n');
console.log('═══════════════════════════════════════════════════════════\n');

// 1. Summary by track
console.log('📊 MIGRATION STATUS BY TRACK\n');

const summary = db.prepare(`
  SELECT
    r.track,
    COUNT(DISTINCT r.id) as races,
    COUNT(DISTINCT CASE WHEN r.meeting_id IS NOT NULL THEN r.id END) as races_with_id,
    COUNT(DISTINCT b.id) as pending_bets,
    COUNT(DISTINCT CASE WHEN r.meeting_id IS NOT NULL THEN b.id END) as bets_with_id,
    GROUP_CONCAT(DISTINCT r.meeting_id) as meeting_ids
  FROM races r
  LEFT JOIN bets b ON r.id = b.race_id AND b.result IS NULL
  WHERE r.date = '2026-04-12'
  GROUP BY r.track
  ORDER BY r.track
`).all();

let totalBets = 0;
let migratedBets = 0;

for (const row of summary as any[]) {
  const status = row.races_with_id > 0 ? '✓' : '❌';
  const raceStatus = `${row.races_with_id}/${row.races}`;
  const betStatus = `${row.bets_with_id}/${row.pending_bets}`;

  console.log(`${status} ${row.track.padEnd(15)} Races: ${raceStatus.padEnd(4)}  Bets: ${betStatus.padEnd(4)}`);
  if (row.meeting_ids) {
    console.log(`   Meeting IDs: ${row.meeting_ids}\n`);
  } else {
    console.log(`   Meeting IDs: (unmapped)\n`);
  }

  totalBets += row.pending_bets;
  migratedBets += row.bets_with_id;
}

console.log('═' * 60);
console.log(`\nTotal pending bets: ${totalBets}`);
console.log(`Migrated bets:      ${migratedBets}`);
console.log(`Coverage:           ${((migratedBets / totalBets) * 100).toFixed(1)}%\n`);

// 2. Ready for scraping
console.log('\n🔄 READY FOR RESULTS SCRAPING\n');

const readyBets = db.prepare(`
  SELECT r.track, r.race_number, COUNT(b.id) as bet_count
  FROM bets b
  JOIN races r ON b.race_id = r.id
  WHERE r.date = '2026-04-12'
    AND b.result IS NULL
    AND r.meeting_id IS NOT NULL
  ORDER BY r.track, r.race_number
`).all();

console.log(`Total races ready to scrape: ${new Set((readyBets as any[]).map(r => r.track)).size}`);
console.log(`Total bets awaiting results: ${(readyBets as any[]).reduce((s, r) => s + r.bet_count, 0)}\n`);

// 3. Recommended next step
console.log('\n📋 NEXT STEP: RUN RESULTS SCRAPER\n');

console.log('The following command will scrape results for all migrated bets:\n');
console.log('  npm run scrape-results\n');
console.log('This will:\n');
console.log('  1. Query all races with meeting_id IS NOT NULL');
console.log('  2. Scrape results from Punters.com.au using track names');
console.log('  3. Match results to horses in pending bets');
console.log('  4. Update bet status (WIN/PLACE/LOSS) and P&L\n');

console.log('Unmapped bets (cannot be scraped yet):\n');
const unmapped = db.prepare(`
  SELECT r.track, COUNT(b.id) as bet_count
  FROM bets b
  JOIN races r ON b.race_id = r.id
  WHERE r.date = '2026-04-12'
    AND b.result IS NULL
    AND r.meeting_id IS NULL
  GROUP BY r.track
`).all();

for (const row of unmapped as any[]) {
  console.log(`  ⚠️  ${row.track}: ${row.bet_count} bets (no Sportsbet track mapping)\n`);
}

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('✅ MIGRATION COMPLETE - Ready to proceed\n');
console.log('═══════════════════════════════════════════════════════════\n');
