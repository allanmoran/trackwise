#!/usr/bin/env node

/**
 * Model Calibration Check
 *
 * Compares predicted win probability (confidence) to actual win rates
 * for settled bets. Shows if model is well-calibrated or systematically biased.
 *
 * Perfect calibration: 20% confidence bets win 20% of the time
 * Over-optimistic: 20% confidence bets win only 15% (model too bullish)
 * Over-pessimistic: 20% confidence bets win 25% (model too bearish)
 */

import Database from 'better-sqlite3';

const db = new Database('/Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db');

console.log('\n📊 MODEL CALIBRATION CHECK\n');

// Define confidence buckets
const buckets = [
  { min: 20, max: 25, label: '20-25%' },
  { min: 25, max: 30, label: '25-30%' },
  { min: 30, max: 35, label: '30-35%' },
  { min: 35, max: 40, label: '35-40%' },
  { min: 40, max: 50, label: '40-50%' },
  { min: 50, max: 100, label: '50%+' }
];

const calibrationData = [];
let totalBets = 0;
let totalCorrect = 0;

// Analyze each confidence bucket
for (const bucket of buckets) {
  const results = db.prepare(`
    SELECT
      COUNT(*) as total_bets,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      ROUND(100.0 * SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) / COUNT(*), 2) as actual_win_rate,
      ROUND(AVG(confidence), 1) as avg_confidence
    FROM bets
    WHERE status LIKE 'SETTLED%'
      AND confidence >= ?
      AND confidence < ?
  `).get(bucket.min, bucket.max);

  if (!results || results.total_bets === 0) continue;

  const predicted = bucket.min; // Use minimum of bucket as predicted
  const actual = results.actual_win_rate || 0;
  const error = actual - predicted; // Positive = under-optimistic, Negative = over-optimistic
  const errorPct = (error / Math.max(1, predicted)) * 100;

  // Calibration assessment
  let assessment = '✓';
  if (Math.abs(error) > 5) {
    assessment = error > 0 ? '⬇️ ' : '⬆️ '; // Down = pessimistic, Up = optimistic
  }

  calibrationData.push({
    bucket: bucket.label,
    predicted,
    actual,
    error,
    errorPct,
    bets: results.total_bets,
    wins: results.wins,
    assessment
  });

  totalBets += results.total_bets;
  totalCorrect += Math.abs(error) <= 2 ? results.total_bets : 0;

  console.log(`${assessment} ${bucket.label} confidence:`);
  console.log(`   Predicted: ${predicted.toFixed(1)}% | Actual: ${actual.toFixed(1)}% | Error: ${error > 0 ? '+' : ''}${error.toFixed(1)}% | Bets: ${results.total_bets} (${results.wins} wins)`);
}

console.log('\n' + '─'.repeat(80));

// Overall calibration quality
console.log('\nOVERALL CALIBRATION QUALITY\n');

if (totalBets === 0) {
  console.log('⚠️  Not enough settled bets for calibration analysis');
  console.log('Need: 20+ settled bets across multiple confidence levels\n');
  process.exit(0);
}

const calibrationRatio = totalCorrect / totalBets;

let verdict = '';
if (calibrationRatio >= 0.8) {
  verdict = '✅ WELL-CALIBRATED';
  console.log(`✅ Model is well-calibrated (${(calibrationRatio * 100).toFixed(0)}% of predictions within ±2%)`);
} else if (calibrationRatio >= 0.6) {
  verdict = '⚠️ ACCEPTABLE';
  console.log(`⚠️  Model is acceptable but could improve (${(calibrationRatio * 100).toFixed(0)}% of predictions within ±2%)`);
} else {
  verdict = '❌ NEEDS ADJUSTMENT';
  console.log(`❌ Model needs calibration (only ${(calibrationRatio * 100).toFixed(0)}% of predictions within ±2%)`);
}

// Bias analysis
const avgError = calibrationData.reduce((sum, d) => sum + d.error, 0) / calibrationData.length;
console.log(`\nBias Direction: ${Math.abs(avgError) < 1 ? 'Neutral' : avgError > 0 ? 'Under-optimistic (too pessimistic)' : 'Over-optimistic (too bullish)'}`);
console.log(`Average Error: ${avgError > 0 ? '+' : ''}${avgError.toFixed(2)}%\n`);

// Recommendations
console.log('RECOMMENDATIONS\n');

if (calibrationRatio < 0.6) {
  const overOptimistic = calibrationData.filter(d => d.error < -3).length > 0;
  const underOptimistic = calibrationData.filter(d => d.error > 3).length > 0;

  if (overOptimistic) {
    console.log('⚠️  Model is TOO OPTIMISTIC (predicting higher win rates than reality)');
    console.log('   Action: Increase EV_THRESHOLD from 0.10 to 0.12-0.15');
    console.log('   Effect: Filters out marginal bets, focuses on higher-confidence picks\n');
  }

  if (underOptimistic) {
    console.log('⚠️  Model is TOO PESSIMISTIC (predicting lower win rates than reality)');
    console.log('   Action: Decrease EV_THRESHOLD from 0.10 to 0.08');
    console.log('   Effect: Places more bets, captures opportunities\n');
  }

  if (!overOptimistic && !underOptimistic) {
    console.log('⚠️  Model has high variance (predictions swing widely)');
    console.log('   Action: Review feature importance - some signals may be unreliable');
    console.log('   Check: Place rate, barrier analysis, distance preferences\n');
  }
} else if (calibrationRatio >= 0.8) {
  console.log('✅ Model is well-calibrated - no adjustments needed');
  console.log('   Continue using current EV threshold (0.10)\n');
} else {
  console.log('⚠️  Model is acceptable but watch for drift');
  console.log('   Monitor daily calibration as you place more bets\n');
}

// Data sufficiency check
console.log('DATA QUALITY\n');
console.log(`Total settled bets analyzed: ${totalBets}`);
console.log(`Confidence buckets tested: ${calibrationData.length}/${buckets.length}`);

if (totalBets < 30) {
  console.log(`⚠️  Sample size (${totalBets}) is small - results may be unstable`);
  console.log('   Recommendation: Analyze again after 50+ settled bets\n');
} else if (totalBets < 100) {
  console.log(`📊 Sample size (${totalBets}) is moderate - results reliable but not final`);
  console.log('   Recommendation: Increase to 100+ bets for full confidence\n');
} else {
  console.log(`✅ Sample size (${totalBets}) is robust - results are reliable\n`);
}

// Historical comparison (if Phase 1 complete)
const phase1Metrics = db.prepare(`
  SELECT
    COUNT(*) as phase1_bets,
    ROUND(100.0 * SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) / COUNT(*), 2) as phase1_win_rate,
    ROUND(AVG(confidence), 1) as phase1_avg_confidence
  FROM bets
  WHERE placed_at < '2026-04-25' AND status LIKE 'SETTLED%'
`).get();

if (phase1Metrics && phase1Metrics.phase1_bets > 0) {
  const phase2Metrics = db.prepare(`
    SELECT
      COUNT(*) as phase2_bets,
      ROUND(100.0 * SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) / COUNT(*), 2) as phase2_win_rate,
      ROUND(AVG(confidence), 1) as phase2_avg_confidence
    FROM bets
    WHERE placed_at >= '2026-04-25' AND status LIKE 'SETTLED%'
  `).get();

  if (phase2Metrics && phase2Metrics.phase2_bets > 0) {
    console.log('PHASE COMPARISON\n');
    console.log(`Phase 1 (Apr 24):    ${phase1Metrics.phase1_win_rate}% win rate, ${phase1Metrics.phase1_avg_confidence}% avg confidence (${phase1Metrics.phase1_bets} bets)`);
    console.log(`Phase 2A (Apr 25+):  ${phase2Metrics.phase2_win_rate}% win rate, ${phase2Metrics.phase2_avg_confidence}% avg confidence (${phase2Metrics.phase2_bets} bets)\n`);

    if (phase2Metrics.phase2_win_rate > phase1Metrics.phase1_win_rate + 2) {
      console.log('📈 Improvement: Phase 2A is performing better than Phase 1\n');
    } else if (phase2Metrics.phase2_win_rate < phase1Metrics.phase1_win_rate - 2) {
      console.log('📉 Decline: Phase 2A performing worse - investigate root cause\n');
    }
  }
}

console.log('═'.repeat(80) + '\n');

// Export for logging
const report = {
  timestamp: new Date().toISOString(),
  verdict,
  calibrationRatio: parseFloat((calibrationRatio * 100).toFixed(1)),
  averageError: parseFloat(avgError.toFixed(2)),
  totalBets,
  buckets: calibrationData,
  recommendation: avgError < -3 ? 'increase_ev_threshold' : avgError > 3 ? 'decrease_ev_threshold' : 'no_change'
};

console.log(`Verdict: ${verdict}`);
console.log(`Calibration Score: ${(calibrationRatio * 100).toFixed(0)}%`);
console.log(`Recommendation: ${report.recommendation}\n`);
