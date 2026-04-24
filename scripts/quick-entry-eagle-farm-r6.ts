#!/usr/bin/env node
/**
 * Quick entry: Eagle Farm R6 race data
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
    const raceId = '2026-04-08-Eagle-Farm-6';
    const runners = [
      { name: 'Hearts Are Better', jockey: 'Fiona Sandkuhl', trainer: 'Matthew Hoysted', odds: 8.00, weight: '63.5', barrier: '1' },
      { name: 'Moulin Miss', jockey: 'Chelsea Baker', trainer: 'Tony Gollan', odds: 2.20, weight: '60.0', barrier: '2' },
      { name: 'The Lucky Alien', jockey: 'Corey Sutherland', trainer: 'Greg Cornish', odds: 23.00, weight: '60.0', barrier: '3' },
      { name: 'Zouthur', jockey: 'Tahlia Fenlon', trainer: 'John Wallace', odds: 19.00, weight: '59.5', barrier: '4' },
      { name: 'Count Nicholas', jockey: 'Ryan Maloney', trainer: 'Adam Campton', odds: 10.00, weight: '57.5', barrier: '5' },
      { name: 'Galactic Star', jockey: 'Ben Thompson', trainer: 'Stuart Kendrick', odds: 3.10, weight: '57.5', barrier: '6' },
      { name: 'Guac On', jockey: 'Damien Thornton', trainer: 'Kelly Schweida', odds: 7.50, weight: '57.0', barrier: '7' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: EAGLE FARM R6          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Eagle Farm'},
        ${6},
        ${'15:03'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Eagle Farm R6 @ 15:03`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds (2 scratched)\n`);

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
