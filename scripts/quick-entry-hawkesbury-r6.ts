#!/usr/bin/env node
/**
 * Quick entry: Hawkesbury R6 race data
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
    const raceId = '2026-04-08-Hawkesbury-6';
    const runners = [
      { name: 'War Ribbon', jockey: 'Keagan Latham', trainer: 'David Payne', odds: 26.00, weight: '57.0', barrier: '1' },
      { name: 'Night Agent', jockey: 'Tom Sherry', trainer: 'Kris Lees', odds: 1.75, weight: '56.0', barrier: '2' },
      { name: 'Stealthfire', jockey: 'Sam Clipperton', trainer: 'Chris Waller', odds: 16.00, weight: '56.5', barrier: '3' },
      { name: 'Bubbles Up', jockey: 'Tim Clark', trainer: 'Gai Waterhouse & Adrian Bott', odds: 7.00, weight: '54.5', barrier: '4' },
      { name: 'Bella Khadijah', jockey: 'Jason Collett', trainer: 'Brad Widdup', odds: 6.00, weight: '57.5', barrier: '5' },
      { name: 'Sacrify', jockey: 'Mollie Fitzgerald', trainer: 'Annabel & Rob Archibald', odds: 18.00, weight: '59.0', barrier: '6' },
      { name: 'Chokuto', jockey: 'James McDonald', trainer: 'Chris Waller', odds: 8.00, weight: '56.5', barrier: '10' },
      { name: 'Superfabulistic', jockey: 'Rachel King', trainer: 'Gai Waterhouse & Adrian Bott', odds: 13.00, weight: '54.0', barrier: '12' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: HAWKESBURY R6          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Hawkesbury'},
        ${6},
        ${'16:30'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Hawkesbury R6 @ 16:30`);
    console.log(`  ${runners.length} runners with real jockeys/trainers/odds (5 scratched)\n`);

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
