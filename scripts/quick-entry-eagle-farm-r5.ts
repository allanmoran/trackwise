#!/usr/bin/env node
/**
 * Quick entry: Eagle Farm R5 race data
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
    const raceId = '2026-04-08-Eagle-Farm-5';
    const runners = [
      { name: 'Rewrite', jockey: 'Emily Pozman', trainer: 'Michael Freedman', odds: 3.20, weight: '59.0', barrier: '1' },
      { name: 'Saint Aldwyn', jockey: 'Corey Sutherland', trainer: 'Kelly Schweida', odds: 9.00, weight: '59.0', barrier: '2' },
      { name: 'Strike Weapon', jockey: 'Taylor Johnstone', trainer: 'Lennie Wheeler', odds: 12.00, weight: '59.0', barrier: '3' },
      { name: 'Berezka', jockey: 'Amber Riddell', trainer: 'Ciaron Maher', odds: 3.80, weight: '58.0', barrier: '4' },
      { name: 'Dismantle', jockey: 'Chanel Cooper', trainer: 'Tony Gollan', odds: 9.50, weight: '58.0', barrier: '5' },
      { name: 'Happy Bellie', jockey: 'Tahlia Fenlon', trainer: 'Chris & Corey Munce', odds: 8.50, weight: '58.0', barrier: '6' },
      { name: 'Vanessi', jockey: 'Emily Lang', trainer: 'Chris Waller', odds: 9.50, weight: '58.0', barrier: '7' },
      { name: 'Better Sweet', jockey: 'Jabez Johnstone', trainer: 'Michael G Nolan', odds: 7.50, weight: '57.0', barrier: '8' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: EAGLE FARM R5          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Eagle Farm'},
        ${5},
        ${'14:28'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Eagle Farm R5 @ 14:28`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds (7 scratched)\n`);

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
