#!/usr/bin/env node
/**
 * Quick entry: Sale R3 race data
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
    const raceId = '2026-04-08-Sale-3';
    const runners = [
      { name: 'I\'m Marcus', jockey: 'Liana Wood', trainer: 'Kim & Gayle Mayberry', odds: 51.00, weight: '59.5', barrier: '6' },
      { name: 'Mywifeisnothere', jockey: 'Jason Maskiell', trainer: 'Simone Walker', odds: 10.00, weight: '59.5', barrier: '5' },
      { name: 'Fatty Finn', jockey: 'Zac Spain', trainer: 'Charlotte Littlefield', odds: 1.85, weight: '59.0', barrier: '3' },
      { name: 'Just For Kicks', jockey: 'Jake Noonan', trainer: 'Allan & Jason Williams', odds: 6.50, weight: '59.0', barrier: '7' },
      { name: 'Russian Cavalier', jockey: 'Ben Allen', trainer: 'Ben, Will & Jd Hayes', odds: 7.00, weight: '59.0', barrier: '9' },
      { name: 'No Savings', jockey: 'Teo Nugent', trainer: 'Christine Sexton', odds: 13.00, weight: '57.5', barrier: '1' },
      { name: 'Now Perform', jockey: 'Sheridan Clarke', trainer: 'Cliff Murray', odds: 91.00, weight: '57.5', barrier: '2' },
      { name: 'Ratatouille', jockey: 'Ruby Lamont', trainer: 'Heather Stephens', odds: 51.00, weight: '57.5', barrier: '4' },
      { name: 'She\'s Got The Cash', jockey: 'Beau Mertens', trainer: 'Mick Price & Michael Kent Jnr', odds: 4.80, weight: '57.0', barrier: '8' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: SALE R3                ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Sale'},
        ${3},
        ${'13:45'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Sale R3 @ 13:45`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds (maiden plate)\n`);

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
