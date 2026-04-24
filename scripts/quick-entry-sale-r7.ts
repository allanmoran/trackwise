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
    const raceId = '2026-04-08-Sale-7';
    const runners = [
      { name: 'Ring True', jockey: 'Olivia East', trainer: 'Mick Price & Michael Kent Jnr', odds: 14.00, weight: '62.5', barrier: '2' },
      { name: 'Blue Cowboy', jockey: 'Ruby Lamont', trainer: 'Michael Kent', odds: 7.50, weight: '61.5', barrier: '6' },
      { name: 'Small Town Hero', jockey: 'Jake Noonan', trainer: 'Brett Conlon', odds: 3.00, weight: '60.0', barrier: '3' },
      { name: 'Rock The Bar', jockey: 'Teo Nugent', trainer: 'Shannon Roughan', odds: 12.00, weight: '59.0', barrier: '7' },
      { name: 'Immerse', jockey: 'Daniel Stackhouse', trainer: 'Tony & Calvin McEvoy', odds: 4.20, weight: '58.5', barrier: '5' },
      { name: 'Lots To Love', jockey: 'Ryan Houston', trainer: 'Annabel & Rob Archibald', odds: 10.00, weight: '58.5', barrier: '8' },
      { name: 'Axiom', jockey: 'Thomas Stockdale', trainer: 'Gavin Bedggood', odds: 3.40, weight: '58.0', barrier: '1' },
      { name: 'Ugly Nicos', jockey: 'Sheridan Clarke', trainer: 'Angela Bence', odds: 126.00, weight: '54.0', barrier: '4' },
    ];

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (${raceId}, ${'2026-04-08'}, ${'Sale'}, ${7}, ${'16:05'}, ${sql.json(runners)})
      ON CONFLICT (id) DO UPDATE SET runners = EXCLUDED.runners
    `;

    console.log(`✓ Sale R7 @ 16:05 - Programmed Property Services BM62 Handicap`);
    console.log(`  8 runners | Small Town Hero 3.00 favorite`);
  } finally {
    await sql.end();
  }
}

quickEntry();
