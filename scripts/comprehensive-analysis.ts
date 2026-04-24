#!/usr/bin/env node
/**
 * Comprehensive Bet Analysis Report
 * Analyze today's bets to identify strategy gaps and ROI killers
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

interface Bet {
  id: string;
  track: string;
  raceNum: number;
  horse: string;
  jockey: string;
  trainer: string;
  odds: number;
  stake: number;
  confidence: number;
  result: string | null;
  pnl: number;
}

async function run() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE BET ANALYSIS REPORT');
  console.log('='.repeat(80) + '\n');

  try {
    // Get today's bets (exclude VOID from Kyneton)
    const today = new Date().toISOString().split('T')[0];
    const bets = await sql<Bet[]>`
      SELECT
        id, track, race_num as "raceNum", horse, jockey, trainer,
        odds, stake, confidence, result,
        CASE
          WHEN result = 'WIN' THEN stake * (odds - 1)
          WHEN result = 'PLACE' THEN stake * ((odds - 1) * 0.25)
          WHEN result = 'LOSS' THEN -stake
          ELSE 0
        END as pnl
      FROM bets
      WHERE created_at >= NOW() - INTERVAL '1 day'
        AND result IS NOT NULL
        AND result != 'VOID'
      ORDER BY confidence DESC
    `;

    console.log(`\n📈 PORTFOLIO OVERVIEW\n`);
    console.log(`Total Bets: ${bets.length}`);

    const wins = bets.filter(b => b.result === 'WIN').length;
    const places = bets.filter(b => b.result === 'PLACE').length;
    const losses = bets.filter(b => b.result === 'LOSS').length;
    const totalStaked = bets.reduce((sum, b) => sum + parseFloat(String(b.stake)), 0);
    const totalPnL = bets.reduce((sum, b) => sum + parseFloat(String(b.pnl)), 0);
    const roi = totalPnL / totalStaked * 100;
    const winRate = (wins / bets.length) * 100;
    const placeRate = ((wins + places) / bets.length) * 100;

    console.log(`  Wins: ${wins} (${(wins/bets.length*100).toFixed(1)}%)`);
    console.log(`  Places: ${places} (${(places/bets.length*100).toFixed(1)}%)`);
    console.log(`  Losses: ${losses} (${(losses/bets.length*100).toFixed(1)}%)`);
    console.log(`\n  Total Staked: $${totalStaked.toFixed(2)}`);
    console.log(`  Total P&L: $${totalPnL.toFixed(2)}`);
    console.log(`  ROI: ${roi.toFixed(2)}% ${roi >= 10 ? '✅' : '❌ (Target: 10%+)'}`);
    console.log(`  Win Rate: ${winRate.toFixed(1)}%`);
    console.log(`  Place + Win Rate: ${placeRate.toFixed(1)}%`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`\n\n🎯 CONFIDENCE ANALYSIS\n`);

    // Group by confidence brackets
    const confBrackets = [
      { min: 70, max: 100, label: 'High (70-100%)' },
      { min: 60, max: 69, label: 'Medium (60-69%)' },
      { min: 50, max: 59, label: 'Low (50-59%)' },
    ];

    for (const bracket of confBrackets) {
      const bracketed = bets.filter(b => b.confidence >= bracket.min && b.confidence <= bracket.max);
      if (bracketed.length === 0) continue;

      const bracketWins = bracketed.filter(b => b.result === 'WIN').length;
      const bracketPlaces = bracketed.filter(b => b.result === 'PLACE').length;
      const bracketPnL = bracketed.reduce((sum, b) => sum + parseFloat(String(b.pnl)), 0);
      const bracketStaked = bracketed.reduce((sum, b) => sum + parseFloat(String(b.stake)), 0);
      const bracketROI = bracketPnL / bracketStaked * 100;

      console.log(`${bracket.label}:`);
      console.log(`  Bets: ${bracketed.length} | Wins: ${bracketWins} | Places: ${bracketPlaces}`);
      console.log(`  P&L: $${bracketPnL.toFixed(2)} | ROI: ${bracketROI.toFixed(2)}%`);
      console.log(`  Win Rate: ${(bracketWins/bracketed.length*100).toFixed(1)}%`);
      console.log();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`\n🏇 JOCKEY PERFORMANCE\n`);

    const jockeys = new Map<string, { wins: number; places: number; losses: number; pnl: number; count: number }>();
    for (const bet of bets) {
      if (!jockeys.has(bet.jockey)) {
        jockeys.set(bet.jockey, { wins: 0, places: 0, losses: 0, pnl: 0, count: 0 });
      }
      const j = jockeys.get(bet.jockey)!;
      j.count++;
      j.pnl += parseFloat(String(bet.pnl || 0));
      if (bet.result === 'WIN') j.wins++;
      else if (bet.result === 'PLACE') j.places++;
      else j.losses++;
    }

    const jockeyArray = Array.from(jockeys.entries())
      .map(([name, stats]) => ({ name, ...stats, winRate: stats.wins / stats.count * 100 }))
      .sort((a, b) => b.pnl - a.pnl);

    console.log('Top Performers:');
    jockeyArray.slice(0, 5).forEach(j => {
      console.log(`  ${j.name}: ${j.count} bets, ${j.wins}W-${j.places}P-${j.losses}L, P&L: $${j.pnl.toFixed(2)} (${j.winRate.toFixed(0)}%)`);
    });

    console.log('\nBottom Performers:');
    jockeyArray.slice(-5).reverse().forEach(j => {
      console.log(`  ${j.name}: ${j.count} bets, ${j.wins}W-${j.places}P-${j.losses}L, P&L: $${j.pnl.toFixed(2)} (${j.winRate.toFixed(0)}%)`);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`\n\n👨‍🌾 TRAINER PERFORMANCE\n`);

    const trainers = new Map<string, { wins: number; places: number; losses: number; pnl: number; count: number }>();
    for (const bet of bets) {
      if (!trainers.has(bet.trainer)) {
        trainers.set(bet.trainer, { wins: 0, places: 0, losses: 0, pnl: 0, count: 0 });
      }
      const t = trainers.get(bet.trainer)!;
      t.count++;
      t.pnl += parseFloat(String(bet.pnl || 0));
      if (bet.result === 'WIN') t.wins++;
      else if (bet.result === 'PLACE') t.places++;
      else t.losses++;
    }

    const trainerArray = Array.from(trainers.entries())
      .map(([name, stats]) => ({ name, ...stats, winRate: stats.wins / stats.count * 100 }))
      .sort((a, b) => b.pnl - a.pnl);

    console.log('Top Performers:');
    trainerArray.slice(0, 5).forEach(t => {
      console.log(`  ${t.name}: ${t.count} bets, ${t.wins}W-${t.places}P-${t.losses}L, P&L: $${t.pnl.toFixed(2)} (${t.winRate.toFixed(0)}%)`);
    });

    console.log('\nBottom Performers:');
    trainerArray.slice(-5).reverse().forEach(t => {
      console.log(`  ${t.name}: ${t.count} bets, ${t.wins}W-${t.places}P-${t.losses}L, P&L: $${t.pnl.toFixed(2)} (${t.winRate.toFixed(0)}%)`);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`\n\n🔍 TRACK PERFORMANCE\n`);

    const tracks = new Map<string, { wins: number; places: number; losses: number; pnl: number; count: number }>();
    for (const bet of bets) {
      if (!tracks.has(bet.track)) {
        tracks.set(bet.track, { wins: 0, places: 0, losses: 0, pnl: 0, count: 0 });
      }
      const t = tracks.get(bet.track)!;
      t.count++;
      t.pnl += parseFloat(String(bet.pnl || 0));
      if (bet.result === 'WIN') t.wins++;
      else if (bet.result === 'PLACE') t.places++;
      else t.losses++;
    }

    const trackArray = Array.from(tracks.entries())
      .map(([name, stats]) => ({ name, ...stats, roi: stats.pnl / (stats.count * 37) * 100 })) // assume ~$37 avg stake
      .sort((a, b) => b.pnl - a.pnl);

    trackArray.forEach(t => {
      console.log(`${t.name}: ${t.count} bets, ${t.wins}W-${t.places}P-${t.losses}L, P&L: $${t.pnl.toFixed(2)}`);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`\n\n❌ TOP 10 BIGGEST LOSSES\n`);

    const topLosses = bets
      .filter(b => b.result === 'LOSS')
      .sort((a, b) => a.pnl - b.pnl)
      .slice(0, 10);

    topLosses.forEach((b, i) => {
      console.log(`${i + 1}. ${b.horse} (${b.track} R${b.raceNum}): -$${Math.abs(parseFloat(String(b.pnl))).toFixed(2)} @ ${b.confidence}% conf`);
      console.log(`   Jockey: ${b.jockey} | Trainer: ${b.trainer} | Odds: ${parseFloat(String(b.odds)).toFixed(2)}`);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`\n\n✅ TOP 10 WINS\n`);

    const topWins = bets
      .filter(b => b.result === 'WIN')
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 10);

    topWins.forEach((b, i) => {
      console.log(`${i + 1}. ${b.horse} (${b.track} R${b.raceNum}): +$${parseFloat(String(b.pnl)).toFixed(2)} @ ${b.confidence}% conf`);
      console.log(`   Jockey: ${b.jockey} | Trainer: ${b.trainer} | Odds: ${parseFloat(String(b.odds)).toFixed(2)}`);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`\n\n🔴 PATTERN ANALYSIS\n`);

    // Odds analysis
    const underdog = bets.filter(b => b.odds > 5).length;
    const favorite = bets.filter(b => b.odds <= 3).length;
    const middleOdds = bets.filter(b => b.odds > 3 && b.odds <= 5).length;

    console.log(`Underdog (odds >5): ${underdog} bets, ${(underdog/bets.length*100).toFixed(1)}%`);
    console.log(`Favorite (odds ≤3): ${favorite} bets, ${(favorite/bets.length*100).toFixed(1)}%`);
    console.log(`Middle (3-5): ${middleOdds} bets, ${(middleOdds/bets.length*100).toFixed(1)}%`);

    const underdogWins = bets.filter(b => b.odds > 5 && b.result === 'WIN').length;
    const favWins = bets.filter(b => b.odds <= 3 && b.result === 'WIN').length;
    console.log(`  → Underdog win rate: ${underdog > 0 ? (underdogWins/underdog*100).toFixed(1) : 0}%`);
    console.log(`  → Favorite win rate: ${favorite > 0 ? (favWins/favorite*100).toFixed(1) : 0}%`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`\n\n💡 RECOMMENDATIONS\n`);

    const issues = [];

    if (roi < 0) issues.push(`❌ CRITICAL: Negative ROI (${roi.toFixed(2)}%). Need major strategy overhaul.`);
    else if (roi < 10) issues.push(`⚠️  ROI below target (${roi.toFixed(2)}% vs 10%+). Need adjustments.`);

    if (winRate < 30) issues.push(`❌ Win rate too low (${winRate.toFixed(1)}%). Only ${wins}/${bets.length} wins.`);
    if (placeRate < 40) issues.push(`❌ Place+Win rate critically low (${placeRate.toFixed(1)}%). Need better form filtering.`);

    const highConfWins = bets.filter(b => b.confidence >= 70 && b.result === 'WIN').length;
    const highConfBets = bets.filter(b => b.confidence >= 70).length;
    if (highConfBets > 0 && highConfWins / highConfBets < 0.3) {
      issues.push(`⚠️  High confidence picks underperforming (${(highConfWins/highConfBets*100).toFixed(1)}% win rate). Confidence calc is inaccurate.`);
    }

    const underdogWinRate = underdog > 0 ? underdogWins / underdog : 0;
    const favWinRate = favorite > 0 ? favWins / favorite : 0;
    if (underdogWinRate > favWinRate * 1.5) {
      issues.push(`💡 Underdogs outperforming favorites. Consider betting longer odds.`);
    } else if (favWinRate > underdogWinRate * 1.5) {
      issues.push(`💡 Favorites outperforming underdogs. Focus on shorter odds.`);
    }

    // Check jockey/trainer quality
    const negJockeys = jockeyArray.filter(j => j.pnl < -100 && j.count >= 3);
    if (negJockeys.length > 0) {
      issues.push(`⚠️  ${negJockeys.length} jockeys consistently underperforming. Blacklist them.`);
    }

    const negTrainers = trainerArray.filter(t => t.pnl < -100 && t.count >= 3);
    if (negTrainers.length > 0) {
      issues.push(`⚠️  ${negTrainers.length} trainers consistently underperforming. Blacklist them.`);
    }

    if (issues.length === 0) {
      console.log('✅ No major issues detected. Continue monitoring.');
    } else {
      issues.forEach(issue => console.log(`${issue}`));
    }

    console.log(`\n\n🎯 ACTION ITEMS\n`);
    console.log(`1. Review confidence calculation formula — seems too generous`);
    console.log(`2. Implement jockey/trainer blacklist for underperformers`);
    console.log(`3. Test higher confidence thresholds (>75%) for betting`);
    console.log(`4. Analyze track conditions impact (Good/Soft/Heavy)`);
    console.log(`5. Run backtests on KB with adjusted thresholds`);
    console.log(`6. Check if we're using stale form data`);

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (err) {
    console.error('[Error]', err);
  } finally {
    await sql.end();
  }
}

run();
