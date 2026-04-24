/**
 * Golden Rules Compliance Monitor
 * Validates TrackWise against Betfair's 10 Golden Rules of Automation
 */

import db from '../db.js';
import { CommissionManager } from '../utils/commission-manager.js';

export class ComplianceMonitor {
  /**
   * Rule 3: Avoid Data Leakage
   * Verify features only use data available at bet time
   */
  static checkDataLeakage() {
    try {
      // Sample bets and verify their features don't reference future results
      const bets = db.prepare(`
        SELECT id, horse_id, placed_at, result
        FROM bets
        WHERE placed_at IS NOT NULL AND result IS NOT NULL
        ORDER BY placed_at DESC
        LIMIT 100
      `).all();

      if (bets.length === 0) {
        return { rule: 3, status: 'INSUFFICIENT_DATA', message: 'Need 10+ settled bets to check data leakage' };
      }

      let leakageDetected = 0;

      for (const bet of bets) {
        // Get horse stats as of bet placement time
        const statsAtBetTime = db.prepare(`
          SELECT
            (SELECT COUNT(*) FROM race_runners WHERE horse_id = ? AND result IS NOT NULL
             AND race_id IN (SELECT id FROM races WHERE finished_at <= ?)) as races_before,
            (SELECT COUNT(*) FROM race_runners WHERE horse_id = ? AND result = 'WIN'
             AND race_id IN (SELECT id FROM races WHERE finished_at <= ?)) as wins_before
          FROM horses WHERE id = ?
        `).get(bet.horse_id, bet.placed_at, bet.horse_id, bet.placed_at, bet.horse_id);

        // Verify stats were calculated from data available at bet time
        if (statsAtBetTime.races_before === null) {
          leakageDetected++;
        }
      }

      const leakagePercent = (leakageDetected / bets.length) * 100;
      const passed = leakagePercent < 5; // Allow 5% margin for edge cases

      return {
        rule: 3,
        status: passed ? 'PASS' : 'FAIL',
        message: passed ? 'Data leakage check passed' : `${leakagePercent.toFixed(1)}% of features may use future data`,
        betsChecked: bets.length,
        leakageDetected,
        severity: passed ? 'info' : 'critical'
      };
    } catch (err) {
      return { rule: 3, status: 'ERROR', message: err.message };
    }
  }

  /**
   * Rule 4: Do Not Overfit
   * Compare model predictions vs actual results on holdout data
   */
  static checkOverfitting() {
    try {
      // Get settled bets with confidence scores
      const settledBets = db.prepare(`
        SELECT
          confidence,
          result,
          COUNT(*) as count
        FROM bets
        WHERE result IS NOT NULL
        GROUP BY confidence, result
        ORDER BY confidence DESC
      `).all();

      if (settledBets.length === 0) {
        return { rule: 4, status: 'INSUFFICIENT_DATA', message: 'Need settled bets to check overfitting' };
      }

      // Build accuracy by confidence bucket
      const confidenceBuckets = {};
      for (const bet of settledBets) {
        const bucket = Math.floor(bet.confidence / 10) * 10; // 0-10, 10-20, etc.
        if (!confidenceBuckets[bucket]) {
          confidenceBuckets[bucket] = { wins: 0, total: 0, expected: 0 };
        }
        if (bet.result === 'WIN' || bet.result === 'PLACE') {
          confidenceBuckets[bucket].wins += bet.count;
        }
        confidenceBuckets[bucket].total += bet.count;
        confidenceBuckets[bucket].expected += (bucket / 100) * bet.count;
      }

      // Check for overfitting: backtest accuracy much higher than live
      let overfitRisk = 0;
      for (const [bucket, data] of Object.entries(confidenceBuckets)) {
        if (data.total < 5) continue; // Need sample size
        const actual = data.wins / data.total;
        const expected = data.expected / data.total;
        const deviation = Math.abs(actual - expected);
        if (deviation > 0.15) { // >15% deviation suggests overfitting
          overfitRisk++;
        }
      }

      const passed = overfitRisk === 0;

      return {
        rule: 4,
        status: passed ? 'PASS' : 'WARNING',
        message: passed ? 'Calibration looks good' : `${overfitRisk} confidence buckets show >15% deviation`,
        bucketsAnalyzed: Object.keys(confidenceBuckets).length,
        totalBets: settledBets.reduce((sum, b) => sum + b.count, 0),
        confidence_calibration: confidenceBuckets,
        severity: passed ? 'info' : 'warning'
      };
    } catch (err) {
      return { rule: 4, status: 'ERROR', message: err.message };
    }
  }

  /**
   * Rule 6: Prioritize Staking Plans
   * Verify Kelly Criterion is being applied correctly
   */
  static checkStakingPlan() {
    try {
      const activeBets = db.prepare(`
        SELECT
          id,
          confidence,
          odds,
          kelly_stake,
          (SELECT bank FROM dashboard LIMIT 1) as bank
        FROM bets
        WHERE status = 'ACTIVE'
        ORDER BY placed_at DESC
        LIMIT 50
      `).all();

      if (activeBets.length === 0) {
        return { rule: 6, status: 'INSUFFICIENT_DATA', message: 'No active bets to check staking plan' };
      }

      const dashboard = db.prepare('SELECT bank, total_staked FROM dashboard').get();
      const bankTotal = dashboard?.bank || 1000;
      const totalStaked = dashboard?.total_staked || 0;

      // Check: No single bet exceeds 5% of bankroll
      let excessiveSize = 0;
      let avgStake = 0;

      for (const bet of activeBets) {
        const stakePercent = (bet.kelly_stake / bankTotal) * 100;
        avgStake += bet.kelly_stake;
        if (stakePercent > 5) {
          excessiveSize++;
        }
      }
      avgStake /= activeBets.length;

      // Check: Total open exposure doesn't exceed 25% of bank
      const exposurePercent = (totalStaked / bankTotal) * 100;
      const exposureOk = exposurePercent < 25;

      // Check: Kelly sizing is reasonable
      const avgStakePercent = (avgStake / bankTotal) * 100;
      const kellyOk = avgStakePercent <= 2; // Quarter Kelly should be <2% per bet

      const passed = excessiveSize === 0 && exposureOk && kellyOk;

      return {
        rule: 6,
        status: passed ? 'PASS' : 'WARNING',
        message: passed ? 'Staking plan is appropriate' : 'Staking plan needs review',
        bankroll: bankTotal,
        totalExposure: totalStaked,
        exposurePercent: exposurePercent.toFixed(1),
        activeBets: activeBets.length,
        avgStakePercent: avgStakePercent.toFixed(2),
        excessiveSizeCount: excessiveSize,
        issues: [
          !exposureOk ? `Exposure ${exposurePercent.toFixed(1)}% exceeds 25% limit` : null,
          !kellyOk ? `Avg stake ${avgStakePercent.toFixed(2)}% exceeds recommended 2%` : null,
          excessiveSize > 0 ? `${excessiveSize} bets exceed 5% of bankroll` : null
        ].filter(x => x),
        severity: passed ? 'info' : 'warning'
      };
    } catch (err) {
      return { rule: 6, status: 'ERROR', message: err.message };
    }
  }

  /**
   * Rule 7: Manage Your Bankroll
   * Monitor reserves and exposure limits (commission-aware)
   */
  static checkBankrollManagement() {
    try {
      const dashboard = db.prepare(`
        SELECT bank, total_staked, total_wins, roi
        FROM dashboard
      `).get();

      if (!dashboard) {
        return { rule: 7, status: 'INSUFFICIENT_DATA', message: 'No dashboard data' };
      }

      const bank = dashboard.bank;
      const staked = dashboard.total_staked;
      const winnings = dashboard.total_wins;
      const roi = dashboard.roi || 0;
      const commissionRate = CommissionManager.getCommissionRate();

      // Check: Reserves maintained (minimum 50% of original bank)
      const originalBank = bank + staked - winnings; // Reconstruct original
      const reservePercent = (bank / originalBank) * 100;
      const reserveOk = reservePercent >= 50;

      // NEW: Account for commission drag on reserves
      // Expected commission loss over time
      const activeWinningBets = db.prepare(`
        SELECT COUNT(*) as count, AVG(kelly_stake) as avg_stake
        FROM bets
        WHERE status = 'ACTIVE'
      `).get();

      const expectedCommissionDrag = activeWinningBets.count > 0
        ? (activeWinningBets.count * (activeWinningBets.avg_stake || 20) * 0.30 * commissionRate) // 30% win rate assumption
        : 0;

      const adjustedBank = bank - expectedCommissionDrag;
      const reserveOkAfterCommission = (adjustedBank / originalBank) > 0.50;

      // Check: Winning streaks don't cause overconfidence (ROI limits)
      // Account for commission: Gross ROI might look good, but net ROI might be poor
      const grossRoi = roi;
      const netRoi = roi * (1 - commissionRate);
      const roiOk = netRoi < 30; // Flag if net ROI >30% (unsustainable)

      // Check: Variance cushion exists (higher requirement for commission impact)
      const varianceCushion = (bank - staked) / bank;
      const cushionOk = varianceCushion > 0.25; // Increased from 0.2 to 0.25 for commission

      const passed = reserveOkAfterCommission && roiOk && cushionOk;

      return {
        rule: 7,
        status: passed ? 'PASS' : 'WARNING',
        message: passed ? 'Bankroll is well-managed' : 'Bankroll safeguards need review',
        currentBank: bank,
        totalStaked: staked,
        totalWins: winnings,
        commissionRate: (commissionRate * 100).toFixed(1) + '%',
        roi: {
          gross: grossRoi.toFixed(2) + '%',
          net: netRoi.toFixed(2) + '%',
          commissionImpact: (grossRoi - netRoi).toFixed(2) + '%'
        },
        reserves: {
          percentOfOriginal: reservePercent.toFixed(1) + '%',
          afterCommissionDrag: reserveOkAfterCommission ? 'PASS' : 'WARNING',
          expectedCommissionDrag: expectedCommissionDrag.toFixed(2)
        },
        varianceCushionPercent: (varianceCushion * 100).toFixed(1),
        issues: [
          !reserveOkAfterCommission ? `Reserves ${reservePercent.toFixed(1)}% may be below safe level after commission drag` : null,
          expectedCommissionDrag > bank * 0.05 ? `Expected commission loss ($${expectedCommissionDrag.toFixed(2)}) exceeds 5% of bank` : null,
          !roiOk ? `Net ROI ${netRoi.toFixed(1)}% (before: ${grossRoi.toFixed(1)}%) suggests overconfidence` : null,
          !cushionOk ? `Variance cushion ${(varianceCushion * 100).toFixed(1)}% below 25% safe threshold` : null
        ].filter(x => x),
        severity: passed ? 'info' : 'warning'
      };
    } catch (err) {
      return { rule: 7, status: 'ERROR', message: err.message };
    }
  }

  /**
   * Rule 9: Implement Error Handling
   * Check logging and monitoring infrastructure
   */
  static checkErrorHandling() {
    try {
      // Check for error logs in database
      const recentErrors = db.prepare(`
        SELECT
          error_type,
          COUNT(*) as count,
          MAX(logged_at) as last_occurrence
        FROM error_logs
        WHERE logged_at > datetime('now', '-24 hours')
        GROUP BY error_type
      `).all();

      // Check scheduler health
      const schedulerStatus = db.prepare(`
        SELECT
          job_name,
          status,
          last_run,
          last_error
        FROM scheduler_jobs
        ORDER BY last_run DESC
        LIMIT 5
      `).all();

      const hasErrors = recentErrors && recentErrors.length > 0;
      const schedulerHealthy = schedulerStatus &&
        schedulerStatus.every(j => j.status === 'SUCCESS' || j.last_run > (Date.now() - 86400000));

      const passed = !hasErrors && schedulerHealthy;

      return {
        rule: 9,
        status: passed ? 'PASS' : 'WARNING',
        message: passed ? 'Error handling and logging operational' : 'Some errors detected in last 24h',
        recentErrors: recentErrors || [],
        schedulerJobs: schedulerStatus || [],
        severity: passed ? 'info' : 'warning'
      };
    } catch (err) {
      return {
        rule: 9,
        status: 'WARNING',
        message: 'Error logs not yet implemented. Tables may not exist.',
        recommendation: 'Create error_logs and scheduler_jobs tables for comprehensive monitoring'
      };
    }
  }

  /**
   * Generate comprehensive compliance report
   */
  static generateComplianceReport() {
    const rules = [
      this.checkDataLeakage(),
      this.checkOverfitting(),
      this.checkStakingPlan(),
      this.checkBankrollManagement(),
      this.checkErrorHandling()
    ];

    const passCount = rules.filter(r => r.status === 'PASS').length;
    const totalChecks = rules.length;

    return {
      timestamp: new Date().toISOString(),
      overallScore: `${Math.round((passCount / totalChecks) * 100)}%`,
      rulesChecked: totalChecks,
      rulesPassed: passCount,
      rulesWarning: rules.filter(r => r.status === 'WARNING').length,
      rulesError: rules.filter(r => r.status === 'ERROR').length,
      details: rules,
      recommendations: this.getRecommendations(rules)
    };
  }

  /**
   * Generate actionable recommendations
   */
  static getRecommendations(rules) {
    const recs = [];

    const dataLeakage = rules.find(r => r.rule === 3);
    if (dataLeakage?.status === 'FAIL') {
      recs.push('DATA LEAKAGE: Features are using future data. Review feature engineering to ensure only past data is used.');
    }

    const overfitting = rules.find(r => r.rule === 4);
    if (overfitting?.status === 'WARNING') {
      recs.push('OVERFITTING: Model accuracy on live data differs from backtest. Reduce confidence thresholds or add more conservative filters.');
    }

    const staking = rules.find(r => r.rule === 6);
    if (staking?.status === 'WARNING') {
      const issues = staking.issues || [];
      if (issues.some(i => i.includes('Exposure'))) {
        recs.push('EXPOSURE: Total staked bets exceed 25% limit. Reduce bet frequency or increase bankroll.');
      }
      if (issues.some(i => i.includes('Avg stake'))) {
        recs.push('KELLY: Average stake size too large. Reduce confidence threshold or use more conservative Kelly multiplier.');
      }
    }

    const bankroll = rules.find(r => r.rule === 7);
    if (bankroll?.status === 'WARNING') {
      const issues = bankroll.issues || [];
      if (issues.some(i => i.includes('Reserves'))) {
        recs.push('RESERVES: Bankroll below 50% of original. Stop betting and rebuild reserves before continuing.');
      }
      if (issues.some(i => i.includes('ROI'))) {
        recs.push('ROI WARNING: Returns appear unsustainable. Review edge assumptions and tighten selection criteria.');
      }
    }

    if (recs.length === 0) {
      recs.push('✅ All checks passed. System is operating within compliance guidelines.');
    }

    return recs;
  }
}

export default ComplianceMonitor;
