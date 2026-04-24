#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function fix() {
  // Find the newest Gosford bets (those are Taree)
  const allGosford = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Gosford'
  `;

  // We had 10 Gosford before Taree, so the extras are Taree
  const extraCount = allGosford[0].count - 10;

  console.log(`\n📍 Fixing track names:\n`);
  console.log(`   Found ${extraCount} extra Gosford bets (those are Taree)\n`);

  if (extraCount > 0) {
    // Get the oldest extra Gosford bets (newest ones by date)
    const tareeIds = await sql`
      SELECT id FROM bets
      WHERE track = 'Gosford'
      ORDER BY created_at DESC
      LIMIT ${extraCount}
    `;

    // Update to Taree
    await sql`
      UPDATE bets
      SET track = 'Taree'
      WHERE id = ANY(${tareeIds.map(t => t.id)})
    `;

    console.log(`   ✓ Converted ${extraCount} bets to Taree`);
  }

  // Also update kelly_logs if needed
  const kellyTaree = await sql`
    UPDATE kelly_logs
    SET track = 'Taree'
    WHERE track = 'Gosford'
    AND date::date = CURRENT_DATE
    AND race_num > 8
  `;

  const final = await sql`
    SELECT track, COUNT(*) as count FROM bets GROUP BY track ORDER BY track
  `;

  console.log(`\n📊 Final bet count:\n`);
  let total = 0;
  for (const b of final) {
    console.log(`   ${b.track}: ${b.count}`);
    total += b.count;
  }

  console.log(`\n   TOTAL: ${total} bets\n`);

  await sql.end();
}

fix().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
