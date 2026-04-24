#!/usr/bin/env node
/**
 * Quick entry: Pinjarra R3 race data
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
    const raceId = '2026-04-08-Pinjarra-3';
    const runners = [
      { name: 'MR FRODO', jockey: 'Tash Faithfull', trainer: 'Greg Jones', odds: 4.40, weight: '58.0', barrier: '1' },
      { name: 'HELIOS AMIGOS', jockey: 'Paul Harvey', trainer: 'Andrew Masters', odds: 8.50, weight: '58.0', barrier: '2' },
      { name: 'DIVINE CURRENCY', jockey: 'Shaun O\'donnell', trainer: 'Gino Poletti', odds: 126.00, weight: '58.0', barrier: '3' },
      { name: 'JAVELIN STRIKE', jockey: 'Lucy Fiore', trainer: 'Lou Luciani', odds: 4.40, weight: '58.0', barrier: '4' },
      { name: 'ROCCABYE', jockey: 'Holly Watson', trainer: 'Darren Taylor', odds: 18.00, weight: '57.5', barrier: '5' },
      { name: 'BATCITY', jockey: 'Holly Nottle', trainer: 'Greg Kersley', odds: 2.35, weight: '57.5', barrier: '6' },
      { name: 'BHULLAR', jockey: 'Steven Parnham', trainer: 'Bob McPherson', odds: 7.00, weight: '56.0', barrier: '7' },
      { name: 'BELLONA GIRL', jockey: 'Jessica Valas', trainer: 'Simon Barrass', odds: 19.00, weight: '56.0', barrier: '8' },
      { name: 'TWO LIKE HER', jockey: 'Jessica Gray', trainer: 'Sky Ballinger', odds: 41.00, weight: '56.0', barrier: '9' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: PINJARRA R3            ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Pinjarra'},
        ${3},
        ${'16:20'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Pinjarra R3 @ 16:20`);
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
