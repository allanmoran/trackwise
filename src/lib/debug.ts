/**
 * Debug Logging Utility
 * Logs only in development; strips from production build
 */

const DEBUG = import.meta.env.DEV;

export function debugLog(message: string, data?: any): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.log(`[DEBUG] ${message}`, data);
    } else {
      console.log(`[DEBUG] ${message}`);
    }
  }
}

export function debugWarn(message: string, data?: any): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.warn(`[WARN] ${message}`, data);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  }
}

export function debugError(message: string, error?: any): void {
  if (DEBUG) {
    if (error instanceof Error) {
      console.error(`[ERROR] ${message}:`, error.message);
    } else if (error !== undefined) {
      console.error(`[ERROR] ${message}:`, error);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  }
}

export const debug = {
  log: debugLog,
  warn: debugWarn,
  error: debugError,
};
