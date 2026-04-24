#!/usr/bin/env node
/**
 * Quick entry: Pinjarra R2 race data
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
    const raceId = '2026-04-08-Pinjarra-2';
    const runners = [
      { name: 'POINTLESS PRAISE', jockey: 'Shaun McGruddy', trainer: 'Grant Coutts', odds: 4.80, weight: '57.0', barrier: '1' },
      { name: 'ROYAL TROOPER', jockey: 'Peter Hall', trainer: 'Adam Durrant', odds: 11.00, weight: '57.0', barrier: '2' },
      { name: 'AHH CHOUX', jockey: 'William Pike', trainer: 'Peter Fernie', odds: 7.00, weight: '57.0', barrier: '3' },
      { name: 'DECLARED INNOCENT', jockey: 'Christopher Plain', trainer: 'Peter Jarvis', odds: 31.00, weight: '56.0', barrier: '4' },
      { name: 'MACHO ARQUERO', jockey: 'Steven Parnham', trainer: 'David Jolly', odds: 9.00, weight: '56.0', barrier: '5' },
      { name: 'KING OF CORDOBA', jockey: 'Jarrod Noske', trainer: 'Lindsay Steer', odds: 23.00, weight: '55.0', barrier: '6' },
      { name: 'HOT CHATTER', jockey: 'Damien Maplesden', trainer: 'Sean Casey', odds: 5.50, weight: '55.0', barrier: '7' },
      { name: 'MR BLING', jockey: 'Jade McNaught', trainer: 'Peter Young', odds: 8.50, weight: '54.5', barrier: '8' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: PINJARRA R2            ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Pinjarra'},
        ${2},
        ${'15:45'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Pinjarra R2 @ 15:45`);
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
