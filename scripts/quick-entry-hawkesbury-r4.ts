#!/usr/bin/env node
/**
 * Quick entry: Hawkesbury R4 race data
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
    const raceId = '2026-04-08-Hawkesbury-4';
    const runners = [
      { name: 'WEST OF DALBY', jockey: 'Mitch Stapleford', trainer: 'Matthew Dale', odds: 13.00, weight: '61.5', barrier: '1' },
      { name: 'MADRINA', jockey: 'Alysha Collett', trainer: 'Nick Olive', odds: 5.00, weight: '59.5', barrier: '2' },
      { name: 'VINOLASS', jockey: 'Zac Lloyd', trainer: 'Keith Dryden & Libby Snowden', odds: 8.50, weight: '57.5', barrier: '3' },
      { name: 'FIORENZA', jockey: 'Rachel King', trainer: 'David Pfieffer', odds: 3.10, weight: '57.5', barrier: '4' },
      { name: 'CAMPARI TWIST', jockey: 'Regan Bayliss', trainer: 'Patrick Cleave', odds: 10.00, weight: '57.5', barrier: '5' },
      { name: 'PRETTY CHEEKY', jockey: 'Tyler Schiller', trainer: 'Gerald Ryan & Sterling Alexiou', odds: 19.00, weight: '57.5', barrier: '6' },
      { name: 'CRIMSON BONNET', jockey: 'Siena Grima', trainer: 'Sue Grills', odds: 15.00, weight: '57.0', barrier: '7' },
      { name: 'DEAR JEWEL', jockey: 'Andrew Adkins', trainer: 'Joseph Pride', odds: 4.60, weight: '56.5', barrier: '8' },
      { name: 'TRIPLE YES', jockey: 'Dylan Gibbons', trainer: 'Edward Cummings', odds: 12.00, weight: '56.0', barrier: '9' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: HAWKESBURY R4          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Hawkesbury'},
        ${4},
        ${'15:20'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Hawkesbury R4 @ 15:20`);
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
