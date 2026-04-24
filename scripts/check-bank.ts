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

  const bank = await sql`
    SELECT date, bank FROM session_bank
    ORDER BY date DESC LIMIT 5
  `;

  const bets = await sql`
    SELECT COUNT(*) as count, SUM(CAST(stake AS DECIMAL)) as total
    FROM bets
    WHERE track = 'Cairns'
  `;

  console.log('\n💰 Bank History:\n');
  for (const row of bank) {
    console.log(`   ${row.date}: $${parseFloat(row.bank).toFixed(2)}`);
  }

  console.log(`\n📊 Cairns Bets:\n`);
  console.log(`   Count: ${bets[0].count}`);
  console.log(`   Total staked: $${parseFloat(bets[0].total || 0).toFixed(2)}\n`);

  await sql.end();
}

check().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
