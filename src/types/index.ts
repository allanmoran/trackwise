/**
 * Centralized Type Definitions
 * Single source of truth for all domain types
 */

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface DashboardData {
  success: boolean;
  bank: number;
  totalStaked: number;
  totalReturned: number;
  betsPlaced: number;
  betsWon: number;
  betsPlaced7d?: number;
  winRate?: number;
  lastUpdated?: string;
}

export interface ParseSportsbetResponse {
  success: boolean;
  picks?: ParsedPick[];
  error?: string;
  url?: string;
  raceCount?: number;
}

export interface RacesTodayResponse {
  success: boolean;
  urls: string[];
  count: number;
  error?: string;
}

// ============================================================================
// Domain Models
// ============================================================================

export interface Bet {
  id: string;
  track: string;
  raceNum: number;
  raceTime?: string;
  horse: string;
  jockey: string;
  trainer: string;
  odds: number;
  confidence: number;
  predictedOdds?: number;
  closingOdds?: number;
  kellyStak: number;
  stake?: number;
  expectedValuePercent?: number;
  placed: boolean;
  result?: 'WIN' | 'PLACE' | 'LOSS';
  pnl?: number;
  sourceUrl?: string;
  createdAt?: string;
  placedAt?: string;
  resultAt?: string;
}

export interface ParsedPick {
  track: string;
  raceNum: number;
  horse: string;
  jockey: string;
  trainer: string;
  odds: number;
  confidence: number;
  raceTime?: string;
}

export interface Race {
  id: string;
  date: string;
  track: string;
  raceNum: number;
  distance: number;
  conditions: string;
  runners: Runner[];
}

export interface Runner {
  id: string;
  number: number;
  horse: string;
  jockey: string;
  trainer: string;
  odds: number;
  form?: string;
  weight?: number;
  barrier?: number;
}

export interface PlaceResults {
  success: boolean;
  placed: number;
  failed: number;
  skipped: number;
  message: string;
}

export interface BetResult {
  betId: string;
  horse: string;
  result: 'WIN' | 'PLACE' | 'LOSS';
  pnl: number;
  closingOdds?: number;
}

// ============================================================================
// Request Body Types
// ============================================================================

export interface PlaceBetRequest {
  track: string;
  raceNum: number;
  horse: string;
  jockey: string;
  trainer: string;
  odds: number;
  stake: number;
  confidence: number;
  raceTime?: string;
  sourceUrl?: string;
  opening_odds?: number;
  closing_odds?: number;
}

export interface KellyLogEntry {
  date: string;
  track: string;
  raceNum: number;
  horseName: string;
  jockey: string;
  trainer: string;
  predictedOdds: number;
  closingOdds: number;
  kellyStake: number;
  confidence: number;
  opening_odds?: number;
  clv_percent?: number;
  closing_odds_source?: string;
}

// ============================================================================
// UI/State Types
// ============================================================================

export type TabType = 'picks' | 'active' | 'archive' | 'results';

export interface BetsState {
  generated: Bet[];
  placed: Bet[];
  active: Bet[];
  archived: Bet[];
}

export interface DashboardState {
  bank: number;
  totalStaked: number;
  totalReturned: number;
  betsPlaced: number;
  betsWon: number;
  lastUpdated?: Date;
}

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
  success: string | null;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface Strategy {
  name: string;
  minConfidence: number;
  maxOdds: number;
  banlistedJockeys: string[];
  blacklistedTrainers: string[];
}

// ============================================================================
// Helper Type Utilities
// ============================================================================

export type ApiEndpoint = keyof typeof import('../config/api').API_ENDPOINTS;

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AsyncResult<T> = Promise<Result<T>>;
