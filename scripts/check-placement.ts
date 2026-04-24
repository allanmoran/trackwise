#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function check() {
  const today = new Date().toISOString().split('T')[0];

  const bets = await sql`
    SELECT track, COUNT(*) as count FROM bets GROUP BY track ORDER BY track
  `;

  const kelly = await sql`
    SELECT track, COUNT(*) as count FROM kelly_logs 
    WHERE date::date = ${today}
    GROUP BY track ORDER BY track
  `;

  console.log('\n📊 Database State:\n');
  console.log('Bets by track:');
  for (const b of bets) {
    console.log(`   ${b.track}: ${b.count}`);
  }

  console.log('\nKelly logs today by track:');
  for (const k of kelly) {
    console.log(`   ${k.track}: ${k.count}`);
  }

  console.log();

  await sql.end();
}

check().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
