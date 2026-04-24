#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function fix() {
  // Change Gosford bets with those race times to Geraldton
  const result = await sql`
    UPDATE bets
    SET track = 'Geraldton'
    WHERE track = 'Gosford' 
    AND race_num IN (1, 2, 3, 4, 5, 6, 7, 8)
    AND created_at > now() - interval '30 minutes'
  `;

  // Also fix kelly_logs
  await sql`
    UPDATE kelly_logs
    SET track = 'Geraldton'
    WHERE track = 'Gosford'
    AND date::date = CURRENT_DATE
  `;

  const bets = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Geraldton'
  `;

  console.log(`\n✓ Fixed track names:\n`);
  console.log(`   Updated bets to Geraldton: ${result.count}`);
  console.log(`   Total Geraldton bets: ${bets[0].count}\n`);

  await sql.end();
}

fix().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
