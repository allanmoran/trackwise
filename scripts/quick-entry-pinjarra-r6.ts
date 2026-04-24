#!/usr/bin/env node
/**
 * Quick entry: Pinjarra R6 race data
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
    const raceId = '2026-04-08-Pinjarra-6';
    const runners = [
      { name: 'Setagaya', jockey: 'Clint Johnston-porter', trainer: 'Adam Durrant', odds: 3.30, weight: '56.0', barrier: '2' },
      { name: 'Who Told Kayla', jockey: 'Peter Farrell', trainer: 'Kayla Farrell', odds: 81.00, weight: '55.5', barrier: '3' },
      { name: 'Galilea', jockey: 'Sasha Starley', trainer: 'Brad Graham', odds: 27.00, weight: '57.0', barrier: '4' },
      { name: 'Scenic Wings', jockey: 'Brayden Gaerth', trainer: 'Kayla Farrell', odds: 51.00, weight: '55.0', barrier: '5' },
      { name: 'Next Destination', jockey: 'Holly Watson', trainer: 'Joshua Krispyn', odds: 20.00, weight: '57.0', barrier: '6' },
      { name: 'The Lucky Chip', jockey: 'Elisha Whittington', trainer: 'Brett Pope', odds: 26.00, weight: '57.0', barrier: '7' },
      { name: 'Toronado Rocket', jockey: 'Brad Parnham', trainer: 'Daniel & Ben Pearce', odds: 4.80, weight: '60.0', barrier: '8' },
      { name: 'King Brew', jockey: 'Laqdar Ramoly', trainer: 'Chad Caporn', odds: 1.75, weight: '60.0', barrier: '9' },
      { name: 'Gingeriffic', jockey: 'Tash Faithfull', trainer: 'Tom Pike', odds: 31.00, weight: '55.0', barrier: '10' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: PINJARRA R6            ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Pinjarra'},
        ${6},
        ${'18:05'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Pinjarra R6 @ 18:05`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds (1 scratched)\n`);

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
