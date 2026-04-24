#!/usr/bin/env node
/**
 * Quick entry: Eagle Farm R3 race data
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
    const raceId = '2026-04-08-Eagle-Farm-3';
    const runners = [
      { name: 'BUSKER', jockey: 'Emily Pozman', trainer: 'Robert Heathcote', odds: 7.50, weight: '60.0', barrier: '1' },
      { name: 'HEROIC BEACH', jockey: 'Amber Riddell', trainer: 'Matt Kropp', odds: 35.00, weight: '60.0', barrier: '2' },
      { name: 'HEROIC REBEL', jockey: 'Taylor Johnstone', trainer: 'Tony Gollan', odds: 3.30, weight: '60.0', barrier: '3' },
      { name: 'PREFER TO DANCE', jockey: 'Jabez Johnstone', trainer: 'Vishan Venkaya', odds: 81.00, weight: '60.0', barrier: '4' },
      { name: 'TUKI TWELVE', jockey: 'Emily Lang', trainer: 'Gillian Heinrich & Ben Rodgers', odds: 27.00, weight: '60.0', barrier: '5' },
      { name: 'CLIVE\'S GLORY', jockey: 'Chelsea Baker', trainer: 'Billy Healey', odds: 4.80, weight: '59.0', barrier: '6' },
      { name: 'INSIDE PASSAGE', jockey: 'Corey Sutherland', trainer: 'Stuart Kendrick', odds: 10.00, weight: '59.0', barrier: '7' },
      { name: 'GREY IMPACT', jockey: 'Chanel Cooper', trainer: 'Lindsay Gough', odds: 12.00, weight: '58.0', barrier: '8' },
      { name: 'DIVERSITY', jockey: 'Tahlia Fenlon', trainer: 'Michael Freedman', odds: 3.20, weight: '57.0', barrier: '9' },
      { name: 'CRYPTO MAGIC', jockey: 'Dakota Gillett', trainer: 'Bruce Brown', odds: 26.00, weight: '57.0', barrier: '10' },
    ];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    QUICK ENTRY: EAGLE FARM R3          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (
        ${raceId},
        ${'2026-04-08'},
        ${'Eagle Farm'},
        ${3},
        ${'13:18'},
        ${sql.json(runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    console.log(`✓ Inserted: Eagle Farm R3 @ 13:18`);
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
