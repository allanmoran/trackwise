#!/usr/bin/env node
/**
 * Quick entry: Eagle Farm R8 race data
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
    const raceId = '2026-04-08-Eagle-Farm-8';
    const runners = [
      { name: 'Seneschal', jockey: 'Bailey Wheeler', trainer: 'Stuart Kendrick', odds: 10.00, weight: '61.5', barrier: '3' },
      { name: 'She Moves Too', jockey: 'Andrew Mallyon', trainer: 'Chris Waller', odds: 5.50, weight: '55.5', barrier: '4' },
      { name: 'Disselation', jockey: 'Boris Thornton', trainer: 'Glenn Thornton', odds: 17.00, weight: '60.0', barrier: '5' },
      { name: 'Fasvara', jockey: 'Sean Cormack', trainer: 'Kris Lees', odds: 4.40, weight: '58.0', barrier: '6' },
      { name: 'Some Style', jockey: 'Angela Jones', trainer: 'Tony Gollan', odds: 7.50, weight: '56.5', barrier: '7' },
      { name: 'Navy Nina', jockey: 'Emily Lang', trainer: 'Tony Gollan', odds: 6.00, weight: '56.5', barrier: '8' },
      { name: 'Meadowbrook', jockey: 'Daniel Moor', trainer: 'Desleigh Forster', odds: 21.00, weight: '56.5', barrier: '9' },
      { name: 'Betterlucknexttime', jockey: 'Corey Sutherland', trainer: 'Liam Birchley', odds: 17.00, weight: '58.0', barrier: '10' },
      { name: 'Canara', jockey: 'Ben Thompson', trainer: 'Chris Waller', odds: 7.50, weight: '56.0', barrier: '12' },
      { name: 'Simply Fun', jockey: 'Georgina Cartwright', trainer: 'Kelly Schweida', odds: 16.00, weight: '58.0', barrier: '13' },
      { name: 'El Pensador', jockey: 'Kyle Wilson-taylor', trainer: 'Rex Lipp', odds: 13.00, weight: '60.5', barrier: '15' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: EAGLE FARM R8          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Eagle Farm'},
        ${8},
        ${'16:13'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Eagle Farm R8 @ 16:13`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds (9 scratched)\n`);

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
