#!/usr/bin/env node
/**
 * Quick entry: Directly insert Eagle Farm R1 race data
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
    // Eagle Farm R1 - 2026-04-08 @ 12:08
    const raceId = '2026-04-08-Eagle-Farm-1';
    const runners = [
      { name: 'GRAM', jockey: 'Ben Thompson', trainer: 'Tony Gollan', odds: 3.30, weight: '58.5', barrier: '1' },
      { name: 'DEVINE SQUIRE', jockey: 'Andrew Mallyon', trainer: 'Desleigh Forster', odds: 23.00, weight: '57.5', barrier: '2' },
      { name: 'MAGIC INVADER', jockey: 'Daniel Moor', trainer: 'Chris Anderson', odds: 41.00, weight: '57.5', barrier: '3' },
      { name: 'ZOUSTROLOGY', jockey: 'Damien Thornton', trainer: 'Jack Bruce', odds: 9.00, weight: '57.5', barrier: '4' },
      { name: 'DESANTO', jockey: 'Taylor Marshall', trainer: 'Jim Mason', odds: 1.80, weight: '55.5', barrier: '7' },
      { name: 'EGYPTIAN GODDESS', jockey: 'M R Du Plessis', trainer: 'Ryan Tyrell', odds: 71.00, weight: '55.5', barrier: '8' },
      { name: 'SWORD OF LEGACY', jockey: 'Cejay Graham', trainer: 'Matthew Dunn', odds: 5.50, weight: '55.5', barrier: '10' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: EAGLE FARM R1          ║');
    console.log('╚════════════════════════════════════════╝\n');

    const result = await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Eagle Farm'},
        ${1},
        ${'12:08'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Eagle Farm R1 @ 12:08`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds\n`);

    // Show what was saved
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
