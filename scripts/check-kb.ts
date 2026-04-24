#!/usr/bin/env node
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function checkKB() {
  const races = await sql`SELECT COUNT(*) as count FROM races`;
  const runners = await sql`SELECT COUNT(*) as count FROM runners`;
  const bets = await sql`SELECT COUNT(*) as count FROM bets`;
  const jockeys = await sql`SELECT COUNT(*) as count FROM jockey_stats`;
  const trainers = await sql`SELECT COUNT(*) as count FROM trainer_stats`;

  console.log('\n📊 KB Status:\n');
  console.log(`   Races: ${races[0].count}`);
  console.log(`   Runners: ${runners[0].count}`);
  console.log(`   Bets placed: ${bets[0].count}`);
  console.log(`   Jockey profiles: ${jockeys[0].count}`);
  console.log(`   Trainer profiles: ${trainers[0].count}\n`);

  await sql.end();
}

checkKB().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
