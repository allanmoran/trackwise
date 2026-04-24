#!/usr/bin/env node

/**
 * Phase 2A Go/No-Go Decision Analysis
 *
 * Evaluates whether Phase 2A validation metrics meet production approval criteria.
 * Run after settlement on Apr 26 or Apr 27 to make deployment decision.
 */

import Database from 'better-sqlite3';

const db = new Database('/Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        PHASE 2A GO/NO-GO DECISION ANALYSIS                 ║');
console.log('║        Apr 24-27 Aggressive Validation Results            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Success criteria (from roadmap)
const CRITERIA = {
  minBetsPlaced: 40,          // 40-60 target (original 9-15)
  minROI: -0.10,              // -10% or better (accept small loss at bigger sample)
  minWinRate: 0.04,           // 4% or better (at least 2-3 wins)
  maxFailures: 0,             // Zero failed placements
  maxSettlementFailures: 0,   // Zero settlement failures
  maxDataIssues: 0            // Zero corruption
};

// Get all Phase 2A bets (placed after Apr 24, 00:00)
const phase2aBets = db.prepare(`
  SELECT
    b.id, b.race_id, b.horse_id, b.status, b.stake,
    b.opening_odds, b.closing_odds, b.profit_loss, b.result,
    b.placed_at, b.settled_at, b.confidence, b.ev_percent,
    r.track, r.race_number, r.date
  FROM bets b
  LEFT JOIN races r ON b.race_id = r.id
  WHERE b.placed_at >= '2026-04-24 00:00:00'
  ORDER BY b.placed_at ASC
`).all();

const settledBets = phase2aBets.filter(b => b.status && b.status.includes('SETTLED'));
const activeBets = phase2aBets.filter(b => b.status === 'ACTIVE');
const failedBets = phase2aBets.filter(b => b.status === 'FAILED');

const totalStake = phase2aBets.reduce((sum, b) => sum + (b.stake || 0), 0);
const totalProfitLoss = settledBets.reduce((sum, b) => sum + (b.profit_loss || 0), 0);
const winCount = settledBets.filter(b => b.result === 'WIN').length;
const placeCount = settledBets.filter(b => b.result === 'PLACE').length;
const lossCount = settledBets.filter(b => b.result === 'LOSS').length;
const scratchCount = settledBets.filter(b => b.result === 'SCRATCH').length;

const roi = totalStake > 0 ? totalProfitLoss / totalStake : 0;
const winRate = settledBets.length > 0 ? winCount / settledBets.length : 0;

console.log('\n📊 PHASE 2A METRICS\n');

// Bets Summary
console.log('BET PLACEMENT:');
console.log(`  Total placed: ${phase2aBets.length} bets`);
console.log(`  Settled: ${settledBets.length}`);
console.log(`  Active: ${activeBets.length}`);
console.log(`  Failed: ${failedBets.length}`);
console.log(`  Total stake: $${totalStake.toFixed(2)}\n`);

// Results Summary
console.log('RESULTS (settled bets):');
console.log(`  Wins: ${winCount}`);
console.log(`  Places: ${placeCount}`);
console.log(`  Losses: ${lossCount}`);
console.log(`  Scratches: ${scratchCount}\n`);

// ROI & Win Rate
console.log('PERFORMANCE:');
console.log(`  ROI: ${(roi * 100).toFixed(2)}% (${totalProfitLoss >= 0 ? '+' : ''}$${totalProfitLoss.toFixed(2)})`);
console.log(`  Win Rate: ${(winRate * 100).toFixed(2)}% (${winCount}/${settledBets.length})`);
console.log(`  Average Stake: $${(totalStake / phase2aBets.length).toFixed(2)}`);

const avgConfidence = phase2aBets.reduce((sum, b) => sum + (b.confidence || 0), 0) / phase2aBets.length;
const avgEV = phase2aBets.reduce((sum, b) => sum + (b.ev_percent || 0), 0) / phase2aBets.length;
console.log(`  Avg Confidence: ${avgConfidence.toFixed(1)}%`);
console.log(`  Avg EV: ${avgEV.toFixed(1)}%\n`);

// Success Criteria Evaluation
console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║           SUCCESS CRITERIA EVALUATION                      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const results = {
  betCount: {
    criteria: `Minimum ${CRITERIA.minBetsPlaced} bets placed`,
    actual: phase2aBets.length,
    pass: phase2aBets.length >= CRITERIA.minBetsPlaced,
    weight: 'HIGH'
  },
  roi: {
    criteria: `ROI ≥ ${(CRITERIA.minROI * 100).toFixed(0)}% (accept small loss at larger sample)`,
    actual: `${(roi * 100).toFixed(2)}%`,
    pass: roi >= CRITERIA.minROI,
    weight: 'HIGH'
  },
  winRate: {
    criteria: `Win rate ≥ ${(CRITERIA.minWinRate * 100).toFixed(0)}%`,
    actual: `${(winRate * 100).toFixed(2)}%`,
    pass: winRate >= CRITERIA.minWinRate,
    weight: 'HIGH'
  },
  failures: {
    criteria: `Zero failed placements`,
    actual: failedBets.length,
    pass: failedBets.length === 0,
    weight: 'CRITICAL'
  },
  settlementIssues: {
    criteria: `All settled or active (no lost records)`,
    actual: `${settledBets.length + activeBets.length}/${phase2aBets.length}`,
    pass: (settledBets.length + activeBets.length) === phase2aBets.length,
    weight: 'CRITICAL'
  }
};

let passCount = 0;
let failCount = 0;

for (const [key, check] of Object.entries(results)) {
  const icon = check.pass ? '✅' : '❌';
  const status = check.pass ? 'PASS' : 'FAIL';
  console.log(`${icon} ${check.criteria}`);
  console.log(`   Actual: ${typeof check.actual === 'number' ? check.actual : check.actual} [${check.weight}]\n`);

  if (check.pass) passCount++;
  else failCount++;
}

// Final Decision
console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║              DEPLOYMENT DECISION                          ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const allPass = failCount === 0;

if (allPass) {
  console.log('🟢 GO FOR PHASE 3 PRODUCTION DEPLOYMENT\n');
  console.log('All success criteria met. System is ready for:');
  console.log('  • Production auto-betting enablement');
  console.log('  • 50-100 bets/day operation');
  console.log('  • Full monitoring and ROI tracking\n');
  console.log('ACTION: Deploy phase2a_prod_deploy.sh immediately');
} else {
  console.log('🔴 NO-GO / EXTEND VALIDATION\n');
  console.log(`${failCount} criterion/criteria failed:\n`);

  for (const [key, check] of Object.entries(results)) {
    if (!check.pass) {
      console.log(`  ❌ ${check.criteria}`);
      console.log(`     Actual: ${check.actual}\n`);
    }
  }

  console.log('REMEDIATION OPTIONS:');
  if (!results.betCount.pass) {
    console.log(`  1. Continue placing bets until ${CRITERIA.minBetsPlaced} reached`);
  }
  if (!results.roi.pass) {
    console.log(`  2. Review losing bets - check if EV threshold too low`);
    console.log(`     Current avg EV: ${avgEV.toFixed(1)}% (recommend ≥10%)`);
  }
  if (!results.winRate.pass) {
    console.log(`  3. Increase confidence threshold - current avg ${avgConfidence.toFixed(1)}%`);
  }
  if (!results.failures.pass) {
    console.log(`  4. Investigate failed bets - check logs for API errors`);
  }
}

// Timeline Impact
console.log('\n─────────────────────────────────────────────────────────────');
if (allPass) {
  console.log('\n⏱️  TIMELINE IMPACT:');
  console.log('  ✓ Phase 3 deployment: APPROVED');
  console.log('  ✓ Production launch: May 1-8 (2 weeks earlier than baseline)');
} else {
  console.log('\n⏱️  TIMELINE IMPACT:');
  console.log('  ⚠️  Phase 3 deployment: EXTENDED');
  console.log('  ⚠️  Validation continues: Apr 28-29');
  console.log('  ⚠️  Production launch: May 8-15 (on baseline)');
}

console.log('\n═══════════════════════════════════════════════════════════════\n');

// Exit code: 0 = GO, 1 = NO-GO
process.exit(allPass ? 0 : 1);
