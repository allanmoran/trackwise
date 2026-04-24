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
