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
    ORDER BY date DESC
    LIMIT 10
  `;

  const bets = await sql`
    SELECT track, COUNT(*) as count, SUM(CAST(stake AS DECIMAL)) as total
    FROM bets
    GROUP BY track
    ORDER BY track
  `;

  console.log('\n💰 Bank History:\n');
  for (const row of bank) {
    console.log(`   ${row.date}: $${parseFloat(row.bank).toFixed(2)}`);
  }

  console.log('\n📊 Total Bets by Track:\n');
  let grandTotal = 0;
  for (const b of bets) {
    const t = parseFloat(b.total || 0);
    console.log(`   ${b.track}: ${b.count} bets, $${t.toFixed(2)}`);
    grandTotal += t;
  }
  console.log(`   TOTAL STAKED: $${grandTotal.toFixed(2)}\n`);

  await sql.end();
}

check().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
