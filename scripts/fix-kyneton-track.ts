#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function fix() {
  // Find Gosford bets with times 13:00-16:30 (those are Kyneton)
  const before = await sql`
    SELECT id, race_num, horse FROM bets 
    WHERE track = 'Gosford' 
    AND race_num IN (1, 2, 3, 4, 5, 6, 7, 8)
    ORDER BY race_num
  `;

  console.log(`\n📍 Fixing track names:\n`);
  console.log(`   Found ${before.length} Gosford bets to convert to Kyneton\n`);

  // Update to Kyneton
  await sql`
    UPDATE bets
    SET track = 'Kyneton'
    WHERE track = 'Gosford'
    AND race_num IN (1, 2, 3, 4, 5, 6, 7, 8)
  `;

  // Also update kelly_logs
  await sql`
    UPDATE kelly_logs
    SET track = 'Kyneton'
    WHERE track = 'Gosford'
    AND date::date = CURRENT_DATE
    AND race_num IN (1, 2, 3, 4, 5, 6, 7, 8)
  `;

  const kyneton = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Kyneton'
  `;

  const gosford = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Gosford'
  `;

  console.log(`   ✓ Converted to Kyneton: ${kyneton[0].count} bets`);
  console.log(`   Remaining Gosford: ${gosford[0].count} bets\n`);

  await sql.end();
}

fix().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
