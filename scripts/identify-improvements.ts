#!/usr/bin/env node
/**
 * Identify Strategy V2 Improvements
 * Analyze performance patterns to optimize filters
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function run() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 STRATEGY V2 IMPROVEMENT ANALYZER');
  console.log('='.repeat(80) + '\n');

  try {
    // Get last 10 racing days
    const allBets = await sql`
      SELECT
        id, track, race_num, horse, jockey, trainer, odds, stake, confidence, result,
        CASE
          WHEN result = 'WIN' THEN stake * (odds - 1)
          WHEN result = 'PLACE' THEN stake * ((odds - 1) * 0.25)
          WHEN result = 'LOSS' THEN -stake
          ELSE 0
        END as pnl
      FROM bets
      WHERE result IS NOT NULL
        AND result != 'VOID'
      ORDER BY created_at DESC
      LIMIT 500
    `;

    console.log(`📊 Analyzing ${allBets.length} completed bets\n`);

    // 1. Analyze jockey performance
    console.log(`🏇 JOCKEY PERFORMANCE\n`);

    const jockeyData = new Map<string, any>();
    for (const bet of allBets) {
      if (!jockeyData.has(bet.jockey)) {
        jockeyData.set(bet.jockey, { wins: 0, places: 0, losses: 0, pnl: 0, count: 0 });
      }
      const data = jockeyData.get(bet.jockey)!;
      data.count++;
      data.pnl += parseFloat(String(bet.pnl || 0));
      if (bet.result === 'WIN') data.wins++;
      else if (bet.result === 'PLACE') data.places++;
      else data.losses++;
    }

    // Find worst performers (candidates for blacklist)
    const jockeys = Array.from(jockeyData.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        winRate: (data.wins / data.count) * 100,
        pnl: data.pnl,
        avgPnL: data.pnl / data.count,
      }))
      .filter(j => j.count >= 3)
      .sort((a, b) => a.avgPnL - b.avgPnL);

    console.log(`⚠️  Worst performing jockeys (potential blacklist):\n`);
    jockeys.slice(0, 5).forEach(j => {
      console.log(`  ${j.name}: ${j.count} bets, ${j.winRate.toFixed(1)}% WR, Avg P&L: $${j.avgPnL.toFixed(2)}`);
    });

    console.log(`\n✅ Best performing jockeys:\n`);
    jockeys.slice(-5).reverse().forEach(j => {
      console.log(`  ${j.name}: ${j.count} bets, ${j.winRate.toFixed(1)}% WR, Avg P&L: $${j.avgPnL.toFixed(2)}`);
    });

    // 2. Analyze trainer performance
    console.log(`\n🏋️  TRAINER PERFORMANCE\n`);

    const trainerData = new Map<string, any>();
    for (const bet of allBets) {
      if (!trainerData.has(bet.trainer)) {
        trainerData.set(bet.trainer, { wins: 0, places: 0, losses: 0, pnl: 0, count: 0 });
      }
      const data = trainerData.get(bet.trainer)!;
      data.count++;
      data.pnl += parseFloat(String(bet.pnl || 0));
      if (bet.result === 'WIN') data.wins++;
      else if (bet.result === 'PLACE') data.places++;
      else data.losses++;
    }

    const trainers = Array.from(trainerData.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        winRate: (data.wins / data.count) * 100,
        pnl: data.pnl,
        avgPnL: data.pnl / data.count,
      }))
      .filter(t => t.count >= 3)
      .sort((a, b) => a.avgPnL - b.avgPnL);

    console.log(`⚠️  Worst performing trainers (potential blacklist):\n`);
    trainers.slice(0, 5).forEach(t => {
      console.log(`  ${t.name}: ${t.count} bets, ${t.winRate.toFixed(1)}% WR, Avg P&L: $${t.avgPnL.toFixed(2)}`);
    });

    // 3. Analyze odds effectiveness
    console.log(`\n\n💰 ODDS EFFECTIVENESS\n`);

    const odds_brackets = new Map<string, any>();
    for (const bet of allBets) {
      const odds = parseFloat(String(bet.odds || 0));
      let bracket = '';

      if (odds <= 3) bracket = '1.0-3.0';
      else if (odds <= 5) bracket = '3.1-5.0';
      else if (odds <= 7) bracket = '5.1-7.0';
      else if (odds <= 10) bracket = '7.1-10.0';
      else if (odds <= 20) bracket = '10.1-20.0';
      else bracket = '20.0+';

      if (!odds_brackets.has(bracket)) {
        odds_brackets.set(bracket, { wins: 0, places: 0, losses: 0, pnl: 0, count: 0 });
      }
      const data = odds_brackets.get(bracket)!;
      data.count++;
      data.pnl += parseFloat(String(bet.pnl || 0));
      if (bet.result === 'WIN') data.wins++;
      else if (bet.result === 'PLACE') data.places++;
      else data.losses++;
    }

    const odds_sorted = Array.from(odds_brackets.entries())
      .map(([bracket, data]) => ({
        bracket,
        count: data.count,
        winRate: ((data.wins + data.places) / data.count) * 100,
        pnl: data.pnl,
        roi: (data.pnl / (data.count * 40)) * 100, // rough estimate
      }))
      .sort((a, b) => b.winRate - a.winRate);

    console.log('Odds bracket performance:\n');
    odds_sorted.forEach(o => {
      console.log(`  ${o.bracket}: ${o.count} bets, ${o.winRate.toFixed(1)}% placement, P&L: $${o.pnl.toFixed(2)}`);
    });

    // 4. Confidence bracket analysis
    console.log(`\n\n📈 CONFIDENCE THRESHOLD EFFECTIVENESS\n`);

    const confidence_brackets = new Map<string, any>();
    for (const bet of allBets) {
      const bracket = Math.floor(bet.confidence / 5) * 5 + '-' + (Math.floor(bet.confidence / 5) * 5 + 5);
      if (!confidence_brackets.has(bracket)) {
        confidence_brackets.set(bracket, { wins: 0, places: 0, losses: 0, pnl: 0, count: 0 });
      }
      const data = confidence_brackets.get(bracket)!;
      data.count++;
      data.pnl += parseFloat(String(bet.pnl || 0));
      if (bet.result === 'WIN') data.wins++;
      else if (bet.result === 'PLACE') data.places++;
      else data.losses++;
    }

    const conf_sorted = Array.from(confidence_brackets.entries())
      .map(([bracket, data]) => ({
        bracket,
        count: data.count,
        winRate: ((data.wins + data.places) / data.count) * 100,
        pnl: data.pnl,
      }))
      .sort((a, b) => parseInt(b.bracket) - parseInt(a.bracket));

    console.log('Confidence bracket performance:\n');
    conf_sorted.forEach(c => {
      console.log(`  ${c.bracket}%: ${c.count} bets, ${c.winRate.toFixed(1)}% placement, P&L: $${c.pnl.toFixed(2)}`);
    });

    // Recommendations
    console.log(`\n\n💡 RECOMMENDATIONS\n`);

    const worstJockey = jockeys[0];
    const worstTrainer = trainers[0];
    const bestOddsBracket = odds_sorted[0];

    if (worstJockey && worstJockey.count >= 3 && worstJockey.avgPnL < -30) {
      console.log(`1. ADD TO JOCKEY BLACKLIST: ${worstJockey.name} (${worstJockey.avgPnL.toFixed(2)}/bet)`);
    }

    if (worstTrainer && worstTrainer.count >= 3 && worstTrainer.avgPnL < -30) {
      console.log(`2. ADD TO TRAINER BLACKLIST: ${worstTrainer.name} (${worstTrainer.avgPnL.toFixed(2)}/bet)`);
    }

    if (bestOddsBracket) {
      console.log(`3. ODDS PERFORM BEST: ${bestOddsBracket.bracket} (${bestOddsBracket.winRate.toFixed(1)}% placement)`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (err) {
    console.error('[Error]', err);
  } finally {
    await sql.end();
  }
}

run();
