#!/usr/bin/env node
/**
 * Daily Strategy V2 Report
 * Track how Strategy V2 is performing vs target metrics
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
  console.log(`📊 DAILY STRATEGY V2 REPORT - ${today}`);
  console.log('='.repeat(80) + '\n');

  try {
    // Get today's bets
    const todayBets = await sql`
      SELECT
        id, track, race_num, horse, jockey, trainer, odds, stake, confidence, result,
        CASE
          WHEN result = 'WIN' THEN stake * (odds - 1)
          WHEN result = 'PLACE' THEN stake * ((odds - 1) * 0.25)
          WHEN result = 'LOSS' THEN -stake
          ELSE 0
        END as pnl
      FROM bets
      WHERE created_at >= ${today}::date AND created_at < (${today}::date + '1 day'::interval)
        AND result IS NOT NULL
        AND result != 'VOID'
      ORDER BY created_at DESC
    `;

    if (todayBets.length === 0) {
      console.log('⏳ No bets placed yet today\n');
      await sql.end();
      return;
    }

    // Strategy V2 filters
    const MIN_CONFIDENCE = 75;
    const MAX_ODDS = 7.0;
    const ALLOWED_TRACKS = ['Cairns'];
    const BLACKLIST_JOCKEYS = ['Julia Martin', 'Kevin Mahoney'];
    const BLACKLIST_TRAINERS = ['Aidan Holt'];

    const qualified = todayBets.filter(b => {
      const odds = parseFloat(String(b.odds || 0));
      return (
        b.confidence >= MIN_CONFIDENCE &&
        odds <= MAX_ODDS &&
        ALLOWED_TRACKS.includes(b.track) &&
        !BLACKLIST_JOCKEYS.includes(b.jockey) &&
        !BLACKLIST_TRAINERS.includes(b.trainer)
      );
    });

    const filtered = todayBets.filter(b => !qualified.includes(b));

    // Calculate metrics
    const totalStaked = todayBets.reduce((sum, b) => sum + parseFloat(String(b.stake || 0)), 0);
    const totalPnL = todayBets.reduce((sum, b) => sum + parseFloat(String(b.pnl || 0)), 0);
    const roi = totalPnL / totalStaked * 100;

    const qualStaked = qualified.reduce((sum, b) => sum + parseFloat(String(b.stake || 0)), 0);
    const qualPnL = qualified.reduce((sum, b) => sum + parseFloat(String(b.pnl || 0)), 0);
    const qualROI = qualStaked > 0 ? qualPnL / qualStaked * 100 : 0;

    const wins = todayBets.filter(b => b.result === 'WIN').length;
    const places = todayBets.filter(b => b.result === 'PLACE').length;
    const losses = todayBets.filter(b => b.result === 'LOSS').length;

    const qualWins = qualified.filter(b => b.result === 'WIN').length;
    const qualPlaces = qualified.filter(b => b.result === 'PLACE').length;
    const qualWinRate = qualified.length > 0 ? (qualWins / qualified.length) * 100 : 0;

    console.log(`📈 OVERALL PERFORMANCE\n`);
    console.log(`Bets Placed: ${todayBets.length}`);
    console.log(`Staked: $${totalStaked.toFixed(2)}`);
    console.log(`P&L: $${totalPnL.toFixed(2)}`);
    console.log(`ROI: ${roi.toFixed(2)}% ${roi >= 10 ? '✅' : '❌'}`);
    console.log(`Record: ${wins}W-${places}P-${losses}L\n`);

    console.log(`🎯 STRATEGY V2 VALIDATION\n`);
    console.log(`Qualified Bets: ${qualified.length} (${((qualified.length / todayBets.length) * 100).toFixed(1)}%)`);
    console.log(`Filtered Bets: ${filtered.length} (${((filtered.length / todayBets.length) * 100).toFixed(1)}%)`);
    console.log(`\nQualified Performance:`);
    console.log(`  Staked: $${qualStaked.toFixed(2)}`);
    console.log(`  P&L: $${qualPnL.toFixed(2)}`);
    console.log(`  ROI: ${qualROI.toFixed(2)}% ${qualROI >= 10 ? '✅' : '❌'}`);
    console.log(`  Record: ${qualWins}W-${qualPlaces}P-${qualified.filter(b => b.result === 'LOSS').length}L`);
    console.log(`  Win Rate: ${qualWinRate.toFixed(1)}% ${qualWinRate >= 25 ? '✅' : '❌'}\n`);

    console.log(`Filtered Performance (what we avoided):`);
    const filtStaked = filtered.reduce((sum, b) => sum + parseFloat(String(b.stake || 0)), 0);
    const filtPnL = filtered.reduce((sum, b) => sum + parseFloat(String(b.pnl || 0)), 0);
    const filtROI = filtStaked > 0 ? filtPnL / filtStaked * 100 : 0;
    console.log(`  Staked: $${filtStaked.toFixed(2)}`);
    console.log(`  P&L: $${filtPnL.toFixed(2)}`);
    console.log(`  ROI: ${filtROI.toFixed(2)}%\n`);

    // Show what was filtered and why
    console.log(`\n📋 FILTER ANALYSIS\n`);

    let lowConf = 0, highOdds = 0, blacklist = 0;

    for (const bet of filtered) {
      const odds = parseFloat(String(bet.odds || 0));

      if (bet.confidence < MIN_CONFIDENCE) lowConf++;
      else if (odds > MAX_ODDS) highOdds++;
      else if (BLACKLIST_JOCKEYS.includes(bet.jockey) || BLACKLIST_TRAINERS.includes(bet.trainer)) blacklist++;
    }

    console.log(`Low confidence (<75%): ${lowConf}`);
    console.log(`High odds (>7.0): ${highOdds}`);
    console.log(`Blacklist J/T: ${blacklist}\n`);

    // Track-by-track breakdown
    console.log(`\n📊 PERFORMANCE BY TRACK\n`);

    const byTrack = new Map<string, any>();
    for (const bet of todayBets) {
      if (!byTrack.has(bet.track)) {
        byTrack.set(bet.track, { wins: 0, places: 0, losses: 0, pnl: 0, staked: 0, count: 0 });
      }
      const track = byTrack.get(bet.track)!;
      track.count++;
      track.staked += parseFloat(String(bet.stake || 0));
      track.pnl += parseFloat(String(bet.pnl || 0));
      if (bet.result === 'WIN') track.wins++;
      else if (bet.result === 'PLACE') track.places++;
      else track.losses++;
    }

    const trackArray = Array.from(byTrack.entries())
      .map(([name, stats]) => ({ name, ...stats, roi: (stats.pnl / stats.staked * 100) }))
      .sort((a, b) => b.roi - a.roi);

    trackArray.forEach(t => {
      const roi = t.roi;
      console.log(`${t.name}: ${t.count} bets, ${t.wins}W-${t.places}P-${t.losses}L, P&L: $${t.pnl.toFixed(2)}, ROI: ${roi.toFixed(2)}%`);
    });

    // Targets
    console.log(`\n🎯 TARGET PROGRESS\n`);
    console.log(`ROI Target: 10%+ | Actual: ${roi.toFixed(2)}% ${roi >= 10 ? '✅' : '❌'}`);
    console.log(`Win Rate Target: 25%+ | Actual: ${((wins / todayBets.length) * 100).toFixed(1)}% ${(wins / todayBets.length) >= 0.25 ? '✅' : '❌'}`);
    console.log(`Bet Count Target: 2-5 | Actual: ${todayBets.length} ${todayBets.length <= 5 ? '✅' : '⚠️'}\n`);

    // If we had used Strategy V2
    if (qualified.length !== todayBets.length) {
      const improvement = qualROI - roi;
      console.log(`\n💡 WHAT-IF: If we had used Strategy V2 filters ONLY\n`);
      console.log(`  ROI: ${roi.toFixed(2)}% → ${qualROI.toFixed(2)}% (${improvement > 0 ? '+' : ''}${improvement.toFixed(2)}%)`);
      console.log(`  Profit: $${totalPnL.toFixed(2)} → $${qualPnL.toFixed(2)} (${qualPnL - totalPnL > 0 ? '+' : ''}$${(qualPnL - totalPnL).toFixed(2)})`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (err) {
    console.error('[Error]', err);
  } finally {
    await sql.end();
  }
}

run();
