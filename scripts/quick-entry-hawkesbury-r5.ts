#!/usr/bin/env node
/**
 * Quick entry: Hawkesbury R5 race data
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
    const raceId = '2026-04-08-Hawkesbury-5';
    const runners = [
      { name: 'Aligned', jockey: 'Tom Sherry', trainer: 'Peter Snowden', odds: 3.30, weight: '57.5', barrier: '1' },
      { name: 'Unstopabull', jockey: 'Sam Clipperton', trainer: 'Chris Waller', odds: 10.00, weight: '55.5', barrier: '2' },
      { name: 'Spione', jockey: 'Tyler Schiller', trainer: 'Michael, John & Wayne Hawkes', odds: 3.70, weight: '59.0', barrier: '3' },
      { name: 'Sheeza Diva', jockey: 'Rachel King', trainer: 'Mitchell & Desiree Kearney', odds: 7.00, weight: '54.0', barrier: '4' },
      { name: 'Alice Mae', jockey: 'Andrew Calder', trainer: 'Matthew Smith', odds: 101.00, weight: '54.0', barrier: '5' },
      { name: 'Rotagilla', jockey: 'Siena Grima', trainer: 'Chris Waller', odds: 8.50, weight: '62.0', barrier: '6' },
      { name: 'Oceanfront', jockey: 'Dylan Gibbons', trainer: 'Nacim Dilmi', odds: 46.00, weight: '59.0', barrier: '8' },
      { name: 'Arriving Home', jockey: 'Kerrin McEvoy', trainer: 'Bjorn Baker', odds: 8.00, weight: '60.0', barrier: '9' },
      { name: 'Peace Officer', jockey: 'Zac Lloyd', trainer: 'Clarry Conners', odds: 11.00, weight: '57.5', barrier: '10' },
      { name: 'Luskaire', jockey: 'Mollie Fitzgerald', trainer: 'Annabel & Rob Archibald', odds: 17.00, weight: '61.5', barrier: '11' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: HAWKESBURY R5          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Hawkesbury'},
        ${5},
        ${'15:55'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Hawkesbury R5 @ 15:55`);
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
