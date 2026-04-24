#!/usr/bin/env node
/**
 * Quick entry: Hawkesbury R2 race data
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
    const raceId = '2026-04-08-Hawkesbury-2';
    const runners = [
      { name: 'PREMIUM', jockey: 'Mitch Stapleford', trainer: 'Gary Portelli', odds: 31.00, weight: '59.5', barrier: '1' },
      { name: 'SOMERTON SMART', jockey: 'Siena Grima', trainer: 'Sue Grills', odds: 4.00, weight: '59.5', barrier: '2' },
      { name: 'LA BASILIQUE', jockey: 'James McDonald', trainer: 'Chris Waller', odds: 7.00, weight: '59.0', barrier: '3' },
      { name: 'SAPLING', jockey: 'Zac Lloyd', trainer: 'Nacim Dilmi', odds: 6.50, weight: '58.5', barrier: '4' },
      { name: 'FAIRWAY TO HEAVEN', jockey: 'Tim Clark', trainer: 'Michael Freedman', odds: 7.00, weight: '58.0', barrier: '5' },
      { name: 'LIPSTICK', jockey: 'Sam Clipperton', trainer: 'Chris Waller', odds: 13.00, weight: '58.0', barrier: '6' },
      { name: 'LIGHTHOUSE LASS', jockey: 'Jason Collett', trainer: 'Richard & Will Freedman', odds: 3.40, weight: '57.0', barrier: '7' },
      { name: 'ADMIRE ME', jockey: 'Tyler Schiller', trainer: 'Brad Widdup', odds: 13.00, weight: '56.5', barrier: '8' },
      { name: 'STUBBORN EMMELIE', jockey: 'Keagan Latham', trainer: 'Gerald Ryan & Sterling Alexiou', odds: 18.00, weight: '56.5', barrier: '9' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: HAWKESBURY R2          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Hawkesbury'},
        ${2},
        ${'14:10'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Hawkesbury R2 @ 14:10`);
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
