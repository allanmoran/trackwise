/**
 * Compliance & Golden Rules Monitoring Routes
 * Validates TrackWise against Betfair's 10 Golden Rules of Automation
 */

import express from 'express';
import { ComplianceMonitor } from '../ml/compliance-monitor.js';

const router = express.Router();

/**
 * GET /api/compliance/report
 * Full compliance report against all Golden Rules
 */
router.get('/report', (req, res) => {
  try {
    const report = ComplianceMonitor.generateComplianceReport();
    res.json({
      success: true,
      report
    });
  } catch (err) {
    console.error('Compliance report error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/compliance/rule/3
 * Rule 3: Avoid Data Leakage
 */
router.get('/rule/3', (req, res) => {
  try {
    const result = ComplianceMonitor.checkDataLeakage();
    res.json({ success: true, check: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/compliance/rule/4
 * Rule 4: Do Not Overfit
 */
router.get('/rule/4', (req, res) => {
  try {
    const result = ComplianceMonitor.checkOverfitting();
    res.json({ success: true, check: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/compliance/rule/6
 * Rule 6: Prioritize Staking Plans
 */
router.get('/rule/6', (req, res) => {
  try {
    const result = ComplianceMonitor.checkStakingPlan();
    res.json({ success: true, check: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/compliance/rule/7
 * Rule 7: Manage Your Bankroll
 */
router.get('/rule/7', (req, res) => {
  try {
    const result = ComplianceMonitor.checkBankrollManagement();
    res.json({ success: true, check: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/compliance/rule/9
 * Rule 9: Implement Error Handling
 */
router.get('/rule/9', (req, res) => {
  try {
    const result = ComplianceMonitor.checkErrorHandling();
    res.json({ success: true, check: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/compliance/overview
 * Quick dashboard view of compliance status
 */
router.get('/overview', (req, res) => {
  try {
    const report = ComplianceMonitor.generateComplianceReport();

    res.json({
      success: true,
      overview: {
        score: report.overallScore,
        passed: report.rulesPassed,
        warnings: report.rulesWarning,
        errors: report.rulesError,
        recommendations: report.recommendations.slice(0, 5), // Top 5 recommendations
        generatedAt: report.timestamp
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
