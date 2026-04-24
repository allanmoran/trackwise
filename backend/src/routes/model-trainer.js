/**
 * Model Training Routes
 * Endpoints for analyzing prediction accuracy and retraining the model
 */

import express from 'express';
import { ModelRetrainer } from '../ml/retrainer.js';

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

export default router;
