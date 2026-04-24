#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function cleanupDuplicates() {
  // Get all Cairns bets grouped by track/race/horse, keep only the newest
  const bets = await sql`
    SELECT id, track, race_num, horse, created_at,
           ROW_NUMBER() OVER (PARTITION BY track, race_num, horse ORDER BY created_at DESC) as rn
    FROM bets
    WHERE track = 'Cairns'
    ORDER BY race_num, horse, created_at DESC
  `;

  // Find duplicates to delete (keep rn=1, delete rn>=2)
  const toDelete = bets.filter(b => b.rn > 1).map(b => b.id);

  console.log(`\n🧹 Cleanup:\n`);
  console.log(`   Total Cairns bets: ${bets.length}`);
  console.log(`   Duplicates to remove: ${toDelete.length}`);

  if (toDelete.length > 0) {
    // Delete old duplicates
    await sql`
      DELETE FROM bets
      WHERE id = ANY(${toDelete})
    `;
    console.log(`   ✓ Deleted ${toDelete.length} old duplicates`);
  }

  // Check remaining
  const remaining = await sql`
    SELECT COUNT(*) as count FROM bets WHERE track = 'Cairns'
  `;

  console.log(`   Remaining Cairns bets: ${remaining[0].count}\n`);

  await sql.end();
}

cleanupDuplicates().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
