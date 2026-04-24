#!/usr/bin/env node
/**
 * Test: Score today's races and show confidence picks
 */

import 'dotenv/config';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '', {
  idle_timeout: 30,
  max_lifetime: 60 * 30,
});

// Scoring function (from race-entry-integration.ts)
function scoreRunnerFromKB(runner: any, jockeyStats: any, trainerStats: any): number {
  let score = 50; // Base

  // Market-backed scoring
  if (runner.odds < 3.5) score = 58;
  else if (runner.odds >= 3.5 && runner.odds < 5.5) score = 54;
  else if (runner.odds >= 5.5) score = 50;

  // Jockey bonus (if we have data)
  if (jockeyStats && jockeyStats.win_rate && jockeyStats.win_rate > 15) {
    score += Math.min(5, Math.floor((jockeyStats.win_rate - 15) / 5));
  }

  // Trainer bonus (if we have data)
  if (trainerStats && trainerStats.win_rate && trainerStats.win_rate > 15) {
    score += Math.min(5, Math.floor((trainerStats.win_rate - 15) / 5));
  }

  return Math.min(100, score);
}

async function testPicks() {
  try {
    const today = new Date().toISOString().split('T')[0];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    DAILY PICKS TEST                    ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Get today's races
    const races = await sql`
      SELECT date, track, race_num, race_time, runners
      FROM manual_races
      WHERE date = ${today}
      ORDER BY track, race_num
    `;

    console.log(`Found ${races.length} races for ${today}\n`);

    let totalPicks = 0;
    let highConfidence = 0;

    for (const race of races) {
      const runners = typeof race.runners === 'string' ? JSON.parse(race.runners) : race.runners;

      if (!runners || runners.length === 0) continue;

      console.log(`\n${race.track} R${race.race_num} @ ${race.race_time}`);
      console.log('─'.repeat(50));

      const picks = runners
        .map((r: any) => ({
          ...r,
          score: scoreRunnerFromKB(r, null, null), // No jockey/trainer stats in KB yet
        }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 3); // Top 3

      for (const pick of picks) {
        const marker = pick.score >= 60 ? '★ HIGH' : '  ';
        console.log(`  ${marker} ${pick.name.padEnd(25)} @${pick.odds} = ${pick.score}/100`);
        if (pick.score >= 60) highConfidence++;
        totalPicks++;
      }
    }

    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║    SUMMARY                             ║`);
    console.log(`╚════════════════════════════════════════╝`);
    console.log(`Total picks shown: ${totalPicks}`);
    console.log(`High confidence (>60): ${highConfidence}`);
    console.log(
      `\nNote: Confidence is based on market odds only. Jockey/trainer bonuses will unlock as KB grows.`
    );
    console.log(`\n`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

testPicks();
