#!/usr/bin/env node
/**
 * Quick entry: Eagle Farm R7 race data
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
    const raceId = '2026-04-08-Eagle-Farm-7';
    const runners = [
      { name: 'Picko Rocks', jockey: 'Chelsea Baker', trainer: 'Greg Wright', odds: 151.00, weight: '62.0', barrier: '1' },
      { name: 'Chillaxing', jockey: 'Damien Thornton', trainer: 'Tony Gollan', odds: 17.00, weight: '60.5', barrier: '2' },
      { name: 'Grey Northern', jockey: 'Corey Sutherland', trainer: 'Corey & Kylie Geran', odds: 9.50, weight: '60.0', barrier: '3' },
      { name: 'Meltdown', jockey: 'Jag Guthmann-chester', trainer: 'Matthew Hoysted', odds: 10.00, weight: '60.0', barrier: '4' },
      { name: 'Kerkorian', jockey: 'Jake Bayliss', trainer: 'Jamie Bayliss', odds: 27.00, weight: '59.0', barrier: '5' },
      { name: 'Malecon', jockey: 'M R Du Plessis', trainer: 'Michael G Nolan', odds: 35.00, weight: '59.0', barrier: '6' },
      { name: 'Addition', jockey: 'Ben Thompson', trainer: 'Tony Gollan', odds: 3.00, weight: '58.5', barrier: '7' },
      { name: 'Piston Rebel', jockey: 'Brandon Lerena', trainer: 'William Kropp', odds: 4.20, weight: '58.5', barrier: '8' },
      { name: 'Propose', jockey: 'Fred Larson', trainer: 'Matt Kropp', odds: 11.00, weight: '56.5', barrier: '9' },
      { name: 'Saveur', jockey: 'Angela Jones', trainer: 'Chris Waller', odds: 4.50, weight: '56.0', barrier: '10' },
      { name: 'Sir Beveridge', jockey: 'Damien Boche', trainer: 'Bob Mahon', odds: 31.00, weight: '57.5', barrier: '11' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: EAGLE FARM R7          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Eagle Farm'},
        ${7},
        ${'15:38'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Eagle Farm R7 @ 15:38`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds (5 scratched)\n`);

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
