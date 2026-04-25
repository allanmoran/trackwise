/**
 * Model Training Routes
 * Endpoints for analyzing prediction accuracy and retraining the model
 */

import express from 'express';
import { ModelRetrainer } from '../ml/retrainer.js';
import ABTester from '../ml/ab-tester.js';

const router = express.Router();

/**
 * GET /api/model/accuracy
 * Analyze prediction accuracy from settled bets
 */
router.get('/accuracy', (req, res) => {
  try {
    const accuracy = ModelRetrainer.analyzeAccuracy();

    if (!accuracy) {
      return res.json({
        success: false,
        message: 'No settled bets available for analysis'
      });
    }

    res.json({
      success: true,
      data: accuracy
    });
  } catch (err) {
    console.error('Accuracy analysis error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/model/calibration
 * Analyze model calibration and get adjustment recommendations
 */
router.get('/calibration', (req, res) => {
  try {
    const calibration = ModelRetrainer.calibrateConfidenceScores();

    res.json({
      success: true,
      data: calibration
    });
  } catch (err) {
    console.error('Calibration error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/model/recommendations
 * Get improvement recommendations based on prediction accuracy
 */
router.get('/recommendations', (req, res) => {
  try {
    const recommendations = ModelRetrainer.getImprovementRecommendations();

    res.json({
      success: true,
      recommendations,
      count: recommendations.length
    });
  } catch (err) {
    console.error('Recommendations error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/model/report
 * Generate complete model performance report
 */
router.get('/report', (req, res) => {
  try {
    const report = ModelRetrainer.generateFullReport();

    console.log('\n📊 Model Report Generated');
    console.log(`   Period: ${report.period}`);
    console.log(`   Accuracy: ${report.accuracy?.strikeRate}%`);
    console.log(`   Calibration: ${report.calibration?.calibrationAdjustment}%`);
    console.log(`   Recommendations: ${report.recommendations?.length || 0}`);

    res.json({
      success: true,
      report
    });
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/model/retrain
 * Manually trigger model retraining (usually automatic after results)
 */
router.post('/retrain', (req, res) => {
  try {
    console.log('\n🔄 Manual Model Retrain Triggered');

    // Generate full analysis
    const report = ModelRetrainer.generateFullReport();

    // Log key findings
    if (report.accuracy) {
      console.log(`✅ Analysis Complete:`);
      console.log(`   Total bets analyzed: ${report.accuracy.totalBets}`);
      console.log(`   Actual strike rate: ${report.accuracy.strikeRate}%`);
      console.log(`   Win/Place/Loss: ${report.accuracy.wins}/${report.accuracy.places}/${report.accuracy.losses}`);
    }

    if (report.calibration && report.calibration.success) {
      console.log(`\n🎯 Calibration:`);
      console.log(`   Expected: ${report.calibration.expectedStrikeRate}%`);
      console.log(`   Actual: ${report.calibration.actualStrikeRate}%`);
      console.log(`   Adjustment: ${report.calibration.calibrationAdjustment}%`);
    }

    if (report.recommendations && report.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      report.recommendations.forEach((rec, idx) => {
        console.log(`   ${idx + 1}. [${rec.priority}] ${rec.message}`);
      });
    }

    res.json({
      success: true,
      message: 'Model retraining complete',
      report
    });
  } catch (err) {
    console.error('Retraining error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * PHASE 4C: GET /api/model/ab-results
 * Analyze A/B test results across variants
 */
router.get('/ab-results', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const results = ABTester.analyzeResults(days);

    res.json({
      success: true,
      data: results
    });
  } catch (err) {
    console.error('A/B test analysis error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * PHASE 4C: GET /api/model/ab-status
 * Get A/B test assignment counts
 */
router.get('/ab-status', (req, res) => {
  try {
    const status = ABTester.getTestStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (err) {
    console.error('A/B test status error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * PHASE 4D: GET /api/model/optimize-weights
 * Run coordinate descent to optimize ensemble weights
 */
router.get('/optimize-weights', (req, res) => {
  try {
    const minSamples = parseInt(req.query.minSamples) || 50;
    const result = ModelRetrainer.optimizeWeights(minSamples);

    res.json({
      success: result.success,
      data: result
    });
  } catch (err) {
    console.error('Weight optimization error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * PHASE 4D: POST /api/model/apply-weights
 * Apply recommended weights to model_weights table (manual approval required)
 */
router.post('/apply-weights', (req, res) => {
  try {
    const { weights } = req.body;

    if (!weights || !weights.form || !weights.market || !weights.kb) {
      return res.status(400).json({
        success: false,
        error: 'Invalid weights object - must have form, market, kb properties'
      });
    }

    // Verify weights sum to ~1.0
    const total = parseFloat(weights.form) + parseFloat(weights.market) + parseFloat(weights.kb);
    if (Math.abs(total - 1.0) > 0.001) {
      return res.status(400).json({
        success: false,
        error: `Weights must sum to 1.0, got ${total.toFixed(4)}`
      });
    }

    const result = ModelRetrainer.applyOptimizedWeights(weights);

    res.json({
      success: result.success,
      message: result.message,
      data: result.weights
    });
  } catch (err) {
    console.error('Weight application error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
