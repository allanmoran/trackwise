#!/usr/bin/env node
/**
 * Quick entry: Sale R2 race data
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
    const raceId = '2026-04-08-Sale-2';
    const runners = [
      { name: 'GALACTIC FORCE', jockey: 'Luke Nolen', trainer: 'Peter Moody & Katherine Coleman', odds: 4.00, weight: '59.0', barrier: '1' },
      { name: 'INTERROGATE', jockey: 'Daniel Stackhouse', trainer: 'Anthony & Sam Freedman', odds: 4.50, weight: '59.0', barrier: '2' },
      { name: 'LAUBERHORN', jockey: 'Beau Mertens', trainer: 'Mick Price & Michael Kent Jnr', odds: 1.70, weight: '59.0', barrier: '3' },
      { name: 'LAUNDERING', jockey: 'Jason Maskiell', trainer: 'Paul & Tracey Templeton', odds: 21.00, weight: '59.0', barrier: '4' },
      { name: 'ROCK GLORY', jockey: 'Ruby Lamont', trainer: 'Sharyn Trolove', odds: 21.00, weight: '57.5', barrier: '5' },
      { name: 'OAK PARK MIA', jockey: 'Sheridan Clarke', trainer: 'Mark Webb', odds: 21.00, weight: '57.0', barrier: '6' },
      { name: 'SO YOU EXCEL', jockey: 'Valentin Le Boeuf', trainer: 'Tim Hughes', odds: 34.00, weight: '57.0', barrier: '7' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: SALE R2                ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Sale'},
        ${2},
        ${'13:10'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Sale R2 @ 13:10`);
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
