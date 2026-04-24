#!/usr/bin/env node
/**
 * Check pending bets - ready for result scraping
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function checkPending() {
  const pending = await sql`
    SELECT
      track, race_num, COUNT(*) as count,
      MIN(race_time) as earliest_time
    FROM bets
    WHERE result IS NULL
    GROUP BY track, race_num
    ORDER BY track, race_num
  `;

  console.log('\n📊 Pending Results by Race\n');
  console.log('Track'.padEnd(20) + 'Race'.padEnd(6) + 'Bets'.padEnd(6) + 'Time');
  console.log('─'.repeat(50));

  let totalPending = 0;
  for (const p of pending) {
    console.log(
      p.track.padEnd(20) +
      `R${p.race_num}`.padEnd(6) +
      p.count.toString().padEnd(6) +
      (p.earliest_time || '—')
    );
    totalPending += p.count;
  }

  console.log('─'.repeat(50));
  console.log(`\nTotal Pending: ${totalPending} bets\n`);
  console.log('Once races finish, run:');
  console.log('  npx tsx scripts/scrape-sportsbet-results.ts\n');

  await sql.end();
}

checkPending().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
