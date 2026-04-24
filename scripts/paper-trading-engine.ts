#!/usr/bin/env node
/**
 * scripts/paper-trading-engine.ts
 * Paper trading engine - places paper bets on real races based on TrackWise recommendations
 * Usage: npm run paper-trading
 *
 * Does NOT risk real money. Uses Betfair ratings to place bets on real races.
 * Tracks: Recommended horse, odds at time of bet, actual result, P&L simulation
 */

import 'dotenv/config';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import { fetchRealRaces, type RaceInfo } from './real-races-fetcher.js';
import { getFormData as getRacingAndSportsData, type RunnerForm } from './scrapers/racingAndSports.js';
import { getFormData as getRacingComData } from './scrapers/racing-com.js';
import { getFormData as getTabData } from './scrapers/tab-com.js';
import { getFormData as getSportsbetData } from './scrapers/sportsbet-com.js';
import { scoreField, pickBest, type PickResult } from './form-score.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '', {
  idle_timeout: 30,
  max_lifetime: 60 * 30,
  prepare: false, // Disable prepared statements to avoid Neon caching issues
});

const START_BANK = 200;
const WIN_PCT = 0.75;
const PLACE_PCT = 0.25;

// ── Types ──────────────────────────────────────────────────────────────────
interface PaperBet {
  id: string;
  date: string;
  track: string;
  raceNum: number;
  raceName: string;
  raceTime: string;
  horse: string;
  odds: number;
  formScore?: number;
  formQuality?: number;
  speedScore?: number;
  jockeyScore?: number;
  trainerScore?: number;
  trackDistScore?: number;
  marketScore?: number;
  strikeRate?: number;
  stake: number;
  winStake: number;
  placeStake: number;
  recommendationReason: string;
  result?: 'WIN' | 'PLACE' | 'LOSS';
  pl?: number;
  scrapeTime: string;
  resultTime?: string;
}


// ── Utilities ──────────────────────────────────────────────────────────────
function log(level: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [PAPER-TRADING] ${level.padEnd(5)} ${msg}`);
}

function uid() {
  return Math.random().toString(36).substring(2, 11);
}

function normaliseName(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// ── Cascading Form Data Fetcher ────────────────────────────────────────────────
async function fetchFormDataCascade(
  track: string,
  date: string,
  raceNum: number,
): Promise<RunnerForm[] | null> {
  // 1. Try racing.com first (highest quality data)
  try {
    const rcData = await getRacingComData(track, date, raceNum);
    if (rcData && rcData.length > 0) {
      log('INFO', `Form data from Racing.com: ${track} R${raceNum}`);
      return rcData;
    }
  } catch (err) {
    log('DEBUG', `Racing.com fetch failed: ${err}`);
  }

  // 2. Try TAB.com.au (major Australian betting site)
  try {
    const tabData = await getTabData(track, date, raceNum);
    if (tabData && tabData.length > 0) {
      log('INFO', `Form data from TAB.com.au: ${track} R${raceNum}`);
      return tabData;
    }
  } catch (err) {
    log('DEBUG', `TAB.com.au fetch failed: ${err}`);
  }

  // 3. Try Sportsbet.com.au (major Australian betting site)
  try {
    const sbData = await getSportsbetData(track, date, raceNum);
    if (sbData && sbData.length > 0) {
      log('INFO', `Form data from Sportsbet.com.au: ${track} R${raceNum}`);
      return sbData;
    }
  } catch (err) {
    log('DEBUG', `Sportsbet.com.au fetch failed: ${err}`);
  }

  // 4. Fallback to Racing and Sports (form specialist)
  try {
    const rasData = await getRacingAndSportsData(track, date, raceNum);
    if (rasData && rasData.length > 0) {
      log('INFO', `Form data from Racing and Sports: ${track} R${raceNum}`);
      return rasData;
    }
  } catch (err) {
    log('DEBUG', `Racing and Sports fetch failed: ${err}`);
  }

  // 5. No form data available - will fall back to Betfair ratings + odds-only selection
  log('DEBUG', `No form data available for ${track} R${raceNum}`);
  return null;
}

// ── Record Daily Summary ──────────────────────────────────────────────────────
async function recordDailySummary(date: string) {
  try {
    // Get today's bets
    const bets = await sql`SELECT * FROM paper_bets WHERE date = ${date};`;
    if (bets.length === 0) return;

    const settled = bets.filter((b: any) => b.result !== null);
    const totalStake = bets.reduce((sum: number, b: any) => sum + (b.stake || 0), 0);
    const totalPl = settled.reduce((sum: number, b: any) => sum + (b.pl || 0), 0);
    const roi = totalStake > 0 ? (totalPl / totalStake) * 100 : 0;
    const wins = settled.filter((b: any) => b.result === 'WIN').length;
    const places = settled.filter((b: any) => b.result === 'PLACE').length;
    const losses = settled.filter((b: any) => b.result === 'LOSS').length;

    // Upsert daily summary
    await sql`
      INSERT INTO daily_summary (date, total_bets, total_stake, total_pl, roi, wins, places, losses, updated_at)
      VALUES (${date}, ${bets.length}, ${totalStake}, ${totalPl}, ${roi}, ${wins}, ${places}, ${losses}, now())
      ON CONFLICT (date) DO UPDATE SET
        total_bets = ${bets.length},
        total_stake = ${totalStake},
        total_pl = ${totalPl},
        roi = ${roi},
        wins = ${wins},
        places = ${places},
        losses = ${losses},
        updated_at = now()
    `;

    log('INFO', `Daily summary recorded: ${bets.length} bets, P&L ${totalPl.toFixed(2)}, ROI ${roi.toFixed(2)}%`);
  } catch (err) {
    log('WARN', `Failed to record daily summary: ${err}`);
  }
}

// ── Kelly Stake ────────────────────────────────────────────────────────────
function kellyStake(bank: number): number {
  // Aggressive scaling for paper trading
  const unit = Math.max(1, Math.floor(bank / 25));
  return Math.min(unit * 5, bank * 0.15); // Cap at 15% of bank
}

// ── Initialize DB ──────────────────────────────────────────────────────────
async function initDB() {
  try {
    // Create paper_bets table (preserve historical data)
    await sql`
      CREATE TABLE IF NOT EXISTS paper_bets (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        track TEXT NOT NULL,
        race_num INTEGER NOT NULL,
        race_name TEXT,
        race_time TEXT,
        horse TEXT NOT NULL,
        odds DECIMAL(10, 2),
        form_score INTEGER,
        stake DECIMAL(10, 2),
        win_stake DECIMAL(10, 2),
        place_stake DECIMAL(10, 2),
        recommendation_reason TEXT,
        result TEXT,
        pl DECIMAL(10, 2),
        scrape_time TIMESTAMP,
        result_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create daily_summary table for P&L tracking
    await sql`
      CREATE TABLE IF NOT EXISTS daily_summary (
        date TEXT PRIMARY KEY,
        total_bets INTEGER,
        total_stake DECIMAL(10, 2),
        total_pl DECIMAL(10, 2),
        roi DECIMAL(5, 2),
        wins INTEGER,
        places INTEGER,
        losses INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    log('INFO', 'Database schema initialized');
  } catch (e) {
    log('ERROR', `DB init failed: ${e}`);
  }
}

// ── Select Bet (TrackWise Logic with Form) ────────────────────────────────
function selectBet(
  raceKey: string,
  runners: Array<{ name: string; odds: number }>,
  fieldSize: number,
  formData?: RunnerForm[]
): {
  horse: string;
  odds: number;
  reason: string;
  formScore?: number;
  formQuality?: number;
  speedScore?: number;
  jockeyScore?: number;
  trainerScore?: number;
  trackDistScore?: number;
  marketScore?: number;
  strikeRate?: number;
} | null {
  if (runners.length === 0) return null;

  // Acceptance criteria: field size 8-14, odds 1.5-20
  if (fieldSize < 8 || fieldSize > 14) {
    return null;
  }

  // Filter runners by odds
  const candidates = runners.filter(c => {
    const odds = c.odds || 0;
    return odds >= 1.5 && odds <= 20 && odds > 0;
  });

  if (candidates.length === 0) return null;

  // If form data available, use composite form scoring
  if (formData && formData.length > 0) {
    // Score all candidates using multi-factor approach
    const scored = scoreField(candidates, formData, 1.5, 20);
    const eligible = scored.filter(s => s.eligible);

    if (eligible.length === 0) {
      // No eligible horse from form scoring, fall back to favorite
      const favorite = candidates.reduce((a, b) => (b.odds < a.odds ? b : a));
      return {
        horse: favorite.name,
        odds: favorite.odds,
        reason: `No eligible form match - favorite (${favorite.odds.toFixed(2)}), ${fieldSize}-horse field`,
      };
    }

    // Best eligible horse (already sorted by scoreField)
    const best = eligible[0];

    return {
      horse: best.name,
      odds: best.odds,
      reason: best.formScore.explanation,
      formScore: best.formScore.total,
      formQuality: best.formScore.formQuality,
      speedScore: best.formScore.speedScore,
      jockeyScore: best.formScore.jockeyScore,
      trainerScore: best.formScore.trainerScore,
      trackDistScore: best.formScore.trackDistScore,
      marketScore: best.formScore.marketScore,
    };
  }

  // Fallback: favorites by odds only when no form data
  const favorite = candidates.reduce((a, b) => (b.odds < a.odds ? b : a));

  return {
    horse: favorite.name,
    odds: favorite.odds,
    reason: `Favorite (${favorite.odds.toFixed(2)}), ${fieldSize}-horse field`,
  };
}

// ── Place Paper Bets ────────────────────────────────────────────────────────
async function placePaperBets(realRaces: RaceInfo[], bank: number): Promise<PaperBet[]> {
  const bets: PaperBet[] = [];
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  if (realRaces.length === 0) {
    log('WARN', 'No races to place bets on');
    return bets;
  }

  log('INFO', `Processing ${realRaces.length} real races...`);

  // Place bets on selected races
  for (const race of realRaces) {
    const track = race.track;
    const raceNum = race.raceNum;
    const fieldSize = race.horses.length;
    const key = `${track}_R${raceNum}`;

    // Convert horses to runner format
    const runners = race.horses.map(h => ({
      name: h.name,
      odds: h.odds,
    }));

    // Try to fetch form data from multiple sources with timeout
    let formData: RunnerForm[] = [];
    try {
      const formPromise = fetchFormDataCascade(track.toLowerCase(), today, raceNum);
      const timeoutPromise = new Promise<RunnerForm[] | null>(resolve =>
        setTimeout(() => resolve(null), 12000)
      );
      const result = await Promise.race([formPromise, timeoutPromise]);
      if (result && result.length > 0) {
        formData = result;
        log('INFO', `Got form for ${key}: ${formData.length} horses`);
      }
    } catch (err) {
      log('DEBUG', `Form fetch failed for ${key}: ${err}, using odds only`);
    }

    const selection = selectBet(key, runners, fieldSize, formData);
    if (!selection) {
      log('DEBUG', `${key}: Skipped (field=${fieldSize})`);
      continue; // Skip this race
    }

    const stake = kellyStake(bank);
    const bet: PaperBet = {
      id: uid(),
      date: today,
      track,
      raceNum,
      raceName: race.raceName,
      raceTime: race.raceTime,
      horse: selection.horse,
      odds: selection.odds,
      formScore: selection.formScore,
      formQuality: selection.formQuality,
      speedScore: selection.speedScore,
      jockeyScore: selection.jockeyScore,
      trainerScore: selection.trainerScore,
      trackDistScore: selection.trackDistScore,
      marketScore: selection.marketScore,
      strikeRate: selection.strikeRate,
      stake: parseFloat(stake.toFixed(2)),
      winStake: parseFloat((stake * WIN_PCT).toFixed(2)),
      placeStake: parseFloat((stake * PLACE_PCT).toFixed(2)),
      recommendationReason: selection.reason,
      scrapeTime: now,
    };

    // Save to database
    try {
      await sql`
        INSERT INTO paper_bets (
          id, date, track, race_num, race_name, horse, odds, form_score,
          stake, win_stake, place_stake, recommendation_reason, scrape_time
        ) VALUES (
          ${bet.id}, ${bet.date}, ${bet.track}, ${bet.raceNum}, ${bet.raceName},
          ${bet.horse}, ${bet.odds}, ${bet.formScore || null},
          ${bet.stake}, ${bet.winStake}, ${bet.placeStake}, ${bet.recommendationReason}, now()
        )
      `;
      bets.push(bet);
      const formMsg = bet.formScore ? ` (score: ${bet.formScore}/100)` : '';
      log('INFO', `Paper bet placed: ${bet.track} R${bet.raceNum} - ${bet.horse} @ $${bet.odds.toFixed(2)}${formMsg}`);
    } catch (e) {
      log('WARN', `Failed to save paper bet: ${e}`);
    }
  }

  log('INFO', `Placed ${bets.length} paper bets for today`);
  return bets;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  log('INFO', 'Paper Trading Engine starting...');

  await initDB();

  // Fetch REAL races from racing.com, sportsbet.com.au, tab.com.au
  log('INFO', 'Fetching REAL races for today...');
  const realRaces = await fetchRealRaces();

  if (realRaces.length === 0) {
    log('ERROR', 'No real races found! Check racing.com, sportsbet, or TAB');
    await sql.end();
    return;
  }

  log('INFO', `Found ${realRaces.length} real races to process`);

  // Place paper bets
  const bets = await placePaperBets(realRaces, START_BANK);

  if (bets.length === 0) {
    log('WARN', 'No bets placed (no races matched selection criteria)');
    await sql.end();
    return;
  }

  log('INFO', `Paper trading day initialized: ${bets.length} bets placed`);
  log('INFO', `Total stake: $${bets.reduce((s, b) => s + b.stake, 0).toFixed(2)}`);
  log('INFO', 'Waiting for races to complete...');
  log('INFO', 'Use /api/paper-bets endpoint to track results');

  // Record initial daily summary
  const today = new Date().toISOString().split('T')[0];
  await recordDailySummary(today);

  await sql.end();
}

main().catch(e => {
  log('ERROR', `Engine crashed: ${e}`);
  process.exit(1);
});

export { PaperBet };
