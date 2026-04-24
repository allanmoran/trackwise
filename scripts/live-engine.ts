#!/usr/bin/env node
/**
 * scripts/live-engine.ts
 * Headless betting engine — places real bets using Betfair ratings + proxy data.
 * Usage: npm run live-engine [--fast]
 *
 * Modes:
 * - Normal: Fetches ratings hourly, places bets hourly, polls results every 60s
 * - Fast (--fast): Runs 1000 bets instantly, no delays, for quick KB validation
 *
 * Runs continuously:
 * - Fetches Betfair ratings daily
 * - Places eligible bets hourly (or continuously in fast mode)
 * - Polls results every 60s (or continuously in fast mode)
 * - Updates KB with real outcomes
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../public/data');
const KB_FILE = path.resolve(DATA_DIR, 'kb_live.json');
const BETS_LOG = path.resolve(DATA_DIR, 'bets_live.json');

const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3001';
const START_BANK = 200;
const WIN_PCT = 0.75;
const PLACE_PCT = 0.25;
const FAST_MODE = process.argv.includes('--fast') || process.env.FAST_MODE === 'true';

// ── Types ──────────────────────────────────────────────────────────────────
interface RatingRow {
  meetingsname: string;
  meetingsbfexchangeeventid: string;
  meetingsracesbfexchangemarketid: string;
  meetingsracesname: string;
  meetingsracesnumber: number;
  meetingsracesrunnersbfexchangeselectionid: string;
  meetingsracesrunnersname: string;
  meetingsracesrunnersratedprice: number;
  meetingsracesrunnersspeedcat: string;
  meetingsracesrunnersearly_speed: number;
  meetingsrunnersrate_speed: number;
}

interface RealBet {
  id: string;
  date: string;
  marketId: string;
  selectionId: string;
  horse: string;
  track: string;
  raceNum: number;
  winOdds: number;
  winStake: number;
  placeStake: number;
  totalStake: number;
  result: 'WIN' | 'PLACE' | 'LOSS' | null;
  pl: number | null;
  status: 'BET' | 'SETTLED';
}

interface EngineState {
  kb: any;
  bank: number;
  betsPlaced: number;
  betsSettled: number;
  totalProfit: number;
  lastRatingsDate: string | null;
  startedAt: string;
}

// ── Utilities ──────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).substring(2, 11);
}

function todayAEST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function normaliseName(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function log(level: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [ENGINE] ${level.padEnd(5)} ${msg}`);
}

async function sleep(ms: number) {
  if (FAST_MODE) return; // Skip delays in fast mode
  return new Promise(r => setTimeout(r, ms));
}

// ── Load/save state ────────────────────────────────────────────────────────
function loadState(): EngineState {
  if (existsSync(KB_FILE)) {
    try {
      const kb = JSON.parse(readFileSync(KB_FILE, 'utf-8'));
      return {
        kb,
        bank: kb.bank || START_BANK,
        betsPlaced: kb.totalStaked ? Math.floor(kb.totalStaked / 3) : 0,
        betsSettled: kb.totalReturn ? Math.floor(kb.totalReturn / 3) : 0,
        totalProfit: kb.totalReturn ? kb.totalReturn - kb.totalStaked : 0,
        lastRatingsDate: null,
        startedAt: new Date().toISOString(),
      };
    } catch (e) {
      log('WARN', 'Failed to load KB, starting fresh');
    }
  }
  return {
    kb: { totalStaked: 0, totalReturn: 0, bank: START_BANK },
    bank: START_BANK,
    betsPlaced: 0,
    betsSettled: 0,
    totalProfit: 0,
    lastRatingsDate: null,
    startedAt: new Date().toISOString(),
  };
}

function saveState(state: EngineState) {
  try {
    writeFileSync(KB_FILE, JSON.stringify(state.kb, null, 2));
    log('INFO', `State saved — bank: $${state.bank.toFixed(2)}, placed: ${state.betsPlaced}`);
  } catch (e) {
    log('ERROR', `Failed to save state: ${e}`);
  }
}

// ── Fetch ratings ──────────────────────────────────────────────────────────
async function fetchRatings(): Promise<RatingRow[] | null> {
  try {
    const res = await fetch(`${PROXY_URL}/api/ratings/today`);
    if (!res.ok) {
      log('WARN', `Ratings fetch failed: HTTP ${res.status}`);
      return null;
    }

    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return null;

    const headers = lines[0]
      .split(',')
      .map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));

    log('INFO', `CSV headers (${headers.length}): ${headers.join(', ')}`);

    const rows: RatingRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: any = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = isNaN(+values[j]) ? values[j] : +values[j];
      }
      rows.push(row);
    }

    log('INFO', `Fetched ${rows.length} total rows, sample: ${rows[0] ? JSON.stringify(Object.keys(rows[0]).slice(0, 5)) : 'none'}`);
    return rows.length > 0 ? rows : null;
  } catch (e) {
    log('ERROR', `Ratings fetch error: ${e}`);
    return null;
  }
}

// ── Group races by track/num ───────────────────────────────────────────────
function groupRaces(rows: RatingRow[]) {
  const groups = new Map<string, RatingRow[]>();
  for (const row of rows) {
    if (!row.meetingsname || !row.meetingsracesnumber) continue;
    const key = `${row.meetingsname.toUpperCase()}_R${row.meetingsracesnumber}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return groups;
}

// ── Filter and select best bets ────────────────────────────────────────────
function selectBets(groups: Map<string, RatingRow[]>): RatingRow[] {
  const bets: RatingRow[] = [];

  for (const [key, runners] of groups) {
    // Basic filters
    const raceNum = parseInt(key.match(/R(\d+)$/)?.[1] ?? '0', 10);
    const field = runners.length;

    // Distance filter (assume race name contains distance)
    // For now, accept all

    // Field size: 8-14
    if (field < 8 || field > 14) {
      log('WARN', `${key}: field size ${field} out of range`);
      continue;
    }

    // Pick favorite (lowest odds = most likely to win)
    const favorite = runners.reduce((a, b) =>
      (b.meetingsracesrunnersratedprice || 999) < (a.meetingsracesrunnersratedprice || 999) ? b : a
    );

    const favOdds = favorite.meetingsracesrunnersratedprice || 0;
    // Accept odds from $1.5 to $20
    if (favOdds < 1.5 || favOdds > 20) {
      log('WARN', `${key}: favorite odds ${favOdds} out of range [1.5-20]`);
      continue;
    }

    bets.push(favorite);
  }

  log('INFO', `Selected ${bets.length} bets from ${groups.size} races`);
  return bets;
}

// ── Calculate Kelly stake ──────────────────────────────────────────────────
function kellyStake(bank: number, odds: number, modelValue: number): number {
  // Simplified Kelly: f = (ev / (odds - 1)) where ev is expected value
  // Aggressive scaling: 2x unit size, 5x multiplier, 15% bank cap
  const unit = Math.max(1, Math.floor(bank / 25));
  return Math.min(unit * 5, bank * 0.15); // Cap at 15% of bank
}

// ── Place bets via proxy ───────────────────────────────────────────────────
async function placeBets(ratings: RatingRow[], state: EngineState): Promise<RealBet[]> {
  const today = todayAEST();
  const promises: Promise<RealBet | null>[] = [];

  for (const rating of ratings) {
    const stake = kellyStake(state.bank, rating.meetingsracesrunnersratedprice || 2.0, 0);
    if (stake < 0.5) continue; // Minimum stake

    const bet: RealBet = {
      id: uid(),
      date: today,
      marketId: rating.meetingsracesbfexchangemarketid,
      selectionId: String(rating.meetingsracesrunnersbfexchangeselectionid),
      horse: rating.meetingsracesrunnersname,
      track: rating.meetingsname.toUpperCase(),
      raceNum: rating.meetingsracesnumber,
      winOdds: rating.meetingsracesrunnersratedprice || 2.0,
      winStake: parseFloat((stake * WIN_PCT).toFixed(2)),
      placeStake: parseFloat((stake * PLACE_PCT).toFixed(2)),
      totalStake: parseFloat(stake.toFixed(2)),
      result: null,
      pl: null,
      status: 'BET',
    };

    // Save to proxy (in parallel in fast mode)
    const betPromise = fetch(`${PROXY_URL}/api/bets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketId: bet.marketId,
        selectionId: bet.selectionId,
        track: bet.track,
        raceNum: bet.raceNum,
        date: bet.date,
        horse: bet.horse,
        odds: bet.winOdds,
        stake: bet.totalStake,
      }),
    }).then(res => {
      if (res.ok) {
        state.bank -= bet.totalStake;
        log('INFO', `Placed: ${bet.horse} @ $${bet.winOdds} stake $${bet.totalStake}`);
        return bet;
      }
      return null;
    }).catch(e => {
      log('WARN', `Bet save failed: ${e}`);
      return null;
    });

    promises.push(betPromise);
    if (!FAST_MODE) await sleep(500); // Rate limit in normal mode only
  }

  // Wait for all bets to be placed (parallel in fast mode)
  const results = await Promise.all(promises);
  const bets = results.filter((b): b is RealBet => b !== null);

  return bets;
}

// ── Poll for results ───────────────────────────────────────────────────────
async function pollResults(bets: RealBet[], state: EngineState) {
  const pending = bets.filter(b => b.status === 'BET');
  if (pending.length === 0) return;

  const racesToCheck = pending.map(b => ({
    track: b.track,
    raceNum: b.raceNum,
    date: b.date,
    horse: b.horse,
    marketId: b.marketId,
    selectionId: b.selectionId,
  }));

  try {
    const res = await fetch(`${PROXY_URL}/api/results/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ races: racesToCheck }),
    });

    const data = await res.json() as any;
    if (!data.success) return;

    for (const [key, result] of Object.entries(data.results)) {
      if (!result) continue;
      const bet = pending.find(b => `${b.marketId}_${b.selectionId}` === key);
      if (!bet) continue;

      const res = result as any;
      bet.result = res.result;
      bet.status = 'SETTLED';

      // Calculate P&L
      const pl = bet.result === 'WIN' ? bet.winStake * (bet.winOdds - 1)
               : bet.result === 'PLACE' ? bet.placeStake * ((bet.winOdds - 1) / 4)
               : -bet.totalStake;
      bet.pl = parseFloat(pl.toFixed(2));
      state.bank += bet.totalStake + bet.pl;
      state.betsSettled++;
      state.totalProfit += bet.pl;

      log('INFO', `Settled: ${bet.horse} → ${res.result} (P&L: ${bet.pl > 0 ? '+' : ''}$${bet.pl})`);

      // Update KB (simplified)
      state.kb.totalStaked = (state.kb.totalStaked || 0) + bet.totalStake;
      state.kb.totalReturn = (state.kb.totalReturn || 0) + bet.totalStake + bet.pl;
      state.kb.bank = state.bank;
    }
  } catch (e) {
    log('WARN', `Results poll failed: ${e}`);
  }
}

// ── Main loop ──────────────────────────────────────────────────────────────
async function main() {
  const modeStr = FAST_MODE ? 'FAST (no delays)' : 'NORMAL (hourly)';
  log('INFO', `Starting engine [${modeStr}] — target: 1000 bets, 10% ROI on $${START_BANK}`);

  let state = loadState();
  let allBets: RealBet[] = [];
  let lastRatingsDate = '';

  if (FAST_MODE) {
    // ── Fast mode: run continuously until 1000 bets ──
    let cycleCounter = 0;
    let cachedRows: RatingRow[] | null = null;

    while (state.betsPlaced < 1000) {
      cycleCounter++;
      const today = todayAEST();

      // Fetch ratings only once per day (cache them in fast mode)
      if (!cachedRows || lastRatingsDate !== today) {
        const rows = await fetchRatings();
        if (rows && rows.length > 0) {
          cachedRows = rows;
          lastRatingsDate = today;
        }
      }

      if (cachedRows && cachedRows.length > 0) {
        const groups = groupRaces(cachedRows);
        const selected = selectBets(groups);
        const newBets = await placeBets(selected, state);
        allBets.push(...newBets);
        state.betsPlaced = allBets.length;
      }

      // Poll results
      await pollResults(allBets, state);
      saveState(state);

      // Report
      const roi = state.bank > 0 ? ((state.bank - START_BANK) / START_BANK * 100).toFixed(1) : '0';
      log('INFO', `Cycle ${cycleCounter}: ${state.betsPlaced} placed, ${state.betsSettled} settled, bank: $${state.bank.toFixed(2)}, ROI: ${roi}%`);

      // Stop at target
      if (state.betsPlaced >= 1000) {
        log('INFO', `🎉 FAST MODE COMPLETE: 1000 bets placed in ${cycleCounter} cycles`);
        process.exit(0);
      }
    }
  } else {
    // ── Normal mode: hourly schedule ──
    let hourCounter = 0;
    setInterval(async () => {
      const today = todayAEST();
      hourCounter++;

      // Fetch fresh ratings every hour (or daily if needed)
      if (today !== lastRatingsDate || hourCounter % 60 === 0) {
        const rows = await fetchRatings();
        if (rows && rows.length > 0) {
          const groups = groupRaces(rows);
          const selected = selectBets(groups);
          const newBets = await placeBets(selected, state);
          allBets.push(...newBets);
          state.betsPlaced = allBets.length;
          lastRatingsDate = today;
        }
      }

      // Poll results every minute
      await pollResults(allBets, state);
      saveState(state);

      // Report
      const roi = state.bank > 0 ? ((state.bank - START_BANK) / START_BANK * 100).toFixed(1) : '0';
      log('INFO', `Progress: ${state.betsPlaced} placed, ${state.betsSettled} settled, bank: $${state.bank.toFixed(2)}, ROI: ${roi}%`);

      // Stop at target
      if (state.betsPlaced >= 1000) {
        log('INFO', `🎉 Target reached: 1000 bets placed`);
        process.exit(0);
      }
    }, 60_000); // Every minute
  }
}

main().catch(e => {
  log('ERROR', `Engine crashed: ${e}`);
  process.exit(1);
});
