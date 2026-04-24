/**
 * Predictive Model for Horse Racing Pick Generation
 *
 * Uses historical race data to predict win probability for new races
 * Incorporates:
 * - Horse form (recent performance)
 * - Jockey/Trainer stats
 * - Track conditions & distance suitability
 * - Field strength
 * - Expected Value calculation for bet sizing
 */

import db from '../db.js';

export class RacePredictor {
  /**
   * PHASE 3: Intelligence-Based Hybrid Model with Strategic Signals
   *
   * Phase 2 baseline: ROI-based hybrid
   * Phase 3 improvements (Priority 1):
   * 1. Barrier analysis (5-10%) - track-specific barrier bias + horse suitability
   * 2. Form trend detection (replaces static form) - momentum vs fading
   * 3. Win/Place ROI split - separate profitability tracking
   *
   * Previous weights (25%+25%+20%+15%+10%+5% = 100%):
   * - ROI (25%), Recent form (25%), Place rate (20%), Market (15%), Distance (10%), Class (5%)
   *
   * New distribution:
   * - ROI split (12% WIN + 12% PLACE), Form trend (20%), Place rate (18%),
   * - Barrier (8%), Market (15%), Distance (9%), Class (4%), Track condition (2%)
   */

  /**
   * Analyze horse performance in different track conditions
   * Returns condition suitability signal based on historical data
   */
  static getTrackConditionAnalysis(horseId, raceId) {
    const race = db.prepare('SELECT track_condition FROM races WHERE id = ?').get(raceId);
    if (!race || !race.track_condition) return { conditionSignal: 0, suitability: 'unknown' };

    // Get win rate in this specific condition
    const conditionStats = db.prepare(`
      SELECT
        r.track_condition,
        COUNT(*) as races,
        COUNT(CASE WHEN rr.result = 'WIN' THEN 1 END) as wins,
        ROUND(COUNT(CASE WHEN rr.result = 'WIN' THEN 1 END) * 100.0 / COUNT(*), 1) as win_pct
      FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE rr.horse_id = ? AND r.track_condition = ?
      GROUP BY r.track_condition
    `).get(horseId, race.track_condition);

    if (!conditionStats || conditionStats.races < 2) {
      return { conditionSignal: 0, suitability: 'insufficient_data', condition: race.track_condition };
    }

    // Overall win rate baseline (~15%)
    const overallWinRate = db.prepare(`
      SELECT
        COUNT(CASE WHEN result = 'WIN' THEN 1 END) * 100.0 / COUNT(*) as win_pct
      FROM race_runners
      WHERE horse_id = ?
    `).get(horseId).win_pct || 15;

    const conditionWinRate = conditionStats.win_pct;
    const improvement = (conditionWinRate - overallWinRate) / Math.max(1, overallWinRate);

    // Normalize to signal: positive if horse is better in this condition
    const signal = Math.max(-0.15, Math.min(0.15, improvement * 0.15));

    // Determine suitability
    let suitability = 'neutral';
    if (conditionWinRate > overallWinRate + 5) suitability = 'excellent';
    else if (conditionWinRate > overallWinRate + 2) suitability = 'good';
    else if (conditionWinRate < overallWinRate - 5) suitability = 'poor';
    else if (conditionWinRate < overallWinRate - 2) suitability = 'weak';

    return {
      conditionSignal: signal,
      suitability,
      condition: race.track_condition,
      samples: conditionStats.races,
      winRate: conditionWinRate,
      baseline: overallWinRate
    };
  }

  /**
   * Calculate barrier suitability for this horse at this track
   */
  static getBarrierAnalysis(horseId, raceId) {
    const race = db.prepare('SELECT track FROM races WHERE id = ?').get(raceId);
    if (!race) return { barrierSignal: 0, preference: null };

    const barrierStats = db.prepare(`
      SELECT
        rr.barrier,
        COUNT(*) as races,
        COUNT(CASE WHEN rr.result = 'WIN' THEN 1 END) as wins,
        ROUND(COUNT(CASE WHEN rr.result = 'WIN' THEN 1 END) * 100.0 / COUNT(*), 1) as win_pct
      FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE rr.horse_id = ? AND r.track = ?
      GROUP BY rr.barrier
      ORDER BY races DESC
      LIMIT 1
    `).get(horseId, race.track);

    if (!barrierStats || barrierStats.races < 2) return { barrierSignal: 0, preference: null };

    // Normalize barrier win% to 0-1 scale (assume 15% base win rate)
    const barrierWinRate = barrierStats.win_pct / 100;
    const signal = Math.max(0, Math.min(1, (barrierWinRate - 0.15) / 0.35));

    return {
      barrierSignal: signal * 0.08, // 8% weight
      preference: barrierStats.barrier,
      winRate: barrierWinRate,
      races: barrierStats.races
    };
  }

  /**
   * Detect form trend: improving vs declining (momentum detection)
   */
  static getFormTrend(horseId) {
    const formData = db.prepare(`
      SELECT
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) FILTER (WHERE row_num <= 5) as recent_5_wins,
        COUNT(*) FILTER (WHERE row_num <= 5) as recent_5_races,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) FILTER (WHERE row_num > 5 AND row_num <= 10) as prev_5_wins,
        COUNT(*) FILTER (WHERE row_num > 5 AND row_num <= 10) as prev_5_races
      FROM (
        SELECT result, ROW_NUMBER() OVER (ORDER BY race_id DESC) as row_num
        FROM race_runners
        WHERE horse_id = ? AND result IS NOT NULL
        LIMIT 10
      )
    `).get(horseId);

    if (!formData || (formData.recent_5_races || 0) === 0) return { trend: 0, direction: 'insufficient' };

    const recent5Rate = (formData.recent_5_wins || 0) / Math.max(1, formData.recent_5_races || 1);
    const prev5Rate = (formData.prev_5_wins || 0) / Math.max(1, formData.prev_5_races || 1);
    const trend = recent5Rate - prev5Rate;

    // Trend ranges from -1 to +1, translate to signal
    const trendSignal = Math.max(-0.20, Math.min(0.20, trend * 0.20)); // ±20% adjustment

    return {
      trend: trendSignal,
      direction: trend > 0.05 ? 'improving' : trend < -0.05 ? 'declining' : 'flat',
      recent5: parseFloat((recent5Rate * 100).toFixed(1)),
      prev5: parseFloat((prev5Rate * 100).toFixed(1))
    };
  }

  /**
   * Calculate ROI separately for WIN and PLACE bets
   */
  static getSplitROI(horseId) {
    const roiData = db.prepare(`
      SELECT
        COUNT(CASE WHEN rr.result = 'WIN' THEN 1 END) as win_count,
        COUNT(CASE WHEN rr.result = 'PLACE' THEN 1 END) as place_count,
        COUNT(*) as total
      FROM race_runners rr
      WHERE rr.horse_id = ?
    `).get(horseId);

    if (!roiData || roiData.total === 0) {
      return { winROI: 0, placeROI: 0, bets: 0 };
    }

    // Calculate ROI as win/place rates (not profit - use strike_rate instead)
    const winROI = roiData.total > 0 ? (roiData.win_count / roiData.total) : 0;
    const placeROI = roiData.total > 0 ? (roiData.place_count / roiData.total) : 0;

    return {
      winROI: Math.max(0, Math.min(1, winROI)),
      placeROI: Math.max(0, Math.min(1, placeROI)),
      bets: roiData.total,
      sampleSize: roiData.total >= 20 ? 'confident' : roiData.total >= 10 ? 'moderate' : 'low'
    };
  }

  static predictWinProbability(horseId, raceId) {
    const race = db.prepare('SELECT distance, condition, track_condition FROM races WHERE id = ?').get(raceId);
    const horse = db.prepare(`
      SELECT strike_rate, place_rate, roi, form_score, class_rating, avg_odds, career_bets
      FROM horses WHERE id = ?
    `).get(horseId);

    if (!horse) return 0;

    let probability = 0;

    // 1. SKIP ROI signals (removed due to unreliable betting data)
    // Previously used bets table which contained failed April 12 betting experiment
    // Now using strike_rate directly as primary signal instead

    // 2. Form trend detection (20%) - momentum vs fading (replaces static form)
    const formTrend = this.getFormTrend(horseId);
    const recentRaces = db.prepare(`
      SELECT
        COUNT(CASE WHEN result = 'WIN' THEN 1 END) * 1.0 / COUNT(*) as recent_win_rate,
        COUNT(*) as count
      FROM (
        SELECT result FROM race_runners
        WHERE horse_id = ? AND result IS NOT NULL
        ORDER BY race_id DESC LIMIT 10
      )
    `).get(horseId);

    if (recentRaces?.count > 0) {
      const baseForm = (recentRaces.recent_win_rate || 0);
      const trendAdjustedForm = baseForm + formTrend.trend; // Apply trend adjustment
      probability += Math.min(0.20, Math.max(0, trendAdjustedForm * 0.20));
    } else {
      const sr = (horse.strike_rate || 15) > 1 ? horse.strike_rate / 100 : (horse.strike_rate || 0.15);
      probability += Math.min(0.10, sr * 0.20);
    }

    // 3. Place rate consistency (18%) - close finishes predict future wins
    const placeRate = horse.place_rate ?? 0.30;
    probability += Math.min(0.18, placeRate * 0.18);

    // 4. Barrier analysis (8%) - track-specific barrier suitability
    const barrierAnalysis = this.getBarrierAnalysis(horseId, raceId);
    probability += barrierAnalysis.barrierSignal;

    // 4b. Track condition suitability (3%) - how well horse performs in current conditions
    const conditionAnalysis = this.getTrackConditionAnalysis(horseId, raceId);
    if (conditionAnalysis.suitability !== 'unknown' && conditionAnalysis.suitability !== 'insufficient_data') {
      probability += conditionAnalysis.conditionSignal;
    }

    // 5. Market consensus via avg_odds (15%) - market-implied probability
    // Lower odds = market thinks horse wins more
    if (horse.avg_odds && horse.avg_odds > 0) {
      const marketImplied = 1 / horse.avg_odds;
      probability += Math.min(0.15, marketImplied * 0.15);
    } else {
      probability += 0.05; // neutral default when no market data
    }

    // 5. Distance preference (10%) - race-specific fit
    if (race?.distance) {
      const distanceMatches = db.prepare(`
        SELECT COUNT(CASE WHEN rr.result = 'WIN' THEN 1 END) as wins,
               COUNT(*) as total
        FROM race_runners rr
        JOIN races r ON rr.race_id = r.id
        WHERE rr.horse_id = ? AND r.distance = ?
      `).get(horseId, race.distance);

      if (distanceMatches?.total > 0) {
        const distanceSR = distanceMatches.wins / distanceMatches.total;
        probability += Math.min(0.10, distanceSR * 0.10);
      }
    }

    // 6. Class rating bonus (5%) - competition quality
    if (horse.class_rating) {
      const classSignal = Math.min(1, horse.class_rating / 100);
      probability += Math.min(0.05, classSignal * 0.05);
    }

    // 7. Track condition fit bonus (5%) - horse performance on current condition
    if (race?.track_condition) {
      const trackConditionMatches = db.prepare(`
        SELECT COUNT(CASE WHEN rr.result = 'WIN' THEN 1 END) as wins,
               COUNT(*) as total
        FROM race_runners rr
        JOIN races r ON rr.race_id = r.id
        WHERE rr.horse_id = ? AND r.track_condition = ?
      `).get(horseId, race.track_condition);

      if (trackConditionMatches?.total > 2) {
        const conditionWinRate = trackConditionMatches.wins / trackConditionMatches.total;
        probability += Math.min(0.05, conditionWinRate * 0.05);
      }
    }

    // Final cap ensures probability never exceeds 1.0
    return Math.min(1.0, Math.max(0, probability));
  }

  /**
   * Predict jockey contribution to win probability
   */
  static predictJockeyContribution(jockeyId) {
    if (!jockeyId) return 0;

    const jockey = db.prepare(`
      SELECT strike_rate FROM jockeys WHERE id = ?
    `).get(jockeyId);

    return (jockey?.strike_rate || 0.20) * 0.5;
  }

  /**
   * Predict trainer contribution to win probability
   */
  static predictTrainerContribution(trainerId) {
    if (!trainerId) return 0;

    const trainer = db.prepare(`
      SELECT strike_rate FROM trainers WHERE id = ?
    `).get(trainerId);

    return (trainer?.strike_rate || 0.20) * 0.3;
  }

  /**
   * Calculate Expected Value for a bet
   * EV = (Probability of Win × Odds) - 1
   * Positive EV means profitable in the long run
   *
   * For PLACE bets, adjust probability and odds:
   * - Place pays 1/4 of odds (roughly), win prob ~3x higher
   */
  static calculateExpectedValue(probability, odds, betType = 'WIN') {
    if (!odds || odds <= 0 || probability <= 0) return null;

    let adjProb = probability;
    let adjOdds = odds;

    if (betType === 'PLACE') {
      // PLACE: roughly 3x win probability, pays 1/4 of odds
      adjProb = Math.min(1, probability * 3);
      adjOdds = (odds - 1) / 4 + 1;
    }

    const ev = (adjProb * adjOdds) - 1;
    return parseFloat(ev.toFixed(3));
  }

  /**
   * Predict field strength (how competitive the race is)
   * Returns average strike rate of runners
   */
  static predictFieldStrength(raceId) {
    const runners = db.prepare(`
      SELECT COUNT(*) as cnt,
             AVG(h.strike_rate) as avg_sr
      FROM race_runners rr
      JOIN horses h ON rr.horse_id = h.id
      WHERE rr.race_id = ?
    `).get(raceId);

    return runners?.avg_sr || 0.15;
  }

  /**
   * Generate picks with predicted probabilities and EV
   * This is the main method for generating picks
   */
  static generatePicksWithPredictions(raceId) {
    const race = db.prepare(`
      SELECT id, track, race_number, distance, condition, track_condition
      FROM races WHERE id = ?
    `).get(raceId);

    if (!race) return [];

    // OPTIMIZATION: Batch-load all data at once instead of per-runner queries
    const runners = db.prepare(`
      SELECT
        rr.id as runner_id,
        rr.horse_id,
        rr.jockey_id,
        rr.trainer_id,
        rr.barrier,
        rr.starting_odds as odds,
        h.name as horse,
        h.strike_rate,
        h.place_rate,
        j.name as jockey,
        t.name as trainer
      FROM race_runners rr
      JOIN horses h ON rr.horse_id = h.id
      LEFT JOIN jockeys j ON rr.jockey_id = j.id
      LEFT JOIN trainers t ON rr.trainer_id = t.id
      WHERE rr.race_id = ?
    `).all(raceId);

    if (runners.length === 0) return [];

    // OPTIMIZATION: Pre-compute all horse stats once, reuse for all runners
    const horseStats = {};
    for (const runner of runners) {
      if (!horseStats[runner.horse_id]) {
        const stats = db.prepare(`
          SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
            COUNT(CASE WHEN result = 'PLACE' THEN 1 END) as places
          FROM race_runners
          WHERE horse_id = ?
        `).get(runner.horse_id);
        horseStats[runner.horse_id] = stats;
      }
    }

    // OPTIMIZATION: Batch-load jockey stats (cache per-runner instead of querying)
    const jockeyStats = {};
    for (const runner of runners) {
      if (runner.jockey_id && !jockeyStats[runner.jockey_id]) {
        const jStat = db.prepare(`
          SELECT COUNT(*) as total, COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins
          FROM race_runners WHERE jockey_id = ?
        `).get(runner.jockey_id);
        jockeyStats[runner.jockey_id] = (jStat.total > 0 ? jStat.wins / jStat.total : 0) * 0.1;
      }
    }

    // OPTIMIZATION: Batch-load trainer stats (cache per-runner instead of querying)
    const trainerStats = {};
    for (const runner of runners) {
      if (runner.trainer_id && !trainerStats[runner.trainer_id]) {
        const tStat = db.prepare(`
          SELECT COUNT(*) as total, COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins
          FROM race_runners WHERE trainer_id = ?
        `).get(runner.trainer_id);
        trainerStats[runner.trainer_id] = (tStat.total > 0 ? tStat.wins / tStat.total : 0) * 0.05;
      }
    }

    const picks = runners
      .map(runner => {
        // Use cached strike_rate as baseline probability
        const baseProb = Math.min(1.0, (runner.strike_rate || 0.06));

        // Apply jockey bonus (cached)
        const jockeyBonus = jockeyStats[runner.jockey_id] || 0;
        const trainerBonus = trainerStats[runner.trainer_id] || 0;

        const jockeyFactor = 1 + jockeyBonus;
        const trainerFactor = 1 + trainerBonus;
        const totalProb = Math.min(1.0, baseProb * jockeyFactor * trainerFactor);

        const evWin = this.calculateExpectedValue(totalProb, runner.odds, 'WIN');
        const evPlace = this.calculateExpectedValue(totalProb, runner.odds, 'PLACE');

        const bestBet = evPlace && evPlace > (evWin || -999) ? 'PLACE' : 'WIN';
        return {
          runner_id: runner.runner_id,
          horse: runner.horse,
          jockey: runner.jockey,
          trainer: runner.trainer,
          odds: runner.odds,
          predicted_win_prob: parseFloat((totalProb * 100).toFixed(1)),
          ev_win: evWin,
          ev_place: evPlace,
          best_bet: bestBet,
          recommendation: this.getRecommendation(totalProb, evWin, evPlace, bestBet, runner.odds)
        };
      })
      .sort((a, b) => {
        const evA = Math.max(a.ev_win || -999, a.ev_place || -999);
        const evB = Math.max(b.ev_win || -999, b.ev_place || -999);
        return evB - evA;
      });

    return picks;
  }

  /**
   * Get betting recommendation based on EV and probability
   * Now considers WIN vs PLACE profitability separately
   */
  static getRecommendation(probability, evWin, evPlace, betType = 'WIN', odds) {
    const ev = betType === 'PLACE' ? evPlace : evWin;

    if (!ev || !odds) return 'INSUFFICIENT_ODDS';
    if (ev < 0.05) return 'SKIP'; // No edge
    if (probability < 0.10) return 'SKIP'; // Too risky

    // Prefer PLACE if it has better EV and good odds
    if (evPlace && evWin && evPlace > evWin + 0.05) {
      return evPlace > 0.15 ? 'BUY_PLACE' : evPlace > 0.05 ? 'HOLD_PLACE' : 'SKIP';
    }

    // WIN recommendations
    if (ev > 0.30 && probability > 0.20) return 'STRONG_BUY';
    if (ev > 0.15 && probability > 0.15) return 'BUY';
    if (ev > 0.05) return 'HOLD';
    return 'SKIP';
  }

  /**
   * Analyze prediction accuracy (for backtesting)
   * Compare predicted probability vs actual results
   */
  static analyzeAccuracy(raceDates = null) {
    const query = raceDates
      ? `
        SELECT
          COUNT(*) as total_predictions,
          SUM(CASE WHEN result = 'W' THEN 1 ELSE 0 END) as actual_wins,
          AVG(predicted_prob) as avg_predicted_prob,
          AVG(CASE WHEN result = 'W' THEN 1.0 ELSE 0.0 END) as actual_win_rate
        FROM (
          SELECT
            rr.result,
            h.strike_rate as predicted_prob
          FROM race_runners rr
          JOIN horses h ON rr.horse_id = h.id
          JOIN races r ON rr.race_id = r.id
          WHERE r.date BETWEEN ? AND ?
        )
      `
      : `
        SELECT
          COUNT(*) as total_predictions,
          SUM(CASE WHEN result = 'W' THEN 1 ELSE 0 END) as actual_wins,
          AVG(h.strike_rate) as avg_predicted_prob,
          AVG(CASE WHEN rr.result = 'W' THEN 1.0 ELSE 0.0 END) as actual_win_rate
        FROM race_runners rr
        JOIN horses h ON rr.horse_id = h.id
      `;

    const stmt = db.prepare(query);
    const accuracy = raceDates ? stmt.get(raceDates[0], raceDates[1]) : stmt.get();

    return {
      total_predictions: accuracy.total_predictions,
      actual_wins: accuracy.actual_wins,
      win_rate: parseFloat(((accuracy.actual_wins / accuracy.total_predictions) * 100).toFixed(2)),
      avg_predicted_prob: parseFloat((accuracy.avg_predicted_prob * 100).toFixed(2)),
      calibration_error: parseFloat(Math.abs(
        (accuracy.actual_win_rate * 100) - (accuracy.avg_predicted_prob * 100)
      ).toFixed(2))
    };
  }
}

export default RacePredictor;
