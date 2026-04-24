/**
 * Logging & Monitoring Routes
 * Provides visibility into system operations, errors, and health
 */

import express from 'express';
import { ErrorLogger } from '../utils/error-logger.js';

const router = express.Router();

/**
 * GET /api/logging/health
 * System health summary
 */
router.get('/health', (req, res) => {
  try {
    const health = ErrorLogger.getSystemHealth();
    res.json({ success: true, health });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/logging/errors
 * Get recent errors
 * Query params: hours (default 24), limit (default 50)
 */
router.get('/errors', (req, res) => {
  try {
    const hours = parseInt(req.query.hours || '24');
    const limit = parseInt(req.query.limit || '50');
    const errors = ErrorLogger.getRecentErrors(hours, limit);

    res.json({
      success: true,
      count: errors.length,
      hours,
      errors
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/logging/scheduler
 * Scheduler job execution history
 * Query params: job (optional filter), limit (default 50)
 */
router.get('/scheduler', (req, res) => {
  try {
    const jobName = req.query.job || null;
    const limit = parseInt(req.query.limit || '50');
    const history = ErrorLogger.getSchedulerHistory(jobName, limit);

    res.json({
      success: true,
      count: history.length,
      jobFilter: jobName,
      history
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/logging/api-stats
 * API request performance statistics
 * Query params: hours (default 24)
 */
router.get('/api-stats', (req, res) => {
  try {
    const hours = parseInt(req.query.hours || '24');
    const stats = ErrorLogger.getApiStats(hours);

    res.json({
      success: true,
      hours,
      endpoints: stats.length,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/logging/export
 * Export logs for analysis
 * Query params: startDate, endDate, format (json, csv)
 */
router.get('/export', (req, res) => {
  try {
    const startDate = req.query.startDate || new Date(Date.now() - 86400000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();
    const format = req.query.format || 'json';

    const exportData = ErrorLogger.exportLogs(startDate, endDate, format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="trackwise-logs.csv"');
      // Simple CSV conversion
      const csv = convertToCSV(exportData);
      res.send(csv);
    } else {
      res.json({ success: true, export: exportData });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/logging/summary
 * Quick summary of all logging data
 */
router.get('/summary', (req, res) => {
  try {
    const health = ErrorLogger.getSystemHealth();
    const recentErrors = ErrorLogger.getRecentErrors(24, 5);
    const schedulerHistory = ErrorLogger.getSchedulerHistory(null, 10);
    const apiStats = ErrorLogger.getApiStats(24);

    res.json({
      success: true,
      summary: {
        health,
        recentErrors: {
          count: recentErrors.length,
          latestErrors: recentErrors.slice(0, 3)
        },
        schedulerHealth: {
          recentJobs: schedulerHistory.length,
          latestJob: schedulerHistory[0] || null
        },
        apiPerformance: {
          endpoints: apiStats.length,
          slowestEndpoint: apiStats.length > 0 ? apiStats[0] : null
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Helper to convert export data to CSV
 */
function convertToCSV(exportData) {
  const { errorLogs, schedulerLogs, apiLogs } = exportData;

  let csv = 'LOG_TYPE,TIMESTAMP,DETAILS\n';

  errorLogs.forEach(log => {
    csv += `ERROR,"${log.logged_at}","${log.error_type}: ${log.message}"\n`;
  });

  schedulerLogs.forEach(log => {
    csv += `SCHEDULER,"${log.executed_at}","${log.job_name}: ${log.status}"\n`;
  });

  apiLogs.forEach(log => {
    csv += `API,"${log.logged_at}","${log.method} ${log.endpoint} (${log.status_code})"\n`;
  });

  return csv;
}

export default router;
