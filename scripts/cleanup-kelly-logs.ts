#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function cleanup() {
  const today = new Date().toISOString().split('T')[0];

  const before = await sql`SELECT COUNT(*) as count FROM kelly_logs`;
  
  // Delete all but today's kelly logs
  await sql`
    DELETE FROM kelly_logs
    WHERE date::date < ${today}
  `;

  const after = await sql`SELECT COUNT(*) as count FROM kelly_logs`;

  console.log(`\n🧹 Kelly Logs Cleanup:\n`);
  console.log(`   Before: ${before[0].count} entries`);
  console.log(`   Deleted: ${before[0].count - after[0].count} old entries`);
  console.log(`   Remaining (today): ${after[0].count} entries\n`);

  // Check total staked
  const staked = await sql`
    SELECT SUM(CAST(kelly_stake AS DECIMAL)) as total FROM kelly_logs
  `;

  console.log(`   Total staked (today): $${parseFloat(staked[0].total || 0).toFixed(2)}\n`);

  await sql.end();
}

cleanup().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
