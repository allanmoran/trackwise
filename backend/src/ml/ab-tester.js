/**
 * PHASE 4C: A/B Testing Framework
 * Stable hash-based variant assignment for randomized EV threshold testing
 * Post-hoc labeling only - does not affect production bets
 */

import db from '../db.js';

export class ABTester {
  /**
   * Assign variant using stable hash: (race_id * 31 + horse_id) % 3
   * Returns one of: 'control', 'aggressive', 'conservative'
   */
  static assignVariant(raceId, horseId) {
    const seed = (raceId * 31 + horseId) % 3;
    const variants = ['control', 'aggressive', 'conservative'];
    return variants[seed];
  }

  /**
   * Get EV threshold for variant
   * control: 10% (standard)
   * aggressive: 5% (more picks)
   * conservative: 15% (fewer picks)
   */
  static getEVThreshold(variant) {
    const thresholds = {
      control: 0.10,
      aggressive: 0.05,
      conservative: 0.15
    };
    return thresholds[variant] || 0.10;
  }

  /**
   * Log A/B assignment for bet (post-hoc, non-production)
   */
  static recordAssignment(betId, raceId, horseId) {
    try {
      const variant = this.assignVariant(raceId, horseId);
      const evThreshold = this.getEVThreshold(variant);

      db.prepare(`
        INSERT OR IGNORE INTO ab_test_assignments (bet_id, variant, ev_threshold, assigned_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(betId, variant, evThreshold);

      return { betId, variant, evThreshold };
    } catch (err) {
      console.error(`Failed to record A/B assignment for bet ${betId}:`, err);
      return null;
    }
  }

  /**
   * Analyze A/B test results
   * Compare accuracy/ROI across variants
   */
  static analyzeResults(days = 30) {
    try {
      const results = db.prepare(`
        SELECT
          ab.variant,
          COUNT(b.id) as bets_placed,
          SUM(CASE WHEN b.result IN ('WIN', 'PLACE') THEN 1 ELSE 0 END) as hits,
          SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
          SUM(b.profit_loss) as total_pnl,
          AVG(b.confidence) as avg_confidence,
          AVG(b.ev_percent) as avg_ev
        FROM ab_test_assignments ab
        JOIN bets b ON ab.bet_id = b.id
        WHERE b.settled_at > datetime('now', '-' || ? || ' days')
        GROUP BY ab.variant
        ORDER BY total_pnl DESC
      `).all(days);

      if (results.length === 0) {
        return { message: 'Insufficient A/B test data', days };
      }

      const analysis = results.map(r => ({
        variant: r.variant,
        betsPlaced: r.bets_placed,
        wins: r.wins,
        hits: r.hits,
        strikeRate: (r.wins / r.bets_placed * 100).toFixed(1),
        placeRate: (r.hits / r.bets_placed * 100).toFixed(1),
        totalPnL: r.total_pnl?.toFixed(2) || '0.00',
        roi: ((r.total_pnL / (r.bets_placed * 50)) * 100).toFixed(1), // Assume $50 avg stake
        avgConfidence: r.avg_confidence?.toFixed(1) || '0.0',
        avgEV: (r.avg_ev * 100).toFixed(1)
      }));

      // Find winner
      const winner = analysis.reduce((best, curr) => {
        const currPnL = parseFloat(curr.totalPnL);
        const bestPnL = parseFloat(best.totalPnL);
        return currPnL > bestPnL ? curr : best;
      });

      return {
        period: `Last ${days} days`,
        variants: analysis,
        winner: winner.variant,
        recommendation: this.getRecommendation(analysis)
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Generate recommendation based on test results
   */
  static getRecommendation(analysis) {
    const control = analysis.find(a => a.variant === 'control');
    const aggressive = analysis.find(a => a.variant === 'aggressive');
    const conservative = analysis.find(a => a.variant === 'conservative');

    if (!control) return 'Insufficient data for recommendation';

    const controlROI = parseFloat(control.roi);
    const aggressiveROI = aggressive ? parseFloat(aggressive.roi) : controlROI;
    const conservativeROI = conservative ? parseFloat(conservative.roi) : controlROI;

    if (aggressiveROI > controlROI * 1.1) {
      return `LOWER_EV_THRESHOLD: Aggressive (5%) outperforms control by ${(aggressiveROI - controlROI).toFixed(1)}%`;
    }

    if (conservativeROI > controlROI * 1.1) {
      return `RAISE_EV_THRESHOLD: Conservative (15%) outperforms control by ${(conservativeROI - controlROI).toFixed(1)}%`;
    }

    return `MAINTAIN: Control (10%) is optimal or variants are statistically similar`;
  }

  /**
   * Get test status/summary
   */
  static getTestStatus() {
    try {
      const counts = db.prepare(`
        SELECT
          ab.variant,
          COUNT(*) as count
        FROM ab_test_assignments ab
        GROUP BY ab.variant
      `).all();

      const totalCount = counts.reduce((sum, c) => sum + c.count, 0);

      return {
        totalAssignments: totalCount,
        byVariant: Object.fromEntries(counts.map(c => [c.variant, c.count]))
      };
    } catch (err) {
      return { error: err.message };
    }
  }
}

export default ABTester;
