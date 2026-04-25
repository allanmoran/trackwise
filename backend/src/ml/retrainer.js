/**
 * Model Retrainer
 * Analyzes prediction accuracy and adjusts confidence scores
 * Uses settled bet results to improve future picks
 */

import db from '../db.js';

export class ModelRetrainer {
  /**
   * Analyze prediction accuracy from settled bets
   * Returns metrics for model improvement
   */
  static analyzeAccuracy() {
    const settledBets = db.prepare(`
      SELECT
        b.id,
        b.horse_id,
        b.jockey_id,
        b.trainer_id,
        b.confidence,
        b.result,
        b.ev_percent,
        h.name as horse,
        j.name as jockey,
        t.name as trainer,
        CASE
          WHEN b.result = 'WIN' THEN 1
          WHEN b.result = 'PLACE' THEN 0.5
          ELSE 0
        END as outcome_score
      FROM bets b
      JOIN horses h ON b.horse_id = h.id
      JOIN jockeys j ON b.jockey_id = j.id
      JOIN trainers t ON b.trainer_id = t.id
      WHERE b.result IS NOT NULL
      ORDER BY b.placed_at DESC
      LIMIT 100
    `).all();

    if (settledBets.length === 0) {
      return null;
    }

    // Calculate overall metrics
    const wins = settledBets.filter(b => b.result === 'WIN').length;
    const places = settledBets.filter(b => b.result === 'PLACE').length;
    const losses = settledBets.filter(b => b.result === 'LOSS').length;
    const actualStrikeRate = wins / settledBets.length;

    // Accuracy by confidence level
    const byConfidence = {};
    for (const bet of settledBets) {
      const confBucket = Math.floor(bet.confidence / 10) * 10;
      if (!byConfidence[confBucket]) {
        byConfidence[confBucket] = {
          count: 0,
          wins: 0,
          places: 0,
          avgEV: 0,
          avgOutcome: 0
        };
      }
      byConfidence[confBucket].count++;
      if (bet.result === 'WIN') byConfidence[confBucket].wins++;
      if (bet.result === 'PLACE') byConfidence[confBucket].places++;
      byConfidence[confBucket].avgEV += bet.ev_percent || 0;
      byConfidence[confBucket].avgOutcome += bet.outcome_score;
    }

    // Calculate accuracy per confidence bucket
    const accuracyByConfidence = {};
    for (const [conf, data] of Object.entries(byConfidence)) {
      accuracyByConfidence[conf] = {
        ...data,
        strikeRate: (data.wins / data.count * 100).toFixed(1),
        placeRate: ((data.wins + data.places) / data.count * 100).toFixed(1),
        avgEV: (data.avgEV / data.count).toFixed(3),
        avgOutcome: (data.avgOutcome / data.count).toFixed(2)
      };
    }

    // Identify best and worst confidence levels
    let bestConfidence = null;
    let worstConfidence = null;
    let bestAccuracy = -1;
    let worstAccuracy = 2;

    for (const [conf, data] of Object.entries(accuracyByConfidence)) {
      const accuracy = parseFloat(data.strikeRate);
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy;
        bestConfidence = conf;
      }
      if (accuracy < worstAccuracy) {
        worstAccuracy = accuracy;
        worstConfidence = conf;
      }
    }

    return {
      totalBets: settledBets.length,
      wins,
      places,
      losses,
      strikeRate: (actualStrikeRate * 100).toFixed(1),
      placeRate: (((wins + places) / settledBets.length) * 100).toFixed(1),
      bestConfidenceBucket: bestConfidence,
      bestAccuracy: bestAccuracy.toFixed(1),
      worstConfidenceBucket: worstConfidence,
      worstAccuracy: worstAccuracy.toFixed(1),
      accuracyByConfidence
    };
  }

  /**
   * Calculate horse prediction accuracy
   * How often did we pick winners for this horse?
   */
  static getHorseAccuracy(horseId) {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as bets,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
        AVG(confidence) as avg_confidence,
        AVG(ev_percent) as avg_ev,
        h.strike_rate,
        h.form_score
      FROM bets b
      JOIN horses h ON b.horse_id = h.id
      WHERE b.horse_id = ? AND b.result IS NOT NULL
      GROUP BY h.id
    `).get(horseId);

    if (!stats || stats.bets === 0) {
      return null;
    }

    const predictedAccuracy = stats.avg_confidence;
    const actualAccuracy = (stats.wins / stats.bets) * 100;
    const calibration = actualAccuracy - predictedAccuracy;

    return {
      horseId,
      bets: stats.bets,
      wins: stats.wins,
      actualAccuracy: actualAccuracy.toFixed(1),
      predictedAccuracy: predictedAccuracy.toFixed(1),
      calibration: calibration.toFixed(1),
      strikeRate: (stats.strike_rate * 100).toFixed(1),
      formScore: stats.form_score
    };
  }

  /**
   * Adjust global confidence scores based on model accuracy
   * If predicted 34% but got 45%, boost future predictions by +11%
   */
  static calibrateConfidenceScores() {
    const accuracy = this.analyzeAccuracy();
    if (!accuracy) {
      return { message: 'No settled bets to analyze' };
    }

    // Get expected vs actual accuracy
    const expectedStrikeRate = 0.34; // Current model baseline
    const actualStrikeRate = accuracy.wins / accuracy.totalBets;
    const calibrationFactor = actualStrikeRate - expectedStrikeRate;

    console.log(`\n🎯 Model Calibration:`);
    console.log(`   Expected Strike Rate: ${(expectedStrikeRate * 100).toFixed(1)}%`);
    console.log(`   Actual Strike Rate: ${(actualStrikeRate * 100).toFixed(1)}%`);
    console.log(`   Calibration Adjustment: ${(calibrationFactor * 100).toFixed(1)}%`);

    // Calculate per-horse adjustments
    const horseAdjustments = [];
    const horses = db.prepare(`
      SELECT DISTINCT horse_id FROM bets WHERE result IS NOT NULL
    `).all();

    for (const { horse_id } of horses) {
      const horseAcc = this.getHorseAccuracy(horse_id);
      if (horseAcc) {
        horseAdjustments.push(horseAcc);
      }
    }

    // Find horses with poor calibration (predicted high but got low)
    const poorCalibration = horseAdjustments
      .filter(h => Math.abs(parseFloat(h.calibration)) > 5)
      .sort((a, b) => Math.abs(parseFloat(b.calibration)) - Math.abs(parseFloat(a.calibration)))
      .slice(0, 5);

    console.log(`\n📊 Horses with Poor Calibration (Top 5):`);
    for (const horse of poorCalibration) {
      console.log(`   ${horse.horseId}: Predicted ${horse.predictedAccuracy}%, Got ${horse.actualAccuracy}% (${horse.calibration}%)`);
    }

    return {
      success: true,
      totalBets: accuracy.totalBets,
      expectedStrikeRate: (expectedStrikeRate * 100).toFixed(1),
      actualStrikeRate: (actualStrikeRate * 100).toFixed(1),
      calibrationAdjustment: (calibrationFactor * 100).toFixed(1),
      horsesAnalyzed: horseAdjustments.length,
      poorCalibration: poorCalibration.map(h => ({
        horseId: h.horseId,
        calibration: parseFloat(h.calibration)
      }))
    };
  }

  /**
   * Generate improvement recommendations based on accuracy analysis
   */
  static getImprovementRecommendations() {
    const accuracy = this.analyzeAccuracy();
    if (!accuracy) {
      return [];
    }

    const recommendations = [];

    // If low accuracy, check confidence buckets
    const actualStrikeRate = parseFloat(accuracy.strikeRate);
    if (actualStrikeRate < 20) {
      recommendations.push({
        type: 'REDUCE_CONFIDENCE',
        message: `Strike rate is ${actualStrikeRate.toFixed(1)}%, consider reducing confidence scores`,
        priority: 'HIGH'
      });
    }

    // Check if high confidence bets underperformed
    const topConfidenceBucket = accuracy.accuracyByConfidence['30'];
    if (topConfidenceBucket && parseFloat(topConfidenceBucket.strikeRate) < 25) {
      recommendations.push({
        type: 'REVIEW_HIGH_CONFIDENCE',
        message: 'High-confidence picks (30%+) only hitting 25%, review feature weighting',
        priority: 'HIGH'
      });
    }

    // Check for positive EV correlation
    const highEVBets = db.prepare(`
      SELECT
        COUNT(*) as count,
        SUM(CASE WHEN result IN ('WIN', 'PLACE') THEN 1 ELSE 0 END) as hits
      FROM bets
      WHERE result IS NOT NULL AND ev_percent > 0.05
    `).get();

    if (highEVBets?.count > 0) {
      const highEVAccuracy = (highEVBets.hits / highEVBets.count) * 100;
      if (highEVAccuracy > actualStrikeRate + 5) {
        recommendations.push({
          type: 'PRIORITIZE_EV',
          message: `High-EV bets (>5%) hitting ${highEVAccuracy.toFixed(1)}%, prioritize EV-based selection`,
          priority: 'MEDIUM'
        });
      }
    }

    return recommendations;
  }

  /**
   * PHASE 2C: Calibration factor by confidence bucket
   * Returns actual_rate / predicted_rate correction for each confidence band
   */
  static getCalibrationFactor(confidenceBucket) {
    const prediction_logs = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins
      FROM prediction_logs
      WHERE confidence >= ? AND confidence < ?
    `).get(confidenceBucket, confidenceBucket + 10);

    if (!prediction_logs || prediction_logs.total < 20) {
      return 1.0; // Not enough data, return neutral
    }

    const actualRate = prediction_logs.wins / prediction_logs.total;
    const predictedRate = (confidenceBucket + 5) / 100; // Use bucket midpoint

    const factor = actualRate / Math.max(0.01, predictedRate);
    return Math.min(2.0, Math.max(0.5, factor)); // Cap between 0.5x and 2.0x
  }

  /**
   * PHASE 4: Detect model drift
   * Compare actual win rate vs expected over rolling window
   */
  static detectModelDrift(windowDays = 14) {
    const prediction_logs = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
        AVG(confidence) as avg_confidence
      FROM prediction_logs
      WHERE logged_at > datetime('now', '-' || ? || ' days')
    `).get(windowDays);

    if (!prediction_logs || prediction_logs.total < 30) {
      return { drifting: false, reason: 'Insufficient data' };
    }

    const actualWR = prediction_logs.wins / prediction_logs.total;
    const expectedWR = prediction_logs.avg_confidence / 100;
    const drift = Math.abs(actualWR - expectedWR);

    return {
      drifting: drift > 0.08,
      drift: (drift * 100).toFixed(1),
      threshold: '8%',
      actualRate: (actualWR * 100).toFixed(1),
      expectedRate: (expectedWR * 100).toFixed(1),
      samples: prediction_logs.total
    };
  }

  /**
   * Track-specific performance scoring
   */
  static getTrackPerformanceScore(trackName) {
    const query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result IN ('WIN', 'PLACE') THEN 1 ELSE 0 END) as hits,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins
      FROM bets b
      JOIN races r ON b.race_id = r.id
      WHERE r.track = ? AND b.placed_at > datetime('now', '-90 days') AND b.result IS NOT NULL
    `;

    const stats = db.prepare(query).get(trackName);
    if (!stats || stats.total === 0) {
      return 1.0; // Neutral score if no data
    }

    const roi = (stats.hits - stats.total) / stats.total;
    const score = Math.max(0.5, Math.min(1.5, 1.0 + roi));

    return score;
  }

  /**
   * PHASE 4D: Optimize ensemble model weights using coordinate descent
   * Minimizes Brier score loss over recent prediction_logs
   * Returns recommended weights for manual review - never auto-applies
   */
  static optimizeWeights(minSamples = 50) {
    try {
      // Fetch recent predictions
      const predictions = db.prepare(`
        SELECT
          confidence,
          CASE WHEN result = 'WIN' THEN 1 ELSE 0 END as outcome
        FROM prediction_logs
        WHERE logged_at > datetime('now', '-30 days')
        ORDER BY logged_at DESC
        LIMIT 500
      `).all();

      if (predictions.length < minSamples) {
        return {
          success: false,
          message: `Insufficient data: ${predictions.length} samples < ${minSamples} required`,
          samplesFound: predictions.length,
          samplesRequired: minSamples
        };
      }

      // Initial weights (current ensemble defaults)
      let weights = {
        form: 0.45,
        market: 0.35,
        kb: 0.20
      };

      const learningRate = 0.01;
      const maxIterations = 100;
      let iteration = 0;
      let prevLoss = Infinity;
      const losses = [];

      // Coordinate descent: optimize one weight at a time
      for (iteration = 0; iteration < maxIterations; iteration++) {
        const currentLoss = this._calculateBrierScore(predictions, weights);
        losses.push(currentLoss);

        // Check convergence
        if (Math.abs(prevLoss - currentLoss) < 0.0001) {
          break;
        }
        prevLoss = currentLoss;

        // Update each weight
        for (const key of ['form', 'market', 'kb']) {
          const original = weights[key];

          // Try increasing
          weights[key] = original + learningRate;
          this._normalizeWeights(weights);
          const lossUp = this._calculateBrierScore(predictions, weights);

          // Try decreasing
          weights[key] = original - learningRate;
          this._normalizeWeights(weights);
          const lossDown = this._calculateBrierScore(predictions, weights);

          // Keep best direction
          if (lossUp < lossDown && lossUp < currentLoss) {
            weights[key] = original + learningRate;
          } else if (lossDown < currentLoss) {
            weights[key] = original - learningRate;
          } else {
            weights[key] = original;
          }
          this._normalizeWeights(weights);
        }
      }

      // Final normalization
      this._normalizeWeights(weights);
      const finalLoss = this._calculateBrierScore(predictions, weights);

      // Get current weights for comparison
      const currentWeights = db.prepare(`
        SELECT model_name, weight FROM model_weights
      `).all();
      const current = Object.fromEntries(currentWeights.map(w => [w.model_name, w.weight]));

      const improvement = ((prevLoss - finalLoss) / prevLoss * 100).toFixed(1);

      return {
        success: true,
        samples: predictions.length,
        iterations: iteration,
        convergenceImprovement: improvement + '%',
        current,
        recommended: {
          form: weights.form.toFixed(4),
          market: weights.market.toFixed(4),
          kb: weights.kb.toFixed(4)
        },
        losses: {
          initial: losses[0]?.toFixed(4),
          final: finalLoss.toFixed(4),
          improvement
        },
        recommendation: this._getWeightRecommendation(current, weights),
        nextStep: 'Review recommendation and call POST /api/model/apply-weights to adopt'
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Calculate Brier score (mean squared error between predicted & actual)
   */
  static _calculateBrierScore(predictions, weights) {
    let sumSquaredError = 0;

    for (const pred of predictions) {
      const predicted = Math.min(1.0, pred.confidence / 100); // Normalize to 0-1
      const actual = pred.outcome; // 0 or 1
      const squaredError = Math.pow(predicted - actual, 2);
      sumSquaredError += squaredError;
    }

    return sumSquaredError / predictions.length;
  }

  /**
   * Normalize weights to sum to 1.0
   */
  static _normalizeWeights(weights) {
    const total = weights.form + weights.market + weights.kb;
    weights.form /= total;
    weights.market /= total;
    weights.kb /= total;
  }

  /**
   * Generate recommendation based on weight changes
   */
  static _getWeightRecommendation(current, recommended) {
    const changes = {
      form: ((recommended.form - current.form) / current.form * 100).toFixed(1),
      market: ((recommended.market - current.market) / current.market * 100).toFixed(1),
      kb: ((recommended.kb - current.kb) / current.kb * 100).toFixed(1)
    };

    const recs = [];
    if (Math.abs(parseFloat(changes.form)) > 5) {
      recs.push(`Form weight ${changes.form > 0 ? 'increase' : 'decrease'} by ${Math.abs(changes.form)}%`);
    }
    if (Math.abs(parseFloat(changes.market)) > 5) {
      recs.push(`Market weight ${changes.market > 0 ? 'increase' : 'decrease'} by ${Math.abs(changes.market)}%`);
    }
    if (Math.abs(parseFloat(changes.kb)) > 5) {
      recs.push(`KB weight ${changes.kb > 0 ? 'increase' : 'decrease'} by ${Math.abs(changes.kb)}%`);
    }

    return recs.length > 0 ? recs.join('; ') : 'Current weights are optimal';
  }

  /**
   * Apply recommended weights to model_weights table
   */
  static applyOptimizedWeights(weights) {
    try {
      for (const [model, weight] of Object.entries(weights)) {
        db.prepare(`
          UPDATE model_weights
          SET weight = ?, updated_at = datetime('now')
          WHERE model_name = ?
        `).run(weight, model);
      }
      return { success: true, message: 'Weights applied', weights };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Generate full model report
   */
  static generateFullReport() {
    const accuracy = this.analyzeAccuracy();
    const calibration = this.calibrateConfidenceScores();
    const recommendations = this.getImprovementRecommendations();

    const report = {
      timestamp: new Date().toISOString(),
      period: 'Last 100 settled bets',
      accuracy,
      calibration,
      recommendations,
      nextSteps: [
        'Review recommendations and adjust model parameters',
        'Monitor next 50 bets to validate improvements',
        'Retrain model if calibration > ±10%'
      ]
    };

    return report;
  }
}

export default ModelRetrainer;
