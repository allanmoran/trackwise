/**
 * Comprehensive Error & Event Logging System
 * Tracks all operations, errors, and compliance events
 */

import db from '../db.js';

export class ErrorLogger {
  /**
   * Log an error event
   */
  static logError(errorType, message, context = {}) {
    try {
      const stmt = db.prepare(`
        INSERT INTO error_logs (error_type, message, context, logged_at, severity)
        VALUES (?, ?, ?, datetime('now'), ?)
      `);

      const severity = this.determineSeverity(errorType, message);
      stmt.run(errorType, message, JSON.stringify(context), severity);

      console.error(`[ERROR] ${errorType}: ${message}`, context);
    } catch (err) {
      console.error('Failed to log error:', err);
    }
  }

  /**
   * Log a scheduled job execution
   */
  static logSchedulerJob(jobName, status, duration, error = null) {
    try {
      const stmt = db.prepare(`
        INSERT INTO scheduler_logs (job_name, status, duration_ms, error, executed_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(jobName, status, duration, error || null);

      const message = `[SCHEDULER] ${jobName}: ${status} (${duration}ms)`;
      if (status === 'SUCCESS') {
        console.log(message);
      } else {
        console.error(message, error);
      }
    } catch (err) {
      console.error('Failed to log scheduler job:', err);
    }
  }

  /**
   * Log a bet operation
   */
  static logBetOperation(betId, operation, details = {}) {
    try {
      const stmt = db.prepare(`
        INSERT INTO operation_logs (entity_type, entity_id, operation, details, logged_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);

      stmt.run('bet', betId, operation, JSON.stringify(details));

      console.log(`[BET] ${betId}: ${operation}`, details);
    } catch (err) {
      console.error('Failed to log bet operation:', err);
    }
  }

  /**
   * Log API request
   */
  static logApiRequest(endpoint, method, statusCode, duration, error = null) {
    try {
      const stmt = db.prepare(`
        INSERT INTO api_logs (endpoint, method, status_code, duration_ms, error, logged_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(endpoint, method, statusCode, duration, error || null);
    } catch (err) {
      console.error('Failed to log API request:', err);
    }
  }

  /**
   * Log model prediction
   */
  static logPrediction(horseId, confidence, odds, result = null) {
    try {
      const stmt = db.prepare(`
        INSERT INTO prediction_logs (horse_id, confidence, odds, result, logged_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(horseId, confidence, odds, result || null);
    } catch (err) {
      console.error('Failed to log prediction:', err);
    }
  }

  /**
   * Get recent errors
   */
  static getRecentErrors(hours = 24, limit = 50) {
    try {
      return db.prepare(`
        SELECT *
        FROM error_logs
        WHERE logged_at > datetime('now', ? || ' hours')
        ORDER BY logged_at DESC
        LIMIT ?
      `).all(-hours, limit);
    } catch (err) {
      console.error('Failed to fetch error logs:', err);
      return [];
    }
  }

  /**
   * Get scheduler job history
   */
  static getSchedulerHistory(jobName = null, limit = 50) {
    try {
      let query = `
        SELECT *
        FROM scheduler_logs
      `;

      if (jobName) {
        query += ` WHERE job_name = ?`;
      }

      query += ` ORDER BY executed_at DESC LIMIT ?`;

      if (jobName) {
        return db.prepare(query).all(jobName, limit);
      } else {
        return db.prepare(query).all(limit);
      }
    } catch (err) {
      console.error('Failed to fetch scheduler logs:', err);
      return [];
    }
  }

  /**
   * Get API request statistics
   */
  static getApiStats(hours = 24) {
    try {
      return db.prepare(`
        SELECT
          endpoint,
          method,
          COUNT(*) as requests,
          AVG(duration_ms) as avg_duration,
          MAX(duration_ms) as max_duration,
          SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors
        FROM api_logs
        WHERE logged_at > datetime('now', ? || ' hours')
        GROUP BY endpoint, method
        ORDER BY requests DESC
      `).all(-hours);
    } catch (err) {
      console.error('Failed to fetch API stats:', err);
      return [];
    }
  }

  /**
   * Get system health summary
   */
  static getSystemHealth() {
    try {
      const errors24h = db.prepare(`
        SELECT COUNT(*) as count FROM error_logs
        WHERE logged_at > datetime('now', '-24 hours')
      `).get();

      const failedJobs = db.prepare(`
        SELECT COUNT(*) as count FROM scheduler_logs
        WHERE executed_at > datetime('now', '-24 hours') AND status != 'SUCCESS'
      `).get();

      const apiErrors = db.prepare(`
        SELECT COUNT(*) as count FROM api_logs
        WHERE logged_at > datetime('now', '-24 hours') AND status_code >= 400
      `).get();

      const uptime = this.calculateUptime();

      return {
        status: errors24h.count === 0 ? 'HEALTHY' : 'WARNING',
        errors24h: errors24h.count,
        failedJobs24h: failedJobs.count,
        apiErrors24h: apiErrors.count,
        uptimePercent: uptime,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return { status: 'ERROR', message: err.message };
    }
  }

  /**
   * Calculate system uptime percentage
   */
  static calculateUptime() {
    try {
      const totalJobs = db.prepare(`
        SELECT COUNT(*) as count FROM scheduler_logs
        WHERE executed_at > datetime('now', '-24 hours')
      `).get();

      if (totalJobs.count === 0) return 100;

      const successJobs = db.prepare(`
        SELECT COUNT(*) as count FROM scheduler_logs
        WHERE executed_at > datetime('now', '-24 hours') AND status = 'SUCCESS'
      `).get();

      return ((successJobs.count / totalJobs.count) * 100).toFixed(1);
    } catch (err) {
      return 0;
    }
  }

  /**
   * Determine error severity
   */
  static determineSeverity(errorType, message) {
    if (errorType.includes('CRITICAL') || message.includes('CRITICAL')) return 'CRITICAL';
    if (errorType.includes('DATA_LEAK')) return 'CRITICAL';
    if (errorType.includes('BANKRUPT')) return 'CRITICAL';
    if (errorType.includes('FAIL')) return 'HIGH';
    if (errorType.includes('TIMEOUT') || errorType.includes('CONNECTION')) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Export logs for analysis
   */
  static exportLogs(startDate, endDate, format = 'json') {
    try {
      const errors = db.prepare(`
        SELECT * FROM error_logs
        WHERE logged_at BETWEEN ? AND ?
        ORDER BY logged_at DESC
      `).all(startDate, endDate);

      const scheduler = db.prepare(`
        SELECT * FROM scheduler_logs
        WHERE executed_at BETWEEN ? AND ?
        ORDER BY executed_at DESC
      `).all(startDate, endDate);

      const api = db.prepare(`
        SELECT * FROM api_logs
        WHERE logged_at BETWEEN ? AND ?
        ORDER BY logged_at DESC
      `).all(startDate, endDate);

      return {
        exportedAt: new Date().toISOString(),
        dateRange: { start: startDate, end: endDate },
        errorLogs: errors,
        schedulerLogs: scheduler,
        apiLogs: api,
        totals: {
          errors: errors.length,
          schedulerEvents: scheduler.length,
          apiRequests: api.length
        }
      };
    } catch (err) {
      return { error: err.message };
    }
  }
}

export default ErrorLogger;
