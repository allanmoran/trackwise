#!/usr/bin/env node
/**
 * Quick entry: Pinjarra R7 race data
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
    const raceId = '2026-04-08-Pinjarra-7';
    const runners = [
      { name: 'Maxwhooshtapin', jockey: 'Ava Catarino', trainer: 'Misty Bazeley', odds: 10.00, weight: '61.5', barrier: '7' },
      { name: 'I\'m Nipote', jockey: 'Holly Watson', trainer: 'Brad Seinor', odds: 11.00, weight: '59.0', barrier: '2' },
      { name: 'Just Leroy', jockey: 'Troy Turner', trainer: 'Justine Erkelens', odds: 3.30, weight: '59.0', barrier: '3' },
      { name: 'Apparatus', jockey: 'Chloe Azzopardi', trainer: 'Dylan Bairstow', odds: 14.00, weight: '58.0', barrier: '5' },
      { name: 'Bannered', jockey: 'Brad Parnham', trainer: 'Darren McAuliffe', odds: 6.50, weight: '57.0', barrier: '9' },
      { name: 'Playing Quest', jockey: 'Chris Parnham', trainer: 'Michael Lane', odds: 13.00, weight: '57.0', barrier: '8' },
      { name: 'Think Pink Daze', jockey: 'Lucy Fiore', trainer: 'Grant & Alana Williams', odds: 3.50, weight: '57.0', barrier: '11' },
      { name: 'Fearless Talk', jockey: 'Victoria Corver', trainer: 'David Philp', odds: 9.00, weight: '56.5', barrier: '6' },
      { name: 'Bondi Star', jockey: 'Holly Nottle', trainer: 'Summer Dickson', odds: 13.00, weight: '55.5', barrier: '4' },
      { name: 'Norma Stars', jockey: 'Jason Whiting', trainer: 'Tina Glasson', odds: 41.00, weight: '54.0', barrier: '1' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: PINJARRA R7            ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Pinjarra'},
        ${7},
        ${'18:40'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Pinjarra R7 @ 18:40`);
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
