#!/usr/bin/env node
/**
 * Quick entry: Pinjarra R5 race data
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
    const raceId = '2026-04-08-Pinjarra-5';
    const runners = [
      { name: 'Premium Boy', jockey: 'Paul Harvey', trainer: 'Tony Triscari', odds: 7.50, weight: '57.5', barrier: '1' },
      { name: 'Kanas Mtoto', jockey: 'Holly Nottle', trainer: 'Summer Dickson', odds: 2.30, weight: '57.5', barrier: '2' },
      { name: 'Specific', jockey: 'Brandon Louis', trainer: 'Bruce Kay', odds: 41.00, weight: '55.5', barrier: '3' },
      { name: 'Push The Limits', jockey: 'Shaun O\'donnell', trainer: 'Jeremy Easthope', odds: 31.00, weight: '57.5', barrier: '4' },
      { name: 'Flag High', jockey: 'Clint Johnston-porter', trainer: 'Darren McAuliffe', odds: 12.00, weight: '55.5', barrier: '5' },
      { name: 'Universal Talk', jockey: 'Laqdar Ramoly', trainer: 'Fenella Martin', odds: 6.50, weight: '57.5', barrier: '6' },
      { name: 'Special Counsel', jockey: 'Lucy Fiore', trainer: 'Grant & Alana Williams', odds: 6.50, weight: '57.5', barrier: '7' },
      { name: 'Rigatoni', jockey: 'Brad Parnham', trainer: 'Luke Fernie', odds: 6.00, weight: '55.5', barrier: '8' },
      { name: 'Amelia\'s Frost', jockey: 'Chris Parnham', trainer: 'Daniel & Ben Pearce', odds: 21.00, weight: '55.5', barrier: '9' },
      { name: 'Lady Mayflower', jockey: 'Steven Parnham', trainer: 'Deane Skipworth', odds: 31.00, weight: '56.0', barrier: '10' },
      { name: 'Super Saiyan', jockey: 'Jessica Valas', trainer: 'Phillipa Elliott', odds: 126.00, weight: '58.0', barrier: '11' },
      { name: 'Knight Admire', jockey: 'Giaan O\'donnell', trainer: 'Gino Poletti', odds: 126.00, weight: '58.0', barrier: '12' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: PINJARRA R5            ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Pinjarra'},
        ${5},
        ${'17:30'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Pinjarra R5 @ 17:30`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds (maiden race)\n`);

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
