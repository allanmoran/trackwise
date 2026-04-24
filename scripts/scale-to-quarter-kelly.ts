#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function scaleToQuarterKelly() {
  // Get current totals
  const before = await sql`
    SELECT COUNT(*) as count, SUM(CAST(stake AS DECIMAL)) as total
    FROM bets
    WHERE track IN ('Cairns', 'Geraldton', 'Gosford')
  `;

  const oldTotal = parseFloat(before[0].total || 0);

  // Scale all stakes to 50% (Half Kelly → Quarter Kelly)
  await sql`
    UPDATE bets
    SET stake = stake * 0.5
    WHERE track IN ('Cairns', 'Geraldton', 'Gosford')
  `;

  const after = await sql`
    SELECT SUM(CAST(stake AS DECIMAL)) as total
    FROM bets
    WHERE track IN ('Cairns', 'Geraldton', 'Gosford')
  `;

  const newTotal = parseFloat(after[0].total || 0);

  console.log(`\n✅ Quarter Kelly Applied:\n`);
  console.log(`   Old total staked: $${oldTotal.toFixed(2)}`);
  console.log(`   New total staked: $${newTotal.toFixed(2)}`);
  console.log(`   Reduction: ${((1 - newTotal/oldTotal) * 100).toFixed(0)}%\n`);

  await sql.end();
}

scaleToQuarterKelly().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
