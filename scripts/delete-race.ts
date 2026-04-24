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
    await sql`DELETE FROM manual_races WHERE id = '2026-04-08-Eagle-Farm-1'`;
    console.log('✓ Old entry deleted');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
})();
