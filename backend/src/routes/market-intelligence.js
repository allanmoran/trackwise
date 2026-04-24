/**
 * Market Intelligence Routes
 * Real-time analysis of market movements, BSP prediction, and informed betting detection
 */

import express from 'express';
import { MarketIntelligence } from '../ml/market-intelligence.js';

const router = express.Router();

/**
 * GET /api/intelligence/market-movement/:horseId
 * Analyze historical market movement patterns for a horse
 * Shows how price typically moves when horse wins/loses
 */
router.get('/market-movement/:horseId', (req, res) => {
  try {
    const horseId = parseInt(req.params.horseId);
    const analysis = MarketIntelligence.analyzeMarketMovement(horseId);

    res.json({
      success: true,
      analysis
    });
  } catch (err) {
    console.error('Market movement analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/intelligence/bsp-prediction/:horseId/:openingOdds
 * Predict final BSP from opening odds using historical patterns
 * Returns predicted BSP, confidence level, and expected range
 */
router.get('/bsp-prediction/:horseId/:openingOdds', (req, res) => {
  try {
    const horseId = parseInt(req.params.horseId);
    const openingOdds = parseFloat(req.params.openingOdds);

    if (!openingOdds || openingOdds < 1.01) {
      return res.status(400).json({ error: 'Invalid opening odds (must be ≥ 1.01)' });
    }

    const prediction = MarketIntelligence.predictBSP(horseId, openingOdds);

    res.json({
      success: true,
      prediction
    });
  } catch (err) {
    console.error('BSP prediction error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/intelligence/informed-betting/:raceId
 * Detect informed betting signals in a race
 * Shows the "#theyknow" phenomenon - when professionals reveal information
 */
router.get('/informed-betting/:raceId', (req, res) => {
  try {
    const raceId = parseInt(req.params.raceId);
    const signals = MarketIntelligence.detectInformedBetting(raceId);

    res.json({
      success: true,
      signals
    });
  } catch (err) {
    console.error('Informed betting detection error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/intelligence/analyze-with-signals
 * Enhanced race analysis combining feature engineering with market signals
 * Returns picks with market-boosted confidence scores
 */
router.post('/analyze-with-signals', (req, res) => {
  try {
    const { raceId, picks } = req.body;

    if (!raceId || !picks || !Array.isArray(picks)) {
      return res.status(400).json({ error: 'raceId and picks array required' });
    }

    // Enhance each pick with market intelligence
    const enhancedPicks = picks.map(pick => {
      const boost = MarketIntelligence.getConfidenceBoost(
        pick.horseId,
        pick.odds || 2.0,
        pick.confidence || 50
      );

      return {
        ...pick,
        marketIntelligence: {
          originalConfidence: pick.confidence,
          boostedConfidence: parseInt(boost.boostedConfidence),
          boost: parseFloat(boost.boost),
          reason: boost.reason
        }
      };
    });

    // Sort by boosted confidence
    enhancedPicks.sort((a, b) =>
      (b.marketIntelligence?.boostedConfidence || 0) -
      (a.marketIntelligence?.boostedConfidence || 0)
    );

    res.json({
      success: true,
      raceId,
      originalPicks: picks.length,
      enhancedPicks,
      summary: {
        avgBoost: (enhancedPicks.reduce((sum, p) =>
          sum + (p.marketIntelligence?.boost || 0), 0) / enhancedPicks.length).toFixed(1),
        topPick: enhancedPicks[0],
        recommendation: enhancedPicks[0]?.marketIntelligence?.reason || 'Insufficient data'
      }
    });
  } catch (err) {
    console.error('Enhanced analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/intelligence/race-signals/:raceId
 * Quick view of informed betting signals for a race
 * Good for pre-race decision making
 */
router.get('/race-signals/:raceId', (req, res) => {
  try {
    const raceId = parseInt(req.params.raceId);
    const signals = MarketIntelligence.detectInformedBetting(raceId);

    if (!signals.success) {
      return res.json({
        success: false,
        raceId,
        status: signals.status,
        message: signals.message
      });
    }

    // Return quick summary format
    res.json({
      success: true,
      raceId,
      race: signals.race,
      summary: signals.summary,
      topSignals: signals.signals.slice(0, 3),
      interpretation: signals.summary.interpretation
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/intelligence/horse-profile/:horseId
 * Comprehensive market intelligence profile for a horse
 */
router.get('/horse-profile/:horseId', (req, res) => {
  try {
    const horseId = parseInt(req.params.horseId);
    const openingOdds = parseFloat(req.query.openingOdds || '3.0');

    const movement = MarketIntelligence.analyzeMarketMovement(horseId);
    const bspPred = MarketIntelligence.predictBSP(horseId, openingOdds);
    const boost = MarketIntelligence.getConfidenceBoost(horseId, openingOdds, 50);

    res.json({
      success: true,
      horseId,
      openingOdds: openingOdds.toFixed(2),
      marketMovement: movement,
      bspPrediction: bspPred,
      confidenceBoost: boost,
      summary: {
        recommendation: boost.reason,
        expectedBSP: bspPred.status === 'SUCCESS' ? bspPred.predictedBSP : 'N/A',
        expectedRange: bspPred.status === 'SUCCESS'
          ? `${bspPred.predictionRange.lower} - ${bspPred.predictionRange.upper}`
          : 'N/A'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/intelligence/compare-odds
 * Compare opening odds vs predicted BSP to identify value
 */
router.post('/compare-odds', (req, res) => {
  try {
    const { picks } = req.body;

    if (!picks || !Array.isArray(picks)) {
      return res.status(400).json({ error: 'picks array required' });
    }

    const comparisons = picks.map(pick => {
      const bspPred = MarketIntelligence.predictBSP(pick.horseId, pick.odds);

      if (bspPred.status !== 'SUCCESS') {
        return {
          ...pick,
          status: 'INSUFFICIENT_DATA',
          message: bspPred.message
        };
      }

      const predictedBSP = parseFloat(bspPred.predictedBSP);
      const openingOdds = pick.odds;
      const oddsGain = ((openingOdds - predictedBSP) / predictedBSP) * 100;
      const isValue = oddsGain > 2; // >2% gain suggests value

      return {
        horse: pick.horse,
        horseId: pick.horseId,
        openingOdds: openingOdds.toFixed(2),
        predictedBSP: predictedBSP.toFixed(2),
        expectedGain: oddsGain.toFixed(1) + '%',
        isValue,
        verdict: isValue ? 'VALUE' : 'FAIR',
        confidence: bspPred.confidence,
        message: `At opening ${openingOdds.toFixed(2)}, market likely to close at ${predictedBSP.toFixed(2)}`
      };
    });

    const valueCount = comparisons.filter(c => c.isValue).length;

    res.json({
      success: true,
      comparisons,
      summary: {
        total: picks.length,
        valueOdds: valueCount,
        recommendation: valueCount > 0
          ? `${valueCount} horses offer favorable odds movement`
          : 'No clear value in current odds'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
