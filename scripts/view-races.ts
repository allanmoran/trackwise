#!/usr/bin/env node
/**
 * View imported races from manual_races table
 * Shows race data grouped by date/track
 */

import 'dotenv/config';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '', {
  idle_timeout: 30,
  max_lifetime: 60 * 30,
});

async function viewRaces() {
  try {
    const races = await sql`
      SELECT id, date, track, race_num, race_time, runners
      FROM manual_races
      ORDER BY date DESC, track, race_num
      LIMIT 100
    `;

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    IMPORTED RACES (Manual KB)          ║');
    console.log('╚════════════════════════════════════════╝\n');

    let lastDate = '';
    let lastTrack = '';

    for (const race of races) {
      if (race.date !== lastDate) {
        console.log(`\n📅 ${race.date}`);
        lastDate = race.date;
        lastTrack = '';
      }

      if (race.track !== lastTrack) {
        console.log(`\n  ${race.track.toUpperCase()}`);
        lastTrack = race.track;
      }

      const runners = Array.isArray(race.runners) ? race.runners : [];
      const hasOdds = runners.some((r: any) => r.odds);
      const oddsList = runners.filter((r: any) => r.odds).length;

      console.log(
        `    R${race.race_num} @ ${race.race_time || 'TBD'} - ${runners.length} horses, ${oddsList} with odds ${hasOdds ? '✓' : ''}`
      );

      // Show first 3 horses
      runners.slice(0, 3).forEach((r: any, i: number) => {
        const odds = r.odds ? `@${r.odds}` : '';
        const jockey = r.jockey ? ` (${r.jockey})` : '';
        console.log(`      ${i + 1}. ${r.name} ${odds}${jockey}`);
      });
      if (runners.length > 3) {
        console.log(`      ... and ${runners.length - 3} more`);
      }
    }

    // Stats
    const stats = await sql`
      SELECT
        COUNT(DISTINCT date) as unique_dates,
        COUNT(*) as total_races,
        COUNT(DISTINCT track) as unique_tracks,
        COALESCE(SUM(CASE WHEN jsonb_typeof(runners) = 'array' THEN jsonb_array_length(runners) ELSE 0 END), 0) as total_horses,
        COUNT(CASE WHEN runners::jsonb @> '[{"odds":null}]' THEN 1 END) as with_odds
      FROM manual_races
    `;

    const s = stats[0];
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║    KNOWLEDGE BASE STATS                ║`);
    console.log(`╚════════════════════════════════════════╝`);
    console.log(`Unique dates: ${s.unique_dates}`);
    console.log(`Total races: ${s.total_races}`);
    console.log(`Unique tracks: ${s.unique_tracks}`);
    console.log(`Total horses: ${s.total_horses}`);
    console.log(`\n`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

viewRaces();
