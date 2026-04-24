#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function check() {
  const gosford = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Gosford'
  `;

  console.log(`\nGosford bets: ${gosford[0].count}\n`);

  await sql.end();
}

check().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
