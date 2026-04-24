/**
 * Centralized API Configuration
 * All endpoints reference single source of truth for base URL
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const API_ENDPOINTS = {
  // Dashboard
  dashboard: `${API_BASE}/api/dashboard`,
  sessionBank: `${API_BASE}/api/session/bank`,

  // Parsing & Generation
  parseSportsbet: `${API_BASE}/api/parse-sportsbet`,
  racesToday: `${API_BASE}/api/races/today`,

  // Bets
  betsSportsbet: `${API_BASE}/api/bets/sportsbet`,
  betsBatch: `${API_BASE}/api/bets/batch`,
  betsActive: `${API_BASE}/api/bets/active`,
  betsArchive: `${API_BASE}/api/bets/archive`,
  betsMarkResult: `${API_BASE}/api/bets/mark-result`,
  betsResult: `${API_BASE}/api/bets/result`,
  scrapeResults: `${API_BASE}/api/bets/scrape-results`,

  // Kelly Logging
  kellyLog: `${API_BASE}/api/kelly/log`,

  // Market Odds
  oddsBatch: `${API_BASE}/api/odds/racenet/batch`,
  oddsClosing: `${API_BASE}/api/odds/closing`,

  // KB/Historical
  historicalPnL: `${API_BASE}/api/historical/pnl`,
  resultsMarkKelly: `${API_BASE}/api/results/mark-kelly`,
  resultsScrape: `${API_BASE}/api/results/scrape`,
} as const;

export function getApiUrl(key: keyof typeof API_ENDPOINTS): string {
  return API_ENDPOINTS[key];
}

export { API_BASE };
