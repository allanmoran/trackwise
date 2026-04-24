#!/usr/bin/env node
/**
 * Quick entry: Hawkesbury R1 race data
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
    const raceId = '2026-04-08-Hawkesbury-1';
    const runners = [
      { name: 'EXTREMELY TEMPTED', jockey: 'Regan Bayliss', trainer: 'Gai Waterhouse & Adrian Bott', odds: 2.90, weight: '58.0', barrier: '1' },
      { name: 'PRIORY PARK', jockey: 'Adam Hyeronimus', trainer: 'Annabel & Rob Archibald', odds: 4.40, weight: '58.0', barrier: '3' },
      { name: 'CASTA DIVA', jockey: 'Louis Beuzelin', trainer: 'Mike Van Gestel', odds: 126.00, weight: '56.0', barrier: '4' },
      { name: 'DIAMOND DICE', jockey: 'Chad Schofield', trainer: 'Richard Litt', odds: 67.00, weight: '56.0', barrier: '5' },
      { name: 'FONDNESS', jockey: 'Kerrin McEvoy', trainer: 'Chris Waller', odds: 19.00, weight: '56.0', barrier: '6' },
      { name: 'HONEYSUCKLE', jockey: 'Zac Lloyd', trainer: 'Michael Freedman', odds: 13.00, weight: '56.0', barrier: '7' },
      { name: 'KATOTO', jockey: 'Siena Grima', trainer: 'Chris Waller', odds: 6.50, weight: '56.0', barrier: '8' },
      { name: 'ROCKET GIRL', jockey: 'James McDonald', trainer: 'Chris Waller', odds: 2.80, weight: '56.0', barrier: '10' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: HAWKESBURY R1          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Hawkesbury'},
        ${1},
        ${'13:35'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Hawkesbury R1 @ 13:35`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds\n`);

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
