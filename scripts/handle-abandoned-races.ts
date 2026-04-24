#!/usr/bin/env node
/**
 * Handle abandoned races - void bets and return stakes
 * Usage: npx tsx scripts/handle-abandoned-races.ts <track>
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function handleAbandoned(track: string) {
  console.log(`\n🌧️  Handling Abandoned Races at ${track}\n`);
  console.log('=' .repeat(60));

  try {
    // Get all pending bets for this track
    const bets = await sql`
      SELECT id, horse, stake, race_num
      FROM bets
      WHERE track = ${track} AND result IS NULL
    `;

    if (bets.length === 0) {
      console.log(`\n✅ No pending bets for ${track}\n`);
      return;
    }

    console.log(`\n📊 Found ${bets.length} bets to void\n`);

    let totalStaked = 0;

    // Mark each bet as void (no result)
    for (const bet of bets) {
      await sql`
        UPDATE bets
        SET result = 'VOID'
        WHERE id = ${bet.id}
      `;
      const stake = parseFloat(bet.stake);
      console.log(`  ✓ R${bet.race_num}: ${bet.horse} → VOID (stake returned: $${stake.toFixed(2)})`);
      totalStaked += stake;
    }

    // Return stakes to bank
    const today = new Date().toISOString().split('T')[0];
    const currentBankRow = await sql`SELECT bank FROM session_bank ORDER BY date DESC LIMIT 1`;
    const bank = currentBankRow.length > 0 ? parseFloat(String(currentBankRow[0].bank)) : 0;
    const newBank = bank + totalStaked;

    await sql`
      INSERT INTO session_bank (date, bank)
      VALUES (${today}, ${newBank})
    `;

    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ All ${track} bets marked VOID`);
    console.log(`   Stakes returned: $${totalStaked.toFixed(2)}`);
    console.log(`   New bank: $${newBank.toFixed(2)}\n`);

  } catch (err) {
    console.error('[Error]', err);
  } finally {
    await sql.end();
  }
}

const track = process.argv[2];
if (!track) {
  console.error('\nUsage: npx tsx scripts/handle-abandoned-races.ts <track>');
  console.error('Example: npx tsx scripts/handle-abandoned-races.ts Kyneton\n');
  process.exit(1);
}

handleAbandoned(track).catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
