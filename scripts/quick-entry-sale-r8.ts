#!/usr/bin/env node
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
    const raceId = '2026-04-08-Sale-8';
    const runners = [
      { name: 'Sabi Storm', jockey: 'Beau Mertens', trainer: 'Trent Busuttin & Natalie Young', odds: 3.80, weight: '60.0', barrier: '7' },
      { name: 'Winter Nights', jockey: 'Daniel Stackhouse', trainer: 'Ben, Will & Jd Hayes', odds: 3.60, weight: '59.5', barrier: '4' },
      { name: 'Madesian', jockey: 'Jett Stanley', trainer: 'Trent Busuttin & Natalie Young', odds: 7.00, weight: '59.0', barrier: '1' },
      { name: 'The King And I', jockey: 'Liana Wood', trainer: 'Kim & Gayle Mayberry', odds: 8.00, weight: '59.0', barrier: '2' },
      { name: 'Cyclone Harmony', jockey: 'Lachlan Neindorf', trainer: 'Peter Gelagotis', odds: 4.80, weight: '58.5', barrier: '3' },
      { name: 'Monte Cassino', jockey: 'Thomas Stockdale', trainer: 'Glen Thompson', odds: 8.50, weight: '58.0', barrier: '9' },
      { name: 'Russian Roni', jockey: 'Jason Maskiell', trainer: 'Rebecca Kelly', odds: 13.00, weight: '58.0', barrier: '6' },
      { name: 'Grand Sage', jockey: 'Valentin Le Boeuf', trainer: 'Reg Manning', odds: 61.00, weight: '55.5', barrier: '5' },
      { name: 'Northwood Vamoose', jockey: 'Sally Wynne', trainer: 'Sally Wynne', odds: 31.00, weight: '54.0', barrier: '8' },
    ];

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (${raceId}, ${'2026-04-08'}, ${'Sale'}, ${8}, ${'16:40'}, ${sql.json(runners)})
      ON CONFLICT (id) DO UPDATE SET runners = EXCLUDED.runners
    `;

    console.log(`✓ Sale R8 @ 16:40 - Ladbrokes Mega Multi BM62 Handicap`);
    console.log(`  9 runners | Winter Nights 3.60 favorite`);
  } finally {
    await sql.end();
  }
}

quickEntry();
