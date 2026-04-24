#!/usr/bin/env node
/**
 * Analyze CLV Strategy Results (April 11-12 Phase 1 Testing)
 *
 * Queries settled bets from April 11-12 test period and analyzes:
 * - Win rate vs predicted confidence (calibration gap)
 * - ROI and profit/loss by confidence bins
 * - Closing Line Value (CLV) correlation if available
 * - Performance by track and race
 * - Model accuracy metrics
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

interface BetAnalysis {
  betId: number;
  horse: string;
  track: string;
  raceNum: number;
  predictedConfidence: number;
  actualResult: string;
  stake: number;
  odds: number;
  returnAmount: number;
  profitLoss: number;
  clvPercent?: number;
}

interface ConfidenceBin {
  minConfidence: number;
  maxConfidence: number;
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  totalStake: number;
  totalProfitLoss: number;
  roi: number;
  avgConfidence: number;
}

function analyzeCLVStrategy() {
  console.log('📊 Analyzing Phase 1 CLV Strategy (April 11-12)...\n');

  // Query all settled bets from April 11-12
  const bets = db
    .prepare(
      `
    SELECT
      b.id as betId,
      h.name as horse,
      r.track,
      r.race_number as raceNum,
      b.confidence as predictedConfidence,
      b.result as actualResult,
      b.stake,
      b.opening_odds as odds,
      b.return_amount as returnAmount,
      b.profit_loss as profitLoss,
      b.clv_percent as clvPercent,
      r.date
    FROM bets b
    LEFT JOIN horses h ON b.horse_id = h.id
    LEFT JOIN races r ON b.race_id = r.id
    WHERE r.date IN ('2026-04-11', '2026-04-12')
      AND b.status = 'SETTLED'
    ORDER BY r.date, r.race_number, b.placed_at
  `
    )
    .all() as any[];

  if (bets.length === 0) {
    console.log('❌ No settled bets found for April 11-12');
    return;
  }

  console.log(`✅ Found ${bets.length} settled bets from April 11-12\n`);

  // Summary Statistics
  const totalStake = bets.reduce((sum, b) => sum + b.stake, 0);
  const totalProfit = bets.reduce((sum, b) => sum + (b.profitLoss || 0), 0);
  const winCount = bets.filter((b) => b.actualResult === 'WIN').length;
  const lossCount = bets.filter((b) => b.actualResult === 'LOSS').length;
  const placeCount = bets.filter((b) => b.actualResult === 'PLACE').length;
  const winRate = (winCount / bets.length) * 100;
  const roi = (totalProfit / totalStake) * 100;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 OVERALL PERFORMANCE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Bets:        ${bets.length}`);
  console.log(`Wins:              ${winCount} (${winRate.toFixed(1)}%)`);
  console.log(`Losses:            ${lossCount} (${((lossCount / bets.length) * 100).toFixed(1)}%)`);
  console.log(`Places:            ${placeCount} (${((placeCount / bets.length) * 100).toFixed(1)}%)`);
  console.log(`Total Stake:       $${totalStake.toFixed(2)}`);
  console.log(`Total Profit/Loss: $${totalProfit.toFixed(2)}`);
  console.log(`ROI:               ${roi.toFixed(1)}%`);
  console.log();

  // Confidence Calibration Analysis
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 CONFIDENCE CALIBRATION (Expected vs Actual Win Rate)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const bins: ConfidenceBin[] = [
    { minConfidence: 20, maxConfidence: 30, totalBets: 0, wins: 0, losses: 0, winRate: 0, totalStake: 0, totalProfitLoss: 0, roi: 0, avgConfidence: 0 },
    { minConfidence: 31, maxConfidence: 40, totalBets: 0, wins: 0, losses: 0, winRate: 0, totalStake: 0, totalProfitLoss: 0, roi: 0, avgConfidence: 0 },
    { minConfidence: 41, maxConfidence: 50, totalBets: 0, wins: 0, losses: 0, winRate: 0, totalStake: 0, totalProfitLoss: 0, roi: 0, avgConfidence: 0 },
    { minConfidence: 51, maxConfidence: 60, totalBets: 0, wins: 0, losses: 0, winRate: 0, totalStake: 0, totalProfitLoss: 0, roi: 0, avgConfidence: 0 },
    { minConfidence: 61, maxConfidence: 100, totalBets: 0, wins: 0, losses: 0, winRate: 0, totalStake: 0, totalProfitLoss: 0, roi: 0, avgConfidence: 0 },
  ];

  for (const bet of bets) {
    const bin = bins.find((b) => bet.predictedConfidence >= b.minConfidence && bet.predictedConfidence <= b.maxConfidence);
    if (bin) {
      bin.totalBets++;
      bin.totalStake += bet.stake;
      bin.totalProfitLoss += bet.profitLoss || 0;
      if (bet.actualResult === 'WIN') {
        bin.wins++;
      } else if (bet.actualResult === 'LOSS') {
        bin.losses++;
      }
    }
  }

  // Calculate metrics for each bin
  for (const bin of bins) {
    if (bin.totalBets > 0) {
      bin.winRate = (bin.wins / bin.totalBets) * 100;
      bin.roi = (bin.totalProfitLoss / bin.totalStake) * 100;
      bin.avgConfidence = Math.round(
        bets
          .filter((b) => b.predictedConfidence >= bin.minConfidence && b.predictedConfidence <= bin.maxConfidence)
          .reduce((sum, b) => sum + b.predictedConfidence, 0) / bin.totalBets
      );
    }
  }

  console.log('Confidence | Bets | Wins | Expected | Actual | Delta  | Stake    | P&L      | ROI');
  console.log('Range      |      |      | Win Rate | Win %  | (gap)  |          |          |');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const bin of bins.filter((b) => b.totalBets > 0)) {
    const expectedWinRate = bin.avgConfidence;
    const delta = bin.winRate - expectedWinRate;
    console.log(
      `${bin.minConfidence}-${bin.maxConfidence}%   | ${String(bin.totalBets).padStart(4)} | ${String(bin.wins).padStart(4)} | ${String(expectedWinRate.toFixed(1)).padStart(7)}% | ${String(bin.winRate.toFixed(1)).padStart(6)}% | ${String(delta.toFixed(1)).padStart(6)} | $${String(bin.totalStake.toFixed(0)).padStart(7)} | $${String(bin.totalProfitLoss.toFixed(0)).padStart(7)} | ${String(bin.roi.toFixed(1)).padStart(6)}%`
    );
  }
  console.log();

  // Calibration Error Analysis
  const calibrationErrors = bins
    .filter((b) => b.totalBets > 0)
    .map((b) => Math.abs(b.winRate - b.avgConfidence));
  const avgCalibrationError = calibrationErrors.length > 0 ? calibrationErrors.reduce((a, b) => a + b) / calibrationErrors.length : 0;

  console.log(`📍 Average Calibration Error: ${avgCalibrationError.toFixed(1)}%`);
  console.log(`   (Difference between predicted and actual win rate)`);
  console.log();

  // CLV Analysis (if available)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💰 CLOSING LINE VALUE (CLV) ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const betsWithCLV = bets.filter((b) => b.clvPercent !== null && b.clvPercent !== undefined);
  if (betsWithCLV.length > 0) {
    const avgCLV = betsWithCLV.reduce((sum, b) => sum + b.clvPercent, 0) / betsWithCLV.length;
    const positiveClv = betsWithCLV.filter((b) => b.clvPercent > 0).length;
    console.log(`✅ CLV data available for ${betsWithCLV.length} bets`);
    console.log(`   Average CLV: ${avgCLV.toFixed(1)}%`);
    console.log(`   Positive CLV: ${positiveClv} bets (${((positiveClv / betsWithCLV.length) * 100).toFixed(1)}%)`);
  } else {
    console.log('❌ No CLV data captured (closing_odds not recorded during bet placement)');
    console.log('   Action: Next phase must capture closing odds for CLV validation');
  }
  console.log();

  // Top/Bottom Performers
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 TRACK PERFORMANCE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const trackStats = new Map<
    string,
    {
      track: string;
      bets: number;
      wins: number;
      totalStake: number;
      totalProfit: number;
    }
  >();

  for (const bet of bets) {
    if (!trackStats.has(bet.track)) {
      trackStats.set(bet.track, { track: bet.track, bets: 0, wins: 0, totalStake: 0, totalProfit: 0 });
    }
    const stats = trackStats.get(bet.track)!;
    stats.bets++;
    stats.totalStake += bet.stake;
    stats.totalProfit += bet.profitLoss || 0;
    if (bet.actualResult === 'WIN') {
      stats.wins++;
    }
  }

  const sortedTracks = Array.from(trackStats.values())
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, 10);

  console.log('Track                | Bets | Wins | Win % | Stake    | P&L      | ROI');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const track of sortedTracks) {
    const winRate = ((track.wins / track.bets) * 100).toFixed(1);
    const roi = ((track.totalProfit / track.totalStake) * 100).toFixed(1);
    console.log(
      `${track.track.padEnd(20)} | ${String(track.bets).padStart(4)} | ${String(track.wins).padStart(4)} | ${String(winRate).padStart(5)} | $${String(track.totalStake.toFixed(0)).padStart(7)} | $${String(track.totalProfit.toFixed(0)).padStart(7)} | ${String(roi).padStart(6)}%`
    );
  }
  console.log();

  // Verdict
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 VERDICT & RECOMMENDATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (winRate === 0) {
    console.log('❌ CRITICAL: 0% win rate indicates model has zero edge');
    console.log('   Phase 1 (form-based confidence) completely failed validation');
    console.log();
    console.log('   Root Cause: Strike rate is not predictive');
    console.log('   - Used horse strike rate (30%) as primary confidence driver');
    console.log('   - Strike rates are historical averages, not forward-looking');
    console.log('   - No correlation to actual race outcomes');
    console.log();
    console.log('   Phase 2 Action Required:');
    console.log('   ✓ Rebuild confidence model with jockey/trainer focus (70% weight)');
    console.log('   ✓ Add form recency weighting (last 5 races, not all-time)');
    console.log('   ✓ Capture CLV data for market validation');
    console.log('   ✓ Test on April 18-20 races with new model');
  } else if (winRate > 40) {
    console.log('✅ STRONG: Model shows positive edge, calibration acceptable');
    console.log('   Proceed to scale up stake sizing and live deployment');
  } else if (winRate > 25) {
    console.log('⚠️  WEAK: Model has small positive edge but calibration gap detected');
    console.log('   Confidence predictions are overestimated');
    console.log('   Action: Reduce predicted confidence by calibration error and retest');
  } else {
    console.log('❌ NEGATIVE: Model underwater, needs rework');
    console.log('   Action: Pivot to Phase 2 hybrid model immediately');
  }

  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Export CSV
  exportToCSV(bets);
}

function exportToCSV(bets: any[]) {
  const csvPath = path.join(process.cwd(), 'scripts/analysis_april_11_12.csv');

  const header = [
    'Bet ID',
    'Horse',
    'Track',
    'Race #',
    'Predicted Confidence (%)',
    'Actual Result',
    'Stake ($)',
    'Odds',
    'Profit/Loss ($)',
    'ROI (%)',
    'CLV (%)',
  ].join(',');

  const rows = bets.map((b) => {
    const roi = b.stake > 0 ? ((b.profitLoss / b.stake) * 100).toFixed(1) : '0.0';
    return [
      b.betId,
      b.horse || 'Unknown',
      b.track || 'Unknown',
      b.raceNum || '?',
      b.predictedConfidence || '0',
      b.actualResult || 'UNKNOWN',
      b.stake.toFixed(2),
      b.odds ? b.odds.toFixed(2) : '0.00',
      (b.profitLoss || 0).toFixed(2),
      roi,
      b.clvPercent || '',
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');
  fs.writeFileSync(csvPath, csv);
  console.log(`📥 CSV exported: ${csvPath}`);
}

analyzeCLVStrategy();
