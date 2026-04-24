/**
 * Commission Management Routes
 * Handle commission calculations, tracking, and strategy adjustments
 */

import express from 'express';
import { CommissionManager } from '../utils/commission-manager.js';

const router = express.Router();

/**
 * GET /api/commission/current-rate
 * Get current commission rate
 */
router.get('/current-rate', (req, res) => {
  try {
    const rate = CommissionManager.getCommissionRate();
    res.json({
      success: true,
      rate,
      ratePercent: (rate * 100).toFixed(1) + '%',
      exchange: 'sportsbet',
      notes: 'Australian racing: typically 10% (varies 7-10% by state)'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/commission/set-rate
 * Update commission rate (for state changes or future updates)
 */
router.post('/set-rate', (req, res) => {
  try {
    const { rate, notes } = req.body;

    if (!rate || rate < 0 || rate > 0.5) {
      return res.status(400).json({ error: 'Invalid rate (must be 0-0.5)' });
    }

    const result = CommissionManager.setCommissionRate('sportsbet', rate, notes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/commission/calculate-net-profit
 * Calculate net profit after commission
 */
router.post('/calculate-net-profit', (req, res) => {
  try {
    const { grossProfit, commission } = req.body;

    if (grossProfit === undefined) {
      return res.status(400).json({ error: 'grossProfit required' });
    }

    const result = CommissionManager.calculateNetProfit(grossProfit, commission);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/commission/calculate-net-roi
 * Calculate net ROI after commission
 */
router.post('/calculate-net-roi', (req, res) => {
  try {
    const { stake, grossReturn, commission } = req.body;

    if (stake === undefined || grossReturn === undefined) {
      return res.status(400).json({ error: 'stake and grossReturn required' });
    }

    const result = CommissionManager.calculateNetROI(stake, grossReturn, commission);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/commission/adjust-kelly
 * Adjust Kelly criterion for commission impact
 */
router.post('/adjust-kelly', (req, res) => {
  try {
    const { odds, confidence, commission } = req.body;

    if (!odds || confidence === undefined) {
      return res.status(400).json({ error: 'odds and confidence required' });
    }

    const result = CommissionManager.adjustKellyForCommission(odds, confidence, commission);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/commission/impact?days=7
 * Get commission impact summary
 */
router.get('/impact', (req, res) => {
  try {
    const days = parseInt(req.query.days || '7');
    const impact = CommissionManager.getCommissionImpact(days);
    res.json({ success: true, impact });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/commission/daily-summary?days=30
 * Get daily commission summaries
 */
router.get('/daily-summary', (req, res) => {
  try {
    const days = parseInt(req.query.days || '30');
    const summaries = CommissionManager.getDailySummaries(days);

    res.json({
      success: true,
      count: summaries.length,
      days,
      summaries
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/commission/minimum-edge
 * Calculate minimum win probability required to break even after commission
 */
router.post('/minimum-edge', (req, res) => {
  try {
    const { odds, commission } = req.body;

    if (!odds) {
      return res.status(400).json({ error: 'odds required' });
    }

    const result = CommissionManager.getMinimumEdgeRequired(odds, commission);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/commission/efficiency-threshold
 * Get recommended efficiency threshold after commission adjustment
 */
router.get('/efficiency-threshold', (req, res) => {
  try {
    const result = CommissionManager.getAdjustedEfficiencyThreshold();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/commission/strategy-adjustments
 * Get all recommended strategy threshold adjustments for commission
 */
router.get('/strategy-adjustments', (req, res) => {
  try {
    const adjustments = CommissionManager.getStrategyAdjustments();
    res.json({ success: true, adjustments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/commission/analysis
 * Comprehensive commission impact analysis
 */
router.get('/analysis', (req, res) => {
  try {
    const rate = CommissionManager.getCommissionRate();
    const impact7d = CommissionManager.getCommissionImpact(7);
    const impact30d = CommissionManager.getCommissionImpact(30);
    const adjustments = CommissionManager.getStrategyAdjustments();
    const efficiency = CommissionManager.getAdjustedEfficiencyThreshold();

    res.json({
      success: true,
      analysis: {
        currentRate: (rate * 100).toFixed(1) + '%',
        recentImpact: {
          last7Days: impact7d,
          last30Days: impact30d
        },
        strategyAdjustments: adjustments,
        efficiencyThreshold: efficiency
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
