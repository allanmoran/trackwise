/**
 * PHASE 2B: Track-Specific Model Profiles
 *
 * Allows model weights to be tuned per-track based on historical performance
 * Enables the ensemble to adapt to track-specific conditions
 */

import db from '../db.js';

export class TrackProfileManager {
  /**
   * Get weight overrides for a specific track
   * Returns null if no custom profile exists (use defaults)
   */
  static getWeightsForTrack(trackName) {
    const profile = db.prepare(`
      SELECT weights_json FROM track_model_profiles WHERE track = ?
    `).get(trackName);

    if (!profile) return null;

    try {
      return JSON.parse(profile.weights_json);
    } catch (e) {
      console.error(`Failed to parse weights for track ${trackName}:`, e);
      return null;
    }
  }

  /**
   * Save learned weights for a track
   */
  static saveLearnedWeights(trackName, weights) {
    if (!weights.form || !weights.market || !weights.kb) {
      console.error('Invalid weights structure');
      return false;
    }

    const total = weights.form + weights.market + weights.kb;
    if (total === 0) {
      console.error('Weights sum to zero');
      return false;
    }

    // Normalize to sum to 1.0
    const normalized = {
      form: weights.form / total,
      market: weights.market / total,
      kb: weights.kb / total
    };

    try {
      db.prepare(`
        INSERT OR REPLACE INTO track_model_profiles (track, weights_json, last_updated)
        VALUES (?, ?, datetime('now'))
      `).run(trackName, JSON.stringify(normalized));

      console.log(`Updated weights for ${trackName}: form=${(normalized.form * 100).toFixed(1)}%, market=${(normalized.market * 100).toFixed(1)}%, kb=${(normalized.kb * 100).toFixed(1)}%`);
      return true;
    } catch (err) {
      console.error(`Failed to save weights for ${trackName}:`, err);
      return false;
    }
  }

  /**
   * Get performance metrics for a track
   */
  static getTrackPerformance(trackName, days = 30) {
    const query = `
      SELECT
        COUNT(*) as total_bets,
        COUNT(CASE WHEN status LIKE 'SETTLED%' THEN 1 END) as settled,
        SUM(CASE WHEN status LIKE 'SETTLED%' THEN profit_loss ELSE 0 END) as pnl,
        AVG(CASE WHEN status LIKE 'SETTLED%' THEN confidence ELSE NULL END) as avg_confidence,
        AVG(CASE WHEN status LIKE 'SETTLED%' THEN ev_percent ELSE NULL END) as avg_ev
      FROM bets b
      JOIN races r ON b.race_id = r.id
      WHERE r.track = ? AND b.placed_at > datetime('now', '-' || ? || ' days')
    `;

    const stats = db.prepare(query).get(trackName, days);
    return {
      trackName,
      totalBets: stats.total_bets || 0,
      settledBets: stats.settled || 0,
      pnl: stats.pnl || 0,
      avgConfidence: stats.avg_confidence || 0,
      avgEV: stats.avg_ev || 0,
      roi: stats.total_bets > 0 ? (stats.pnl || 0) / (stats.total_bets > 0 ? stats.total_bets * 50 : 1) : 0 // Assume $50 avg stake
    };
  }

  /**
   * Recommend weight adjustments based on track performance
   */
  static recommendWeightAdjustment(trackName, days = 30) {
    const perf = this.getTrackPerformance(trackName, days);

    if (perf.settledBets < 10) {
      return { recommendation: 'INSUFFICIENT_DATA', reason: `Only ${perf.settledBets} settled bets` };
    }

    if (perf.roi > 0.10) {
      return { recommendation: 'INCREASE_WEIGHT', reason: 'Strong track performance', roi: perf.roi };
    }

    if (perf.roi < -0.15) {
      return { recommendation: 'DECREASE_WEIGHT', reason: 'Weak track performance', roi: perf.roi };
    }

    return { recommendation: 'MAINTAIN', reason: 'Track performing as expected', roi: perf.roi };
  }
}

export default TrackProfileManager;
