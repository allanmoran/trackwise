#!/usr/bin/env node
/**
 * Quick entry: Eagle Farm R4 race data
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

async function quickEntry() {
  try {
    const raceId = '2026-04-08-Eagle-Farm-4';
    const runners = [
      { name: 'ASTERN EFFORT', jockey: 'Angela Jones', trainer: 'Rex Lipp', odds: 2.50, weight: '58.0', barrier: '1' },
      { name: 'SWING STATE', jockey: 'Boris Thornton', trainer: 'Michael Freedman', odds: 6.00, weight: '58.0', barrier: '2' },
      { name: 'BOMB PERIGNON', jockey: 'Andrew Mallyon', trainer: 'Chris Waller', odds: 14.00, weight: '57.0', barrier: '3' },
      { name: 'DON\'T DOUBT MISSY', jockey: 'Daniel Moor', trainer: 'Robert Heathcote', odds: 2.10, weight: '57.0', barrier: '4' },
      { name: 'EVENING DELLE', jockey: 'Cejay Graham', trainer: 'Robert Heathcote', odds: 27.00, weight: '57.0', barrier: '5' },
      { name: 'SHE CAN SOAR', jockey: 'Damien Thornton', trainer: 'Kelly Schweida', odds: 18.00, weight: '57.0', barrier: '6' },
      { name: 'CRYPTION\'S DESIRE', jockey: 'Fred Larson', trainer: 'Matt Kropp', odds: 51.00, weight: '56.0', barrier: '7' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: EAGLE FARM R4          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Eagle Farm'},
        ${4},
        ${'13:53'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Eagle Farm R4 @ 13:53`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds\n`);

    runners.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name.padEnd(25)} @${r.odds} (${r.jockey}/${r.trainer})`);
    });

    console.log(`\n✓ Race added to knowledge base!\n`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

quickEntry();
