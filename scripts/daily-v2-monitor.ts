#!/usr/bin/env node
/**
 * Daily Strategy V2 Monitor
 * Track how Strategy V2 is performing vs targets
 * Identifies improvement opportunities
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function run() {
  const today = new Date().toISOString().split('T')[0];

  console.log('\n' + '='.repeat(80));
  console.log(`📊 STRATEGY V2 DAILY MONITOR - ${today}`);
  console.log('='.repeat(80) + '\n');

  try {
    // Get yesterday's completed bets
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const completedBets = await sql`
      SELECT
        id, track, race_num, horse, jockey, trainer, odds, stake, confidence, result,
        CASE
          WHEN result = 'WIN' THEN stake * (odds - 1)
          WHEN result = 'PLACE' THEN stake * ((odds - 1) * 0.25)
          WHEN result = 'LOSS' THEN -stake
          ELSE 0
        END as pnl
      FROM bets
      WHERE DATE(created_at) = ${yesterday}::date
        AND result IS NOT NULL
        AND result != 'VOID'
      ORDER BY created_at DESC
    `;

    if (completedBets.length === 0) {
      console.log('⏳ No completed bets from yesterday\n');
      await sql.end();
      return;
    }

    console.log(`📈 YESTERDAY'S RESULTS (${yesterday})\n`);
    console.log(`Total bets placed: ${completedBets.length}`);

    // Calculate baseline (all bets)
    const totalStaked = completedBets.reduce((sum, b) => sum + parseFloat(String(b.stake || 0)), 0);
    const totalPnL = completedBets.reduce((sum, b) => sum + parseFloat(String(b.pnl || 0)), 0);
    const roi = totalPnL / totalStaked * 100;
    const wins = completedBets.filter(b => b.result === 'WIN').length;
    const places = completedBets.filter(b => b.result === 'PLACE').length;
    const losses = completedBets.filter(b => b.result === 'LOSS').length;

    console.log(`Staked: $${totalStaked.toFixed(2)}`);
    console.log(`P&L: $${totalPnL.toFixed(2)}`);
    console.log(`ROI: ${roi.toFixed(2)}% ${roi >= 10 ? '✅' : '❌'}`);
    console.log(`Record: ${wins}W-${places}P-${losses}L`);
    console.log(`Win Rate: ${((wins / completedBets.length) * 100).toFixed(1)}%\n`);

    // Apply Strategy V2 filters
    console.log(`🎯 STRATEGY V2 FILTER ANALYSIS\n`);

    const MIN_CONFIDENCE = 75;
    const MAX_ODDS = 7.0;
    const BLACKLIST_JOCKEYS = ['Julia Martin', 'Kevin Mahoney'];
    const BLACKLIST_TRAINERS = ['Aidan Holt'];

    const qualified = completedBets.filter(b => {
      const odds = parseFloat(String(b.odds || 0));
      return (
        b.confidence >= MIN_CONFIDENCE &&
        odds <= MAX_ODDS &&
        !BLACKLIST_JOCKEYS.includes(b.jockey) &&
        !BLACKLIST_TRAINERS.includes(b.trainer)
      );
    });

    const filtered = completedBets.filter(b => !qualified.includes(b));

    console.log(`Qualified bets: ${qualified.length} (${((qualified.length / completedBets.length) * 100).toFixed(1)}%)`);
    console.log(`Filtered out: ${filtered.length} (${((filtered.length / completedBets.length) * 100).toFixed(1)}%)\n`);

    if (qualified.length > 0) {
      const qualStaked = qualified.reduce((sum, b) => sum + parseFloat(String(b.stake || 0)), 0);
      const qualPnL = qualified.reduce((sum, b) => sum + parseFloat(String(b.pnl || 0)), 0);
      const qualROI = qualStaked > 0 ? qualPnL / qualStaked * 100 : 0;
      const qualWins = qualified.filter(b => b.result === 'WIN').length;
      const qualPlaces = qualified.filter(b => b.result === 'PLACE').length;
      const qualWinRate = (qualWins + qualPlaces) / qualified.length * 100;

      console.log(`Qualified Performance:`);
      console.log(`  Staked: $${qualStaked.toFixed(2)}`);
      console.log(`  P&L: $${qualPnL.toFixed(2)}`);
      console.log(`  ROI: ${qualROI.toFixed(2)}% ${qualROI >= 10 ? '✅' : '❌'}`);
      console.log(`  Record: ${qualWins}W-${qualPlaces}P-${qualified.filter(b => b.result === 'LOSS').length}L`);
      console.log(`  Placement Rate: ${qualWinRate.toFixed(1)}% ${qualWinRate >= 30 ? '✅' : '⚠️'}\n`);

      const improvement = qualROI - roi;
      console.log(`💡 Impact: Strategy V2 would have improved ROI by ${improvement > 0 ? '+' : ''}${improvement.toFixed(2)}%\n`);
    }

    // Filter breakdown
    console.log(`📋 WHAT WAS FILTERED?\n`);

    let lowConf = 0, highOdds = 0, blacklist = 0;

    for (const bet of filtered) {
      const odds = parseFloat(String(bet.odds || 0));

      if (bet.confidence < MIN_CONFIDENCE) lowConf++;
      else if (odds > MAX_ODDS) highOdds++;
      else if (BLACKLIST_JOCKEYS.includes(bet.jockey) || BLACKLIST_TRAINERS.includes(bet.trainer)) blacklist++;
    }

    console.log(`Low confidence (<75%): ${lowConf}`);
    console.log(`High odds (>7.0): ${highOdds}`);
    console.log(`Blacklist jockey/trainer: ${blacklist}\n`);

    // Show filter effectiveness
    if (filtered.length > 0) {
      const filtStaked = filtered.reduce((sum, b) => sum + parseFloat(String(b.stake || 0)), 0);
      const filtPnL = filtered.reduce((sum, b) => sum + parseFloat(String(b.pnl || 0)), 0);
      const filtWins = filtered.filter(b => b.result === 'WIN').length;

      console.log(`Filtered Performance (what we avoided):`);
      console.log(`  Staked: $${filtStaked.toFixed(2)}`);
      console.log(`  P&L: $${filtPnL.toFixed(2)}`);
      console.log(`  Wins: ${filtWins}`);
      console.log(`  → Average loss per filtered bet: $${(filtPnL / filtered.length).toFixed(2)}\n`);
    }

    // Track by confidence bracket
    console.log(`📊 PERFORMANCE BY CONFIDENCE\n`);

    const confBrackets = new Map<string, any>();
    for (const bet of completedBets) {
      const bracket = Math.floor(bet.confidence / 10) * 10 + '-' + (Math.floor(bet.confidence / 10) * 10 + 10);
      if (!confBrackets.has(bracket)) {
        confBrackets.set(bracket, { wins: 0, places: 0, losses: 0, pnl: 0, count: 0 });
      }
      const data = confBrackets.get(bracket)!;
      data.count++;
      data.pnl += parseFloat(String(bet.pnl || 0));
      if (bet.result === 'WIN') data.wins++;
      else if (bet.result === 'PLACE') data.places++;
      else data.losses++;
    }

    Array.from(confBrackets.entries())
      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
      .forEach(([bracket, data]) => {
        const winRate = ((data.wins + data.places) / data.count * 100).toFixed(1);
        console.log(`${bracket}%: ${data.count} bets, ${winRate}% placement, P&L: $${data.pnl.toFixed(2)}`);
      });

    console.log(`\n🎯 TARGETS vs ACTUAL\n`);
    console.log(`ROI Target: 10%+        | Actual: ${roi.toFixed(2)}% ${roi >= 10 ? '✅' : '❌'}`);
    console.log(`Win Rate Target: 25%+   | Actual: ${((wins / completedBets.length) * 100).toFixed(1)}% ${(wins / completedBets.length) >= 0.25 ? '✅' : '❌'}`);
    console.log(`Placement Target: 35%+  | Actual: ${(((wins + places) / completedBets.length) * 100).toFixed(1)}% ${((wins + places) / completedBets.length) >= 0.35 ? '✅' : '❌'}\n`);

    console.log('='.repeat(80) + '\n');

  } catch (err) {
    console.error('[Error]', err);
  } finally {
    await sql.end();
  }
}

run();
