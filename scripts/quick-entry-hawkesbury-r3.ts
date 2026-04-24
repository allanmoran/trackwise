#!/usr/bin/env node
/**
 * Quick entry: Hawkesbury R3 race data
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
    const raceId = '2026-04-08-Hawkesbury-3';
    const runners = [
      { name: 'DEMMO DERMY', jockey: 'Jay Ford', trainer: 'Edward Cummings', odds: 19.00, weight: '59.0', barrier: '1' },
      { name: 'LONTRICE', jockey: 'Zac Lloyd', trainer: 'Michael, John & Wayne Hawkes', odds: 1.75, weight: '59.0', barrier: '2' },
      { name: 'ALMAAZ', jockey: 'James McDonald', trainer: 'Chris Waller', odds: 5.50, weight: '58.0', barrier: '3' },
      { name: 'TORMANZOR', jockey: 'Mollie Fitzgerald', trainer: 'Annabel & Rob Archibald', odds: 17.00, weight: '57.0', barrier: '4' },
      { name: 'PROPANE', jockey: 'Ashley Morgan', trainer: 'Kim Waugh', odds: 27.00, weight: '56.5', barrier: '5' },
      { name: 'IRON LEGEND', jockey: 'Kerrin McEvoy', trainer: 'Chris Waller', odds: 13.00, weight: '55.5', barrier: '6' },
      { name: 'ALL STAR', jockey: 'Jean Van Overmeire', trainer: 'Fabio Martino', odds: 35.00, weight: '55.0', barrier: '7' },
      { name: 'CANJUSTIFY', jockey: 'Tyler Schiller', trainer: 'Richard Litt', odds: 8.00, weight: '54.5', barrier: '8' },
      { name: 'JADE SUNSET', jockey: 'Alysha Collett', trainer: 'Tracey Bartley', odds: 8.50, weight: '54.5', barrier: '9' },
      { name: 'MISS PEONY', jockey: 'Andrew Calder', trainer: 'Paul & Martha Cave', odds: 151.00, weight: '54.5', barrier: '10' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: HAWKESBURY R3          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Hawkesbury'},
        ${3},
        ${'14:45'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Hawkesbury R3 @ 14:45`);
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
