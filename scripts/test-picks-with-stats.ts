#!/usr/bin/env node
/**
 * Test: Score today's races using trainer/jockey stats and show high-confidence picks
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

async function scoreRunnerWithStats(
  runner: any,
  jockeyName: string,
  trainerName: string,
  jockeyStatsMap: Map<string, any>,
  trainerStatsMap: Map<string, any>
): Promise<number> {
  let score = 50; // Base

  // Market-backed scoring
  if (runner.odds < 3.5) score = 58;
  else if (runner.odds >= 3.5 && runner.odds < 5.5) score = 54;
  else if (runner.odds >= 5.5) score = 50;

  // Trainer bonus (if we have data and win rate > 15%)
  const trainerStat = trainerStatsMap.get(trainerName);
  if (trainerStat && trainerStat.total_runners > 0) {
    const trainerWinRate = (trainerStat.win_count / trainerStat.total_runners) * 100;
    if (trainerWinRate > 15) {
      const bonus = Math.min(5, Math.floor((trainerWinRate - 15) / 5));
      score += bonus;
    }
  }

  // Jockey bonus (if we have data and win rate > 15%)
  const jockeyStat = jockeyStatsMap.get(jockeyName);
  if (jockeyStat && jockeyStat.total_runners > 0) {
    const jockeyWinRate = (jockeyStat.win_count / jockeyStat.total_runners) * 100;
    if (jockeyWinRate > 15) {
      const bonus = Math.min(5, Math.floor((jockeyWinRate - 15) / 5));
      score += bonus;
    }
  }

  return Math.min(100, score);
}

async function testPicks() {
  try {
    const today = new Date().toISOString().split('T')[0];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    DAILY PICKS TEST (WITH STATS)       ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Load stats tables
    const trainerStatsResult = await sql`SELECT * FROM trainer_stats`;
    const jockeyStatsResult = await sql`SELECT * FROM jockey_stats`;

    const trainerStatsMap = new Map(
      trainerStatsResult.map((t) => [t.trainer_name, t])
    );
    const jockeyStatsMap = new Map(
      jockeyStatsResult.map((j) => [j.jockey_name, j])
    );

    console.log(`Loaded stats: ${trainerStatsMap.size} trainers, ${jockeyStatsMap.size} jockeys\n`);

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
      console.log('─'.repeat(70));

      const picksWithScores = [];

      for (const r of runners) {
        const score = await scoreRunnerWithStats(
          r,
          r.jockey,
          r.trainer,
          jockeyStatsMap,
          trainerStatsMap
        );
        picksWithScores.push({ ...r, score });
      }

      const picks = picksWithScores
        .sort((a, b) => b.score - a.score)
        .slice(0, 3); // Top 3

      for (const pick of picks) {
        const marker = pick.score >= 60 ? '★ HIGH' : '  ';
        const trainerWinRate = trainerStatsMap.get(pick.trainer)
          ? (
              (trainerStatsMap.get(pick.trainer).win_count /
                trainerStatsMap.get(pick.trainer).total_runners) *
              100
            ).toFixed(0)
          : '—';
        const jockeyWinRate = jockeyStatsMap.get(pick.jockey)
          ? (
              (jockeyStatsMap.get(pick.jockey).win_count /
                jockeyStatsMap.get(pick.jockey).total_runners) *
              100
            ).toFixed(0)
          : '—';

        console.log(
          `  ${marker} ${pick.name.padEnd(25)} @${pick.odds} = ${pick.score}/100 (T:${trainerWinRate}% J:${jockeyWinRate}%)`
        );
        if (pick.score >= 60) highConfidence++;
        totalPicks++;
      }
    }

    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║    SUMMARY                             ║`);
    console.log(`╚════════════════════════════════════════╝`);
    console.log(`Total picks shown: ${totalPicks}`);
    console.log(`High confidence (>60): ${highConfidence}`);
    console.log(`\n✓ Stats-based scoring now active!\n`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

testPicks();
