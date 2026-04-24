#!/usr/bin/env node
import 'dotenv/config';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

(async () => {
  try {
    const race = await sql`
      SELECT id, date, track, race_num, runners
      FROM manual_races
      WHERE id = '2026-04-08-Eagle-Farm-1'
    `;

    console.log('Raw DB row:', JSON.stringify(race[0], null, 2));

    if (race[0]) {
      const runners = race[0].runners;
      console.log('\nRunners type:', typeof runners);
      console.log('Is array?', Array.isArray(runners));
      if (Array.isArray(runners)) {
        console.log('Length:', runners.length);
        console.log('First runner:', runners[0]);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
})();
