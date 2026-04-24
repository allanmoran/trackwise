#!/usr/bin/env node
/**
 * Quick entry: Pinjarra R1 race data
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
    const raceId = '2026-04-08-Pinjarra-1';
    const runners = [
      { name: 'OUR MANE MAN', jockey: 'Jason Whiting', trainer: 'Lou Luciani', odds: 6.00, weight: '57.0', barrier: '1' },
      { name: 'TIGERLAND', jockey: 'Keshaw Dhurun', trainer: 'Neville Parnham', odds: 23.00, weight: '57.0', barrier: '2' },
      { name: 'ALL THE RAGE', jockey: 'Steven Parnham', trainer: 'Stefan Vahala', odds: 8.50, weight: '57.0', barrier: '3' },
      { name: 'OFF THE RICHTER', jockey: 'Holly Watson', trainer: 'Mitchell Pateman', odds: 13.00, weight: '57.0', barrier: '4' },
      { name: 'HILLSIDE AVENUE', jockey: 'Brad Parnham', trainer: 'Simon A Miller', odds: 1.80, weight: '55.0', barrier: '5' },
      { name: 'AXOPAR', jockey: 'Lucy Fiore', trainer: 'Daniel Morton', odds: 3.50, weight: '55.0', barrier: '6' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: PINJARRA R1            ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Pinjarra'},
        ${1},
        ${'15:10'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Pinjarra R1 @ 15:10`);
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
