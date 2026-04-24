/**
 * Commission Manager
 * Handles all commission calculations, tracking, and impact analysis
 * Sportsbet Australian racing: 7-10% commission (typically 10%)
 */

import db from '../db.js';

export class CommissionManager {
  /**
   * Get current commission rate
   */
  static getCommissionRate(exchange = 'sportsbet') {
    try {
      const config = db.prepare(`
        SELECT commission_rate FROM commission_config
        WHERE exchange = ?
        ORDER BY effective_date DESC
        LIMIT 1
      `).get(exchange);

      return config?.commission_rate || 0.10; // Default to 10% for Sportsbet
    } catch (err) {
      console.error('Error getting commission rate:', err);
      return 0.10;
    }
  }

  /**
   * Set commission rate (for different states/future updates)
   */
  static setCommissionRate(exchange, rate, notes = '') {
    try {
      db.prepare(`
        INSERT INTO commission_config (exchange, commission_rate, notes)
        VALUES (?, ?, ?)
      `).run(exchange, rate, notes);

      return { success: true, message: `Commission updated to ${(rate * 100).toFixed(1)}%` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Calculate net profit after commission
   * grossProfit: profit before commission
   * commission: optional override (uses current rate if not provided)
   */
  static calculateNetProfit(grossProfit, commission = null) {
    const rate = commission ?? this.getCommissionRate();
    const commissionPaid = Math.max(0, grossProfit) * rate; // Only pay commission on wins
    const netProfit = grossProfit - commissionPaid;

    return {
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      commissionRate: (rate * 100).toFixed(1) + '%',
      commissionPaid: parseFloat(commissionPaid.toFixed(2)),
      netProfit: parseFloat(netProfit.toFixed(2)),
      netProfitPercent: ((netProfit / grossProfit) * 100).toFixed(1) + '%'
    };
  }

  /**
   * Calculate net ROI after commission
   * stake: amount wagered
   * return: total return (stake + profit)
   */
  static calculateNetROI(stake, grossReturn, commission = null) {
    const rate = commission ?? this.getCommissionRate();
    const grossProfit = grossReturn - stake;
    const result = this.calculateNetProfit(grossProfit, rate);

    const netROI = (result.netProfit / stake) * 100;
    const grossROI = (grossProfit / stake) * 100;

    return {
      stake: parseFloat(stake.toFixed(2)),
      grossReturn: parseFloat(grossReturn.toFixed(2)),
      grossProfit: result.grossProfit,
      grossROI: parseFloat(grossROI.toFixed(2)) + '%',
      commissionRate: result.commissionRate,
      commissionPaid: result.commissionPaid,
      netProfit: result.netProfit,
      netROI: parseFloat(netROI.toFixed(2)) + '%',
      roiDifference: parseFloat((grossROI - netROI).toFixed(2)) + '%'
    };
  }

  /**
   * Adjust Kelly criterion stake for commission
   * The commission effectively reduces your edge
   * Standard: f = (bp - q) / b
   * Commission-adjusted: Need higher probability to justify same stake
   */
  static adjustKellyForCommission(odds, confidence, commissionRate = null) {
    const rate = commissionRate ?? this.getCommissionRate();

    const p = confidence / 100; // Convert % to decimal
    const b = odds - 1;
    const q = 1 - p;

    // Unadjusted Kelly
    const unadjustedEdge = (p * odds) - 1;
    const unadjustedKelly = (b * p - q) / b;

    // Commission reduces effective odds by rate%
    const adjustedOdds = odds * (1 - rate);
    const adjustedB = adjustedOdds - 1;

    // Adjusted Kelly (accounts for commission drag)
    const adjustedEdge = (p * adjustedOdds) - 1;
    const adjustedKelly = adjustedEdge > 0 ? (adjustedB * p - q) / adjustedB : 0;

    // Quarter Kelly (conservative)
    const quarterKelly = adjustedKelly * 0.25;

    return {
      confidence: parseFloat(confidence.toFixed(1)),
      odds: parseFloat(odds.toFixed(2)),
      commissionRate: (rate * 100).toFixed(1) + '%',
      edge: {
        unadjusted: parseFloat((unadjustedEdge * 100).toFixed(2)) + '%',
        adjusted: parseFloat((adjustedEdge * 100).toFixed(2)) + '%',
        edgeLoss: parseFloat(((unadjustedEdge - adjustedEdge) * 100).toFixed(2)) + '%'
      },
      kelly: {
        unadjusted: parseFloat((unadjustedKelly * 100).toFixed(2)) + '%',
        adjusted: parseFloat((adjustedKelly * 100).toFixed(2)) + '%',
        quarterKelly: parseFloat((quarterKelly * 100).toFixed(2)) + '%'
      },
      recommendation: this.getKellyRecommendation(adjustedKelly)
    };
  }

  /**
   * Track a bet's commission
   */
  static trackBetCommission(betId, grossReturn, grossProfit, stake, commission = null) {
    try {
      const rate = commission ?? this.getCommissionRate();
      const commissionPaid = Math.max(0, grossProfit) * rate;
      const netProfit = grossProfit - commissionPaid;
      const netROI = (netProfit / stake) * 100;

      db.prepare(`
        INSERT INTO commission_tracking (bet_id, gross_return, gross_profit, commission_paid, commission_rate, net_profit, net_roi)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(betId, grossReturn, grossProfit, commissionPaid, rate, netProfit, netROI);

      return { success: true, netProfit, netROI };
    } catch (err) {
      console.error('Error tracking commission:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get commission impact summary
   */
  static getCommissionImpact(days = 7) {
    try {
      const summary = db.prepare(`
        SELECT
          COUNT(*) as total_bets,
          SUM(CASE WHEN gross_profit > 0 THEN 1 ELSE 0 END) as winning_bets,
          SUM(gross_profit) as total_gross_profit,
          SUM(commission_paid) as total_commission_paid,
          SUM(net_profit) as total_net_profit,
          AVG(commission_rate) as avg_commission_rate
        FROM commission_tracking
        WHERE recorded_at > datetime('now', ? || ' days')
      `).get(-days);

      if (!summary || summary.total_bets === 0) {
        return { message: 'No bets tracked yet', status: 'INSUFFICIENT_DATA' };
      }

      const grossROI = (summary.total_gross_profit / (summary.total_bets * 20)) * 100; // Assume $20 avg stake
      const netROI = (summary.total_net_profit / (summary.total_bets * 20)) * 100;
      const commissionPercent = (summary.total_commission_paid / Math.max(1, summary.total_gross_profit)) * 100;

      return {
        period: `Last ${days} days`,
        bets: {
          total: summary.total_bets,
          winning: summary.winning_bets,
          winRate: ((summary.winning_bets / summary.total_bets) * 100).toFixed(1) + '%'
        },
        profit: {
          grossProfit: parseFloat(summary.total_gross_profit.toFixed(2)),
          commissionPaid: parseFloat(summary.total_commission_paid.toFixed(2)),
          netProfit: parseFloat(summary.total_net_profit.toFixed(2)),
          commissionAsPercentOfGross: parseFloat(commissionPercent.toFixed(1)) + '%'
        },
        roi: {
          grossROI: parseFloat(grossROI.toFixed(2)) + '%',
          netROI: parseFloat(netROI.toFixed(2)) + '%',
          roiImpact: parseFloat((grossROI - netROI).toFixed(2)) + '%'
        }
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Daily commission summary
   */
  static updateDailyCommissionSummary(date = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      const dailyData = db.prepare(`
        SELECT
          COUNT(*) as bets_settled,
          SUM(gross_profit) as gross_profit,
          SUM(commission_paid) as commission_paid,
          SUM(net_profit) as net_profit
        FROM commission_tracking
        WHERE DATE(recorded_at) = ?
      `).get(targetDate);

      const betsPlaced = db.prepare(`
        SELECT COUNT(*) as count
        FROM bets
        WHERE DATE(placed_at) = ?
      `).get(targetDate);

      const totalStakes = db.prepare(`
        SELECT SUM(kelly_stake) as total
        FROM bets
        WHERE DATE(placed_at) = ?
      `).get(targetDate);

      const grossROI = dailyData.bets_settled > 0
        ? ((dailyData.gross_profit / (totalStakes.total || 1)) * 100)
        : 0;

      const netROI = dailyData.bets_settled > 0
        ? ((dailyData.net_profit / (totalStakes.total || 1)) * 100)
        : 0;

      db.prepare(`
        INSERT OR REPLACE INTO daily_commission_summary
        (date, bets_placed, bets_settled, total_stakes, gross_profit, commission_paid, net_profit, gross_roi, net_roi)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetDate,
        betsPlaced.count,
        dailyData.bets_settled,
        totalStakes.total || 0,
        dailyData.gross_profit || 0,
        dailyData.commission_paid || 0,
        dailyData.net_profit || 0,
        grossROI,
        netROI
      );

      return { success: true, date: targetDate };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get daily summaries
   */
  static getDailySummaries(days = 30) {
    try {
      return db.prepare(`
        SELECT *
        FROM daily_commission_summary
        WHERE date >= datetime('now', ? || ' days')
        ORDER BY date DESC
      `).all(-days);
    } catch (err) {
      return [];
    }
  }

  /**
   * Estimate required edge to be profitable after commission
   */
  static getMinimumEdgeRequired(odds, commission = null) {
    const rate = commission ?? this.getCommissionRate();

    // Need: (odds - 1) * p - (1 - p) > 0
    // After commission: (odds * (1 - rate) - 1) * p - (1 - p) > 0
    const adjustedOdds = odds * (1 - rate);
    const minProbability = 1 / adjustedOdds;

    return {
      odds: parseFloat(odds.toFixed(2)),
      commission: (rate * 100).toFixed(1) + '%',
      minimumWinProbability: parseFloat((minProbability * 100).toFixed(2)) + '%',
      minimumEdge: parseFloat(((1 / adjustedOdds - 1 / odds) * 100).toFixed(2)) + '%',
      interpretation: `Must win at least ${(minProbability * 100).toFixed(1)}% of the time to break even`
    };
  }

  /**
   * Efficiency threshold adjustment for commission
   * Original: efficiency > 110% (assumes 5% commission)
   * Adjusted: efficiency > 120% (assumes 10% commission)
   */
  static getAdjustedEfficiencyThreshold(commission = null) {
    const rate = commission ?? this.getCommissionRate();

    // Base threshold assumes 5% commission
    const baseThreshold = 1.10;
    const baseCommission = 0.05;

    // Adjust proportionally
    const adjustedThreshold = baseThreshold + ((rate - baseCommission) * 2); // 2x multiplier for effect

    return {
      currentCommission: (rate * 100).toFixed(1) + '%',
      baseThreshold: (baseThreshold * 100).toFixed(0) + '%',
      adjustedThreshold: parseFloat((adjustedThreshold * 100).toFixed(0)) + '%',
      recommendation: `Use efficiency > ${(adjustedThreshold * 100).toFixed(0)}% threshold`
    };
  }

  /**
   * Get Kelly recommendation based on adjusted Kelly %
   */
  static getKellyRecommendation(adjustedKelly) {
    const quarterKelly = adjustedKelly * 0.25;

    if (adjustedKelly <= 0) {
      return 'NO EDGE: Do not bet (negative expected value after commission)';
    } else if (quarterKelly < 0.01) {
      return 'VERY WEAK: Edge too small after commission, skip this bet';
    } else if (quarterKelly < 0.02) {
      return 'WEAK: Use quarter-Kelly only, minimal stake';
    } else if (quarterKelly < 0.04) {
      return 'MODERATE: Use quarter-Kelly stake sizing';
    } else {
      return 'STRONG: Edge justifies full quarter-Kelly stake';
    }
  }

  /**
   * Commission impact on different strategy thresholds
   */
  static getStrategyAdjustments(commission = null) {
    const rate = commission ?? this.getCommissionRate();

    return {
      commission: (rate * 100).toFixed(1) + '%',
      adjustedThresholds: {
        minimumCompositeScore: 40, // Was 35%
        minimumEfficiency: 120, // Was 110%
        minimumStrikeRate: 40, // Was 35%
        minimumConfidence: 75 // Was 70%
      },
      reasoning: {
        compositeScore: 'Need higher base quality to overcome commission',
        efficiency: `Need ${(rate * 100).toFixed(0)}% safety margin vs 5% Betfair`,
        strikeRate: 'Higher strike rate needed to cover commission costs',
        confidence: 'Model must be more certain after commission adjustment'
      },
      riskManagement: {
        kellySizeReduction: 'Use quarter-Kelly (25% of Kelly) instead of half-Kelly',
        maxExposure: '20% of bankroll max (vs 25%)',
        minSampleSize: '100 bets before scaling up (vs 50)'
      }
    };
  }
}

export default CommissionManager;
