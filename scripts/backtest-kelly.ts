#!/usr/bin/env node
/**
 * Backtest Kelly strategy on historical/synthetic KB data
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function backtestKelly() {
  console.log('🎯 Kelly Strategy Backtest on KB\n');

  try {
    // Get jockey and trainer stats
    const jockeyStats = await sql`
      SELECT jockey_name, total_runs, total_wins
      FROM jockey_stats
      WHERE total_runs > 5
      LIMIT 200
    `;

    const trainerStats = await sql`
      SELECT trainer_name, total_runs, total_wins
      FROM trainer_stats
      WHERE total_runs > 5
      LIMIT 200
    `;

    // Get runners and calculate confidence
    const runners = await sql`
      SELECT horse_name, jockey, trainer
      FROM runners
      LIMIT 500
    `;

    console.log(`📊 Testing ${runners.length} runners from KB\n`);

    const results: any[] = [];

    for (let confThreshold = 50; confThreshold <= 80; confThreshold += 5) {
      let bets = 0;
      let wins = 0;
      let places = 0;
      let totalStaked = 0;
      let totalPnL = 0;

      for (const runner of runners) {
        // Base confidence
        let confidence = 50;

        // Add jockey bonus
        const jockey = jockeyStats.find(j => j.jockey_name === runner.jockey);
        if (jockey) {
          const jockeyWR = jockey.total_wins / jockey.total_runs;
          confidence += jockeyWR * 25;
        }

        // Add trainer bonus
        const trainer = trainerStats.find(t => t.trainer_name === runner.trainer);
        if (trainer) {
          const trainerWR = trainer.total_wins / trainer.total_runs;
          confidence += trainerWR * 20;
        }

        confidence = Math.min(confidence, 100);

        // Only bet if meets threshold
        if (confidence >= confThreshold) {
          // Random odds
          const odds = Math.max(1.2, Math.random() * 40);

          // Kelly calculation
          const p = confidence / 100;
          const b = odds - 1;
          const kellyFraction = (b * p - (1 - p)) / b;
          const stake = Math.min(200 * kellyFraction, 50); // Cap at $50/bet

          totalStaked += stake;
          bets++;

          // Simulate result
          const rand = Math.random();
          if (rand < p * 0.8) {
            wins++;
            totalPnL += stake * (odds - 1);
          } else if (rand < p) {
            places++;
            totalPnL += stake * ((odds - 1) * 0.25);
          } else {
            totalPnL -= stake;
          }
        }
      }

      const roi = totalStaked > 0 ? ((totalPnL / totalStaked) * 100) : 0;
      const winRate = bets > 0 ? ((wins / bets) * 100) : 0;

      results.push({
        confidence: confThreshold,
        bets,
        wins,
        places,
        staked: totalStaked.toFixed(2),
        pnl: totalPnL.toFixed(2),
        roi: roi.toFixed(2),
        winRate: winRate.toFixed(2)
      });
    }

    console.log('Confidence | Bets | Wins | Staked  | P&L      | ROI   | Win%');
    console.log('-'.repeat(70));

    for (const r of results) {
      const status = parseFloat(r.roi) >= 10 ? '✅' : parseFloat(r.roi) >= 0 ? '✓' : '❌';
      console.log(`${r.confidence}%        | ${String(r.bets).padEnd(4)} | ${String(r.wins).padEnd(4)} | $${String(r.staked).padEnd(6)} | $${String(r.pnl).padEnd(7)} | ${r.roi.padEnd(5)} | ${r.winRate.padEnd(4)} ${status}`);
    }

    const best = results.reduce((prev, current) =>
      parseFloat(current.roi) > parseFloat(prev.roi) ? current : prev
    );

    console.log('\n' + '='.repeat(70));
    console.log(`\n✅ OPTIMAL STRATEGY: ${best.confidence}% confidence threshold`);
    console.log(`   Bets placed: ${best.bets} | ROI: ${best.roi}% | Win rate: ${best.winRate}%`);
    console.log(`   Total P&L: $${best.pnl} on $${best.staked} staked\n`);

  } finally {
    await sql.end();
  }
}

backtestKelly().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
