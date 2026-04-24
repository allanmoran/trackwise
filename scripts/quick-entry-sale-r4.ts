#!/usr/bin/env node
/**
 * Quick entry: Sale R4 race data
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
    const raceId = '2026-04-08-Sale-4';
    const runners = [
      { name: 'Bark', jockey: 'Jason Maskiell', trainer: 'Simone Walker', odds: 5.00, weight: '59.5', barrier: '7' },
      { name: 'Nar Nar Goon', jockey: 'Lachlan Neindorf', trainer: 'Phillip Stokes', odds: 5.50, weight: '59.5', barrier: '4' },
      { name: 'Cattle Camp', jockey: 'Luke Nolen', trainer: 'Peter Moody & Katherine Coleman', odds: 3.70, weight: '59.0', barrier: '6' },
      { name: 'Path Of Heroes', jockey: 'Daniel Stackhouse', trainer: 'Robbie Griffiths', odds: 11.00, weight: '59.0', barrier: '2' },
      { name: 'Cheeky Doll', jockey: 'Ruby Lamont', trainer: 'Bill Wood', odds: 151.00, weight: '57.5', barrier: '1' },
      { name: 'Blondie\'s Award', jockey: 'Zac Spain', trainer: 'Shane Nichols & Hayden Black', odds: 11.00, weight: '57.0', barrier: '5' },
      { name: 'Mad About Magnus', jockey: 'Ben Allen', trainer: 'Ben, Will & Jd Hayes', odds: 2.45, weight: '57.0', barrier: '3' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: SALE R4                ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Sale'},
        ${4},
        ${'14:20'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Sale R4 @ 14:20`);
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
