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
    const raceId = '2026-04-08-Sale-6';
    const runners = [
      { name: 'Daily Bugle', jockey: 'Ruby Lamont', trainer: 'Robbie Griffiths', odds: 17.00, weight: '61.5', barrier: '7' },
      { name: 'Rosa Aotearoa', jockey: 'Daniel Stackhouse', trainer: 'Reece Goodwin', odds: 1.55, weight: '61.5', barrier: '1' },
      { name: 'Bon\'s Your Back', jockey: 'Teo Nugent', trainer: 'Rebecca Kelly', odds: 21.00, weight: '61.0', barrier: '2' },
      { name: 'The Mansman', jockey: 'Lachlan Neindorf', trainer: 'Peter Gelagotis', odds: 6.50, weight: '61.0', barrier: '5' },
      { name: 'Joltin\' Joe', jockey: 'Jason Maskiell', trainer: 'Paul & Tracey Templeton', odds: 20.00, weight: '58.5', barrier: '4' },
      { name: 'Two To Tango', jockey: 'Ben Allen', trainer: 'Ben, Will & Jd Hayes', odds: 3.40, weight: '57.5', barrier: '6' },
      { name: 'A Penny Spent', jockey: 'Ben Kennedy', trainer: 'Heather Stephens', odds: 101.00, weight: '55.0', barrier: '3' },
    ];

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, race_time, runners)
      VALUES (${raceId}, ${'2026-04-08'}, ${'Sale'}, ${6}, ${'15:30'}, ${sql.json(runners)})
      ON CONFLICT (id) DO UPDATE SET runners = EXCLUDED.runners
    `;

    console.log(`✓ Sale R6 @ 15:30 - Johnson Plumbing & Gas BM62 Handicap`);
    console.log(`  7 runners | Rosa Aotearoa 1.55 favorite`);
  } finally {
    await sql.end();
  }
}

quickEntry();
