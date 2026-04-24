#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function reset() {
  const today = new Date().toISOString().split('T')[0];

  // Set bank to $2,500
  await sql`
    UPDATE session_bank
    SET bank = 2500
    WHERE date = ${today}
  `;

  const bank = await sql`
    SELECT bank FROM session_bank WHERE date = ${today}
  `;

  console.log(`\n💰 Bank Reset:\n`);
  console.log(`   New bankroll: $${parseFloat(bank[0].bank).toFixed(2)}`);
  console.log(`   Total staked: $2,488.71`);
  console.log(`   Remaining: $${(2500 - 2488.71).toFixed(2)}\n`);

  await sql.end();
}

reset().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
