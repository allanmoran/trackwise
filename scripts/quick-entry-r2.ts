#!/usr/bin/env node
/**
 * Quick entry: Eagle Farm R2 race data
 * Parsed from Sportsbet form guide
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
    // Eagle Farm R2 - 2026-04-08 @ 12:43
    const raceId = '2026-04-08-Eagle-Farm-2';
    const runners = [
      { name: 'DELICIOUS DEREK', jockey: 'Ryan Maloney', trainer: 'Chris Waller', odds: 5.50, weight: '57.5', barrier: '2' },
      { name: 'FLASHMASTER', jockey: 'Andrew Mallyon', trainer: 'Desleigh Forster', odds: 9.50, weight: '57.5', barrier: '3' },
      { name: 'KADESKY', jockey: 'Damien Thornton', trainer: 'Chris Waller', odds: 4.50, weight: '57.5', barrier: '4' },
      { name: 'LOS ALAMITOS', jockey: 'Corey Sutherland', trainer: 'Jesse Townsend', odds: 9.00, weight: '57.5', barrier: '5' },
      { name: 'LUKE SKYWALKER', jockey: 'Angela Jones', trainer: 'Tony Gollan', odds: 8.00, weight: '57.5', barrier: '6' },
      { name: 'THE AVIATOR', jockey: 'Daniel Moor', trainer: 'Chris Anderson', odds: 5.00, weight: '57.5', barrier: '7' },
      { name: 'SATURDAYS GIRL', jockey: 'Ben Thompson', trainer: 'Chris Waller', odds: 4.60, weight: '56.5', barrier: '8' },
      { name: 'THE MESSIAH', jockey: 'Jaden Lloyd', trainer: 'Greg Cornish', odds: 46.00, weight: '56.5', barrier: '9' },
      { name: 'SONIC FLYER', jockey: 'M R Du Plessis', trainer: 'Rochelle Pereira', odds: 17.00, weight: '55.5', barrier: '11' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: EAGLE FARM R2          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Eagle Farm'},
        ${2},
        ${'12:43'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Eagle Farm R2 @ 12:43`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds\n`);

    runners.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name.padEnd(20)} @${r.odds} (${r.jockey}/${r.trainer})`);
    });

    console.log(`\n✓ Race added to knowledge base!\n`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

quickEntry();
