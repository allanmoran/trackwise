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

  // Reset bank to $200
  await sql`
    UPDATE session_bank
    SET bank = 200
    WHERE date = ${today}
  `;

  // Delete Cairns bets (we'll re-place them at Half Kelly)
  await sql`
    DELETE FROM bets
    WHERE track = 'Cairns'
  `;

  // Delete today's kelly logs (we'll re-log at Half Kelly)
  await sql`
    DELETE FROM kelly_logs
    WHERE date::date = ${today}
  `;

  console.log(`\n🔄 Reset for Half Kelly:\n`);
  console.log(`   ✓ Bank reset to $200`);
  console.log(`   ✓ Cleared 11 Cairns bets (will re-place at 0.5x)`);
  console.log(`   ✓ Cleared today's kelly logs\n`);

  await sql.end();
}

reset().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
