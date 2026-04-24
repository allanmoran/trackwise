#!/usr/bin/env node
/**
 * Aggregate trainer and jockey win rate statistics from manual_races knowledge base
 * This builds the statistics tables needed for bonus scoring in recommendations
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

async function aggregateStats() {
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    STATS AGGREGATION                   ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Ensure tables exist
    await sql`
      CREATE TABLE IF NOT EXISTS trainer_stats (
        trainer_name TEXT PRIMARY KEY,
        total_runners INT DEFAULT 0,
        win_count INT DEFAULT 0,
        place_count INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS jockey_stats (
        jockey_name TEXT PRIMARY KEY,
        total_runners INT DEFAULT 0,
        win_count INT DEFAULT 0,
        place_count INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Clear existing stats
    await sql`TRUNCATE trainer_stats, jockey_stats`;

    // Get all races from KB
    const races = await sql`
      SELECT id, track, race_num, runners
      FROM manual_races
      ORDER BY id
    `;

    console.log(`Processing ${races.length} races from knowledge base...\n`);

    const trainerStats = new Map<string, { total: number; wins: number; places: number }>();
    const jockeyStats = new Map<string, { total: number; wins: number; places: number }>();

    // Parse runner data and aggregate with market-based scoring
    // Use odds as proxy for competence: lower avg odds = better trainer/jockey
    for (const race of races) {
      const runners = typeof race.runners === 'string' ? JSON.parse(race.runners) : race.runners;

      if (!runners || !Array.isArray(runners)) continue;

      for (const runner of runners) {
        const odds = runner.odds || 10; // Default if missing

        // Process trainer (estimate win probability from odds)
        if (runner.trainer) {
          const t = runner.trainer;
          if (!trainerStats.has(t)) {
            trainerStats.set(t, { total: 0, wins: 0, places: 0 });
          }
          const ts = trainerStats.get(t)!;
          ts.total += 1;
          // Estimate win probability: 1/(odds) approximates win likelihood
          // Convert to implied wins for aggregation
          const impliedWinProb = 1 / odds;
          ts.wins += Math.round(impliedWinProb * 100); // Scale to percentage
        }

        // Process jockey
        if (runner.jockey) {
          const j = runner.jockey;
          if (!jockeyStats.has(j)) {
            jockeyStats.set(j, { total: 0, wins: 0, places: 0 });
          }
          const js = jockeyStats.get(j)!;
          js.total += 1;
          const impliedWinProb = 1 / odds;
          js.wins += Math.round(impliedWinProb * 100);
        }
      }
    }

    // Insert trainer stats
    let trainerCount = 0;
    for (const [name, stats] of trainerStats.entries()) {
      const estimatedWinRate = stats.total > 0 ? Math.round((stats.wins / stats.total) / 100) : 0;
      await sql`
        INSERT INTO trainer_stats (trainer_name, total_runners, win_count, place_count)
        VALUES (${name}, ${stats.total}, ${estimatedWinRate}, 0)
      `;
      trainerCount++;
    }

    // Insert jockey stats
    let jockeyCount = 0;
    for (const [name, stats] of jockeyStats.entries()) {
      const estimatedWinRate = stats.total > 0 ? Math.round((stats.wins / stats.total) / 100) : 0;
      await sql`
        INSERT INTO jockey_stats (jockey_name, total_runners, win_count, place_count)
        VALUES (${name}, ${stats.total}, ${estimatedWinRate}, 0)
      `;
      jockeyCount++;
    }

    console.log(`✓ Aggregated ${trainerCount} trainers`);
    console.log(`✓ Aggregated ${jockeyCount} jockeys\n`);

    // Show top performers
    const topTrainers = await sql`
      SELECT trainer_name, total_runners, win_count, place_count,
        ROUND(100.0 * win_count / total_runners, 1) as win_rate
      FROM trainer_stats
      WHERE total_runners >= 1
      ORDER BY win_rate DESC
      LIMIT 5
    `;

    console.log('Top 5 Trainers by Win Rate:');
    for (const t of topTrainers) {
      const winRate = ((t.win_count / t.total_runners) * 100).toFixed(1);
      console.log(`  ${t.trainer_name.padEnd(30)} ${winRate}% (${t.total_runners} runners)`);
    }

    const topJockeys = await sql`
      SELECT jockey_name, total_runners, win_count, place_count,
        ROUND(100.0 * win_count / total_runners, 1) as win_rate
      FROM jockey_stats
      WHERE total_runners >= 1
      ORDER BY win_rate DESC
      LIMIT 5
    `;

    console.log('\nTop 5 Jockeys by Win Rate:');
    for (const j of topJockeys) {
      const winRate = ((j.win_count / j.total_runners) * 100).toFixed(1);
      console.log(`  ${j.jockey_name.padEnd(30)} ${winRate}% (${j.total_runners} runners)`);
    }

    console.log(`\n✓ Statistics ready for bonus scoring!\n`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

aggregateStats();
