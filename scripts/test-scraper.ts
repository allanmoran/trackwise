#!/usr/bin/env node
/**
 * Debug script to test if scraper can find pending bets and Racing.com pages
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function test() {
  console.log('\n🔍 SCRAPER DIAGNOSTIC\n');

  try {
    // Check pending bets
    const pending = await sql`
      SELECT id, track, race_num, horse, created_at
      FROM bets
      WHERE result IS NULL
      LIMIT 5
    `;

    console.log(`✅ Database connected`);
    console.log(`📊 Pending bets: ${pending.length}\n`);

    if (pending.length === 0) {
      console.log('⚠️  No pending bets found!');
      console.log('   → All bets have results, or no bets exist');
      await sql.end();
      return;
    }

    pending.forEach(b => {
      const raceDate = new Date(b.created_at).toISOString().split('T')[0];
      const url = `https://www.racing.com/form/${raceDate}/${b.track.toLowerCase().replace(/\s+/g, '-')}/race-${b.race_num}/full-form`;
      console.log(`${b.track} R${b.race_num}: ${b.horse}`);
      console.log(`   URL: ${url}`);
      console.log(`   Created: ${raceDate}\n`);
    });

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await sql.end();
  }
}

test();
