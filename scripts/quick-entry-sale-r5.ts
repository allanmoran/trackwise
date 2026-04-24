#!/usr/bin/env node
/**
 * Quick entry: Sale R5 race data
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
    const raceId = '2026-04-08-Sale-5';
    const runners = [
      { name: 'Dapper Darri', jockey: 'Olivia East', trainer: 'Shea Eden', odds: 11.00, weight: '61.5', barrier: '7' },
      { name: 'Harpalee', jockey: 'Ben Allen', trainer: 'Ben, Will & Jd Hayes', odds: 16.00, weight: '60.0', barrier: '8' },
      { name: 'Ellicazam', jockey: 'Ruby Lamont', trainer: 'Julien Welsh', odds: 10.00, weight: '58.0', barrier: '4' },
      { name: 'Mainmankash', jockey: 'Jason Maskiell', trainer: 'Kevin Milham', odds: 3.00, weight: '58.0', barrier: '5' },
      { name: 'Miss Cotoletta', jockey: 'Zac Spain', trainer: 'Jason Warren', odds: 16.00, weight: '57.5', barrier: '1' },
      { name: 'Choir Point', jockey: 'Daniel Stackhouse', trainer: 'Matt Laurie', odds: 1.95, weight: '57.0', barrier: '3' },
      { name: 'Freshen', jockey: 'Craig Newitt', trainer: 'Peter Gelagotis', odds: 9.50, weight: '56.0', barrier: '2' },
      { name: 'Moonlight Rustler', jockey: 'Teo Nugent', trainer: 'Bill Wood', odds: 126.00, weight: '54.0', barrier: '6' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: SALE R5                ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Sale'},
        ${5},
        ${'14:55'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Sale R5 @ 14:55`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds (BM66 handicap)\n`);

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
