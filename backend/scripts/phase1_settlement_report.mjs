#!/usr/bin/env node

/**
 * Phase 1 Settlement Report Generator
 *
 * Generates comprehensive analysis of Phase 1 manual validation bets
 * Run daily during settlement window (8-9 PM) or on demand
 */

import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('/Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db');
const reportDir = '/tmp/phase1_reports';

// Ensure report directory exists
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        PHASE 1 SETTLEMENT REPORT GENERATOR                 ║');
console.log('║        Manual Validation Betting Analysis                  ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Get all Phase 1 bets (placed during Apr 24 validation)
const phase1Bets = db.prepare(`
  SELECT
    b.id, b.race_id, b.horse_id, b.status, b.stake,
    b.opening_odds, b.closing_odds, b.profit_loss, b.result,
    b.placed_at, b.settled_at, b.confidence, b.ev_percent,
    COALESCE(h.name, 'Unknown') as horse,
    COALESCE(r.track, 'Unknown') as track,
    COALESCE(r.race_number, 0) as race_number,
    r.date
  FROM bets b
  LEFT JOIN horses h ON b.horse_id = h.id
  LEFT JOIN races r ON b.race_id = r.id
  WHERE b.placed_at >= '2026-04-24 00:00:00' AND b.placed_at < '2026-04-25 00:00:00'
  ORDER BY b.placed_at ASC
`).all();

const settledBets = phase1Bets.filter(b => b.status && b.status.includes('SETTLED'));
const activeBets = phase1Bets.filter(b => b.status === 'ACTIVE');
const failedBets = phase1Bets.filter(b => b.status === 'FAILED');

const totalStake = phase1Bets.reduce((sum, b) => sum + (b.stake || 0), 0);
const totalProfitLoss = settledBets.reduce((sum, b) => sum + (b.profit_loss || 0), 0);

const winCount = settledBets.filter(b => b.result === 'WIN').length;
const placeCount = settledBets.filter(b => b.result === 'PLACE').length;
const lossCount = settledBets.filter(b => b.result === 'LOSS').length;
const scratchCount = settledBets.filter(b => b.result === 'SCRATCH').length;

const roi = totalStake > 0 ? totalProfitLoss / totalStake : 0;
const winRate = settledBets.length > 0 ? winCount / settledBets.length : 0;

// Generate report
let report = '';
report += '╔════════════════════════════════════════════════════════════╗\n';
report += '║              PHASE 1 SETTLEMENT REPORT                    ║\n';
report += `║              ${new Date().toISOString().split('T')[0]} ${new Date().toTimeString().split(' ')[0]}                      ║\n`;
report += '╚════════════════════════════════════════════════════════════╝\n\n';

// Summary Statistics
report += 'SUMMARY STATISTICS\n';
report += '═══════════════════════════════════════════════════════════\n\n';

report += `Total Bets Placed: ${phase1Bets.length}\n`;
report += `  • Settled: ${settledBets.length}\n`;
report += `  • Active (awaiting results): ${activeBets.length}\n`;
report += `  • Failed: ${failedBets.length}\n\n`;

report += `Total Stake: $${totalStake.toFixed(2)}\n`;
report += `Total Return: $${(totalStake + totalProfitLoss).toFixed(2)}\n`;
report += `Total P/L: ${totalProfitLoss >= 0 ? '+' : ''}$${totalProfitLoss.toFixed(2)}\n`;
report += `ROI: ${(roi * 100).toFixed(2)}%\n\n`;

// Results Breakdown
report += 'RESULTS (Settled Bets)\n';
report += '═══════════════════════════════════════════════════════════\n\n';

report += `Wins: ${winCount} (${settledBets.length > 0 ? (winCount / settledBets.length * 100).toFixed(1) : 0}%)\n`;
report += `Places: ${placeCount}\n`;
report += `Losses: ${lossCount}\n`;
report += `Scratches: ${scratchCount}\n`;
report += `Win Rate: ${(winRate * 100).toFixed(2)}%\n\n`;

// Bet-by-Bet Detail
report += 'BET-BY-BET DETAIL\n';
report += '═══════════════════════════════════════════════════════════\n\n';

report += 'ID | Track | R# | Horse | Result | Stake | Odds | P/L | ROI%\n';
report += '───────────────────────────────────────────────────────────\n';

for (const bet of settledBets) {
  const betRoi = bet.stake > 0 ? (bet.profit_loss / bet.stake * 100).toFixed(1) : '0.0';
  const padTrack = bet.track.substring(0, 12).padEnd(12);
  const padHorse = bet.horse.substring(0, 18).padEnd(18);
  const padResult = (bet.result || 'PENDING').padEnd(6);

  report += `${bet.id.toString().padEnd(3)} | ${padTrack} | ${bet.race_number.toString().padEnd(2)} | ${padHorse} | ${padResult} | $${bet.stake.toString().padEnd(6)} | ${(bet.opening_odds || 0).toFixed(2)} | $${(bet.profit_loss || 0).toFixed(2).padEnd(7)} | ${betRoi}%\n`;
}

report += '\n';

// Performance Analysis
report += 'PERFORMANCE ANALYSIS\n';
report += '═══════════════════════════════════════════════════════════\n\n';

const winningBets = settledBets.filter(b => b.result === 'WIN');
const losingBets = settledBets.filter(b => b.result === 'LOSS');

if (winningBets.length > 0) {
  const avgWinOdds = winningBets.reduce((sum, b) => sum + (b.opening_odds || 0), 0) / winningBets.length;
  const avgWinConfidence = winningBets.reduce((sum, b) => sum + (b.confidence || 0), 0) / winningBets.length;
  report += `Average Winning Bet:\n`;
  report += `  Odds: ${avgWinOdds.toFixed(2)}\n`;
  report += `  Confidence: ${avgWinConfidence.toFixed(1)}%\n`;
  report += `  EV: ${(winningBets.reduce((sum, b) => sum + (b.ev_percent || 0), 0) / winningBets.length).toFixed(1)}%\n\n`;
}

if (losingBets.length > 0) {
  const avgLossOdds = losingBets.reduce((sum, b) => sum + (b.opening_odds || 0), 0) / losingBets.length;
  const avgLossConfidence = losingBets.reduce((sum, b) => sum + (b.confidence || 0), 0) / losingBets.length;
  report += `Average Losing Bet:\n`;
  report += `  Odds: ${avgLossOdds.toFixed(2)}\n`;
  report += `  Confidence: ${avgLossConfidence.toFixed(1)}%\n`;
  report += `  EV: ${(losingBets.reduce((sum, b) => sum + (b.ev_percent || 0), 0) / losingBets.length).toFixed(1)}%\n\n`;
}

// Track Performance
const trackStats = {};
for (const bet of settledBets) {
  if (!trackStats[bet.track]) {
    trackStats[bet.track] = { bets: 0, wins: 0, pnl: 0 };
  }
  trackStats[bet.track].bets += 1;
  if (bet.result === 'WIN') trackStats[bet.track].wins += 1;
  trackStats[bet.track].pnl += bet.profit_loss || 0;
}

report += 'PERFORMANCE BY TRACK\n';
report += '─────────────────────────────────────────────────────────\n';
for (const [track, stats] of Object.entries(trackStats)) {
  const winRate = (stats.wins / stats.bets * 100).toFixed(1);
  report += `${track.padEnd(20)} | ${stats.bets} bets | ${winRate}% | $${stats.pnl.toFixed(2)}\n`;
}
report += '\n';

// Verdict
report += 'VERDICT & RECOMMENDATION\n';
report += '═══════════════════════════════════════════════════════════\n\n';

if (roi >= -0.10 && winRate >= 0.04) {
  report += '✅ PHASE 1 VALIDATION SUCCESSFUL\n\n';
  report += 'Metrics meet approval criteria:\n';
  report += `  • ROI: ${(roi * 100).toFixed(2)}% ≥ -10% ✓\n`;
  report += `  • Win rate: ${(winRate * 100).toFixed(2)}% ≥ 4% ✓\n`;
  report += `  • Bets settled: ${settledBets.length} ✓\n\n`;
  report += 'RECOMMENDATION: PROCEED TO PHASE 2A (AUTO-BETTING ENABLED)\n';
  report += 'Timeline: Apr 25-27 aggressive validation\n';
  report += 'Decision: Apr 27 evening\n\n';
} else {
  report += '⚠️  PHASE 1 VALIDATION INCONCLUSIVE\n\n';
  if (roi < -0.10) {
    report += `  ❌ ROI too low: ${(roi * 100).toFixed(2)}% (need ≥ -10%)\n`;
  }
  if (winRate < 0.04) {
    report += `  ❌ Win rate too low: ${(winRate * 100).toFixed(2)}% (need ≥ 4%)\n`;
  }
  report += '\nRECOMMENDATION: Investigate before Phase 2A\n';
  report += 'Analysis needed:\n';
  report += '  1. Review losing bets for common patterns\n';
  report += '  2. Check if EV threshold is too low\n';
  report += '  3. Verify model calibration (confidence accuracy)\n';
  report += '  4. Consider adjusting bet selection criteria\n\n';
}

// Active Bets Status
if (activeBets.length > 0) {
  report += 'ACTIVE BETS (Awaiting Settlement)\n';
  report += '═══════════════════════════════════════════════════════════\n\n';
  report += `${activeBets.length} bets still active - expected to settle within 3-7 days\n\n`;
  for (const bet of activeBets) {
    report += `  • ${bet.track} R${bet.race_number}: ${bet.horse} @ ${(bet.opening_odds || 0).toFixed(2)}\n`;
  }
  report += '\n';
}

// Timestamp
const timestamp = new Date().toISOString();
report += '═══════════════════════════════════════════════════════════\n';
report += `Report generated: ${timestamp}\n`;

// Output to console
console.log(report);

// Save to file
const filename = `${reportDir}/phase1_report_${new Date().toISOString().split('T')[0]}.txt`;
fs.writeFileSync(filename, report);
console.log(`\n✓ Report saved: ${filename}`);

// Also save summary JSON for programmatic access
const summaryJson = {
  timestamp,
  totalBets: phase1Bets.length,
  settledBets: settledBets.length,
  activeBets: activeBets.length,
  failedBets: failedBets.length,
  totalStake,
  totalProfitLoss,
  roi: parseFloat((roi * 100).toFixed(2)),
  winRate: parseFloat((winRate * 100).toFixed(2)),
  wins: winCount,
  places: placeCount,
  losses: lossCount,
  scratches: scratchCount,
  verdict: (roi >= -0.10 && winRate >= 0.04) ? 'APPROVED' : 'REVIEW_NEEDED'
};

const jsonFile = `${reportDir}/phase1_summary_${new Date().toISOString().split('T')[0]}.json`;
fs.writeFileSync(jsonFile, JSON.stringify(summaryJson, null, 2));
console.log(`✓ Summary saved: ${jsonFile}`);
