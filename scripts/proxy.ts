#!/usr/bin/env node
/**
 * scripts/proxy.ts
 * Lightweight local proxy for Betfair ratings + odds + form data.
 * Usage: npm run proxy  (starts on http://localhost:3001)
 *
 * Endpoints:
 *   GET  /api/ratings/today            → today's ratings CSV (AEST date)
 *   GET  /api/ratings/:date            → specific date  YYYY-MM-DD
 *   POST /api/odds/racenet/batch       → live odds via Racenet scraper
 *   GET  /api/odds/racenet             → live odds (query params)
 *   GET  /api/odds/status              → scraper health
 *   GET  /api/form/racingAndSports     → form data (query: track, date, raceNum)
 *   POST /api/form/racingAndSports/batch → form data for multiple horses
 *   GET  /health                       → {"ok":true}
 *
 * All data sources require no API keys or credentials.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import http  from 'node:http';
import https from 'node:https';
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

// Initialize KB database for jockey/trainer lookups
const dbPath = path.resolve(__dirname, '../backend/data/trackwise.db');
const kbDb = new Database(dbPath, { readonly: true });
import {
  fetchTabOdds,
  type TabRaceOdds, type TabRunnerOdds,
} from './scrapers/tab.js';
import {
  getFormData,
  type RunnerForm,
} from './scrapers/racingAndSports.js';
import {
  fetchResults,
  type RunnerResult,
} from './scrapers/results.js';
import {
  getFormKnowledgeBase,
  scoreRunnerFromKB,
} from './race-entry-integration.js';

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const PORT    = parseInt(process.env.PORT ?? '3001', 10);
const RATINGS = (date: string) =>
  `/api/widgets/kash-ratings-model/datasets?date=${date}&presenter=RatingsPresenter&csv=true`;
const BETFAIR_RATINGS_HOST = 'betfair-data-supplier-prod.herokuapp.com';

/* ── Postgres connection ── */
const sql = postgres(process.env.DATABASE_URL || '', {
  idle_timeout: 30,
  max_lifetime: 60 * 30,
  prepare: false, // Disable prepared statements to avoid Neon caching issues
});

/* ── Initialize database schema ── */
async function initDB() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS bets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        market_id TEXT NOT NULL,
        selection_id TEXT NOT NULL,
        track TEXT NOT NULL,
        race_num INTEGER NOT NULL,
        date TEXT NOT NULL,
        horse TEXT NOT NULL,
        jockey TEXT,
        trainer TEXT,
        odds DECIMAL(10, 2),
        stake DECIMAL(10, 2),
        confidence INTEGER,
        race_time TEXT,
        result TEXT,
        status TEXT DEFAULT 'BET',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS session_bank (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        bank DECIMAL(10, 2) NOT NULL,
        total_staked DECIMAL(10, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS races (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        track TEXT NOT NULL,
        race_num INTEGER NOT NULL,
        race_time TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, track, race_num)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS runners (
        id SERIAL PRIMARY KEY,
        race_id INTEGER NOT NULL REFERENCES races(id),
        horse_name TEXT NOT NULL,
        jockey TEXT,
        trainer TEXT,
        barrier INTEGER,
        weight DECIMAL(5, 1),
        odds DECIMAL(5, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS jockey_stats (
        id SERIAL PRIMARY KEY,
        jockey_name TEXT NOT NULL UNIQUE,
        total_runs INTEGER DEFAULT 0,
        total_wins INTEGER DEFAULT 0,
        total_places INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS trainer_stats (
        id SERIAL PRIMARY KEY,
        trainer_name TEXT NOT NULL UNIQUE,
        total_runs INTEGER DEFAULT 0,
        total_wins INTEGER DEFAULT 0,
        total_places INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS horse_stats (
        id SERIAL PRIMARY KEY,
        horse_name TEXT NOT NULL,
        track TEXT NOT NULL,
        total_runs INTEGER DEFAULT 0,
        total_wins INTEGER DEFAULT 0,
        total_places INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(horse_name, track)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS bet_results (
        id SERIAL PRIMARY KEY,
        horse_name TEXT NOT NULL,
        jockey TEXT,
        trainer TEXT,
        result TEXT NOT NULL,
        stake_amount DECIMAL(10, 2) NOT NULL,
        pnl DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS kelly_logs (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        track TEXT NOT NULL,
        race_num INTEGER NOT NULL,
        horse_name TEXT NOT NULL,
        jockey TEXT,
        trainer TEXT,
        predicted_odds DECIMAL(10, 2) NOT NULL,
        closing_odds DECIMAL(10, 2),
        kelly_stake DECIMAL(10, 2) NOT NULL,
        confidence INTEGER NOT NULL,
        expected_value_percent DECIMAL(5, 2),
        actual_result TEXT,
        actual_pnl DECIMAL(10, 2),
        ev_validated BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Add missing columns to bets table if they don't exist
    try {
      await sql`ALTER TABLE bets ADD COLUMN IF NOT EXISTS jockey TEXT;`;
      await sql`ALTER TABLE bets ADD COLUMN IF NOT EXISTS trainer TEXT;`;
      await sql`ALTER TABLE bets ADD COLUMN IF NOT EXISTS confidence INTEGER;`;
      await sql`ALTER TABLE bets ADD COLUMN IF NOT EXISTS race_time TEXT;`;
      await sql`ALTER TABLE bets ADD COLUMN IF NOT EXISTS source_url TEXT;`;
    } catch (e) {
      // Columns may already exist, ignore errors
    }

    console.log('[proxy] ✓ Database schema initialized');
  } catch (err) {
    console.error('[proxy] DB init error:', err);
  }
}

/* ── TAB odds cache ── */
interface TabOddsCache { [key: string]: TabRaceOdds | null; }
let tabOddsCache: TabOddsCache = {};
let lastTabFetch = 0;
let tabFetchError: string | null = null;

/* ── AEST date (DST-aware via Intl) ── */
function todayAEST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/* ── Sleep helper ── */
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/* ── Fuzzy name match ── */
function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}
function fuzzyMatch(a: string, b: string, thresh = 0.75): boolean {
  const na = normName(a), nb = normName(b);
  if (na === nb) return true;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer  = na.length <= nb.length ? nb : na;
  let match = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) match++;
  }
  return match / maxLen >= thresh;
}

/* ── Upstream fetch (Betfair ratings CSV) ── */
function upstream(path: string): Promise<{ status: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const opts: https.RequestOptions = {
      hostname: BETFAIR_RATINGS_HOST,
      path,
      method:  'GET',
      headers: { 'User-Agent': 'TrackWise-Proxy/2.0', Accept: 'text/csv,text/plain,*/*' },
      timeout: 15_000,
    };
    const req = https.request(opts, res => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({
        status:      res.statusCode ?? 200,
        body:        Buffer.concat(chunks).toString('utf-8'),
        contentType: res.headers['content-type'] ?? 'text/plain',
      }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('upstream timeout')); });
    req.on('error',   reject);
    req.end();
  });
}

/* ── CORS headers ── */
function cors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/* ── Read body ── */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/* ── Server ── */
const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  const url = req.url ?? '/';

  /* /api/today-races — fetch today's real races from manual_races */
  if (url === '/api/today-races') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const races = await sql`
        SELECT
          date, track, race_num, race_time, runners
        FROM manual_races
        WHERE date = ${today}
        ORDER BY race_num
      `;

      const formatted = races.map((r: any) => ({
        id: `${r.track}-R${r.race_num}`,
        date: r.date,
        track: r.track,
        raceNum: r.race_num,
        raceTime: r.race_time,
        runners: typeof r.runners === 'string' ? JSON.parse(r.runners) : r.runners,
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, races: formatted, count: formatted.length }));
    } catch (err) {
      console.error('[proxy] today races fetch error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* /api/auto-bets — get auto-betting recommendations from KB (high confidence only) */
  if (url === '/api/auto-bets') {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get today's races
      const races = await sql`
        SELECT date, track, race_num, race_time, runners
        FROM manual_races
        WHERE date = ${today}
        ORDER BY race_num
      `;

      // Get KB stats
      const kb = await getFormKnowledgeBase(sql);
      if (!kb) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Failed to build knowledge base' }));
        return;
      }

      const picks: any[] = [];

      for (const race of races) {
        const runners = typeof race.runners === 'string' ? JSON.parse(race.runners) : race.runners;

        for (const runner of runners || []) {
          const { score, reasoning } = scoreRunnerFromKB(runner, kb);

          // Only include high-confidence picks (>60)
          if (score >= 60) {
            picks.push({
              track: race.track,
              raceNum: race.race_num,
              raceTime: race.race_time,
              horse: runner.name,
              jockey: runner.jockey,
              trainer: runner.trainer,
              odds: runner.odds,
              confidence: score,
              reasoning,
            });
          }
        }
      }

      // Sort by confidence descending
      picks.sort((a, b) => b.confidence - a.confidence);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        picks,
        count: picks.length,
        kbStats: {
          totalRaces: kb.totalRaces,
          jockeys: Object.keys(kb.jockeyStats).length,
          trainers: Object.keys(kb.trainerStats).length,
        }
      }));
    } catch (err) {
      console.error('[proxy] auto-bets error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* /api/all-runners — get ALL runners scored (for KB population) */
  if (url === '/api/all-runners') {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get today's races
      const races = await sql`
        SELECT date, track, race_num, race_time, runners
        FROM manual_races
        WHERE date = ${today}
        ORDER BY race_num
      `;

      // Get KB stats
      const kb = await getFormKnowledgeBase(sql);
      if (!kb) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Failed to build knowledge base' }));
        return;
      }

      const allRunners: any[] = [];

      for (const race of races) {
        const runners = typeof race.runners === 'string' ? JSON.parse(race.runners) : race.runners;

        for (const runner of runners || []) {
          const { score, reasoning } = scoreRunnerFromKB(runner, kb);

          // Include ALL runners for KB building
          allRunners.push({
            track: race.track,
            raceNum: race.race_num,
            raceTime: race.race_time,
            horse: runner.name,
            jockey: runner.jockey,
            trainer: runner.trainer,
            odds: runner.odds,
            confidence: score,
            reasoning,
          });
        }
      }

      // Sort by confidence descending
      allRunners.sort((a, b) => b.confidence - a.confidence);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        runners: allRunners,
        count: allRunners.count,
        kbStats: {
          totalRaces: kb.totalRaces,
          jockeys: Object.keys(kb.jockeyStats).length,
          trainers: Object.keys(kb.trainerStats).length,
        }
      }));
    } catch (err) {
      console.error('[proxy] all-runners error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/kb/stats — get all knowledge base statistics */
  if (req.method === 'GET' && url === '/api/kb/stats') {
    try {
      // Get jockey stats
      const jockeys = await sql`
        SELECT jockey_name, total_runs, total_wins, total_places
        FROM jockey_stats
        ORDER BY total_runs DESC
      `;

      // Get trainer stats
      const trainers = await sql`
        SELECT trainer_name, total_runs, total_wins, total_places
        FROM trainer_stats
        ORDER BY total_runs DESC
      `;

      // Get horse stats
      const horses = await sql`
        SELECT horse_name, track, total_runs, total_wins, total_places
        FROM horse_stats
        ORDER BY total_runs DESC
      `;

      // Calculate aggregates
      const totalRaces = await sql`
        SELECT COUNT(*) as count FROM races
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        summary: {
          totalRaces: totalRaces[0]?.count || 0,
          totalJockeys: jockeys.length,
          totalTrainers: trainers.length,
          totalHorses: horses.length,
        },
        jockeys: jockeys.map(j => ({
          name: j.jockey_name,
          runs: parseInt(j.total_runs),
          wins: parseInt(j.total_wins),
          places: parseInt(j.total_places),
          winRate: j.total_runs > 0 ? ((parseInt(j.total_wins) / parseInt(j.total_runs)) * 100).toFixed(1) : '0.0',
        })),
        trainers: trainers.map(t => ({
          name: t.trainer_name,
          runs: parseInt(t.total_runs),
          wins: parseInt(t.total_wins),
          places: parseInt(t.total_places),
          winRate: t.total_runs > 0 ? ((parseInt(t.total_wins) / parseInt(t.total_runs)) * 100).toFixed(1) : '0.0',
        })),
        horses: horses.map(h => ({
          name: h.horse_name,
          track: h.track,
          runs: parseInt(h.total_runs),
          wins: parseInt(h.total_wins),
          places: parseInt(h.total_places),
          winRate: h.total_runs > 0 ? ((parseInt(h.total_wins) / parseInt(h.total_runs)) * 100).toFixed(1) : '0.0',
        })),
      }));
    } catch (err) {
      console.error('[proxy] kb stats error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/session/bank — get today's bank balance */
  if (req.method === 'GET' && url === '/api/session/bank') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await sql`
        SELECT bank, total_staked FROM session_bank
        WHERE date = ${today}
      `;

      if (result.length > 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          bank: parseFloat(result[0].bank),
          totalStaked: parseFloat(result[0].total_staked),
          date: today,
        }));
      } else {
        // First time today, initialize with $200
        await sql`
          INSERT INTO session_bank (date, bank, total_staked)
          VALUES (${today}, 200, 0)
        `;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          bank: 200,
          totalStaked: 0,
          date: today,
        }));
      }
    } catch (err) {
      console.error('[proxy] session bank fetch error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/session/bank — update bank balance */
  if (req.method === 'POST' && url === '/api/session/bank') {
    interface BankUpdate {
      bank: number;
      totalStaked: number;
    }
    let update: BankUpdate | null = null;
    try {
      const body = await readBody(req);
      update = JSON.parse(body) as BankUpdate;
    } catch { /* malformed JSON */ }

    if (!update || typeof update.bank !== 'number') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid bank update' }));
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await sql`
        UPDATE session_bank
        SET bank = ${update.bank}, total_staked = ${update.totalStaked}, updated_at = now()
        WHERE date = ${today}
        RETURNING *
      `;

      if (result.length === 0) {
        // Insert if doesn't exist
        await sql`
          INSERT INTO session_bank (date, bank, total_staked)
          VALUES (${today}, ${update.bank}, ${update.totalStaked})
        `;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        bank: update.bank,
        totalStaked: update.totalStaked,
        date: today,
      }));
    } catch (err) {
      console.error('[proxy] session bank update error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/races/add — add race with runners */
  if (req.method === 'POST' && url === '/api/races/add') {
    interface RaceInput {
      date: string;
      track: string;
      raceNum: number;
      raceTime: string;
      runners: Array<{
        horseName: string;
        jockey: string;
        trainer: string;
        barrier?: number;
        weight?: number;
        odds: number;
      }>;
    }
    let input: RaceInput | null = null;
    try {
      const body = await readBody(req);
      input = JSON.parse(body) as RaceInput;
    } catch { /* malformed JSON */ }

    if (!input || !input.track || !input.runners?.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid race data' }));
      return;
    }

    try {
      // Insert race
      const race = await sql`
        INSERT INTO races (date, track, race_num, race_time)
        VALUES (${input.date}, ${input.track}, ${input.raceNum}, ${input.raceTime})
        ON CONFLICT (date, track, race_num) DO UPDATE SET race_time = EXCLUDED.race_time
        RETURNING id
      `;

      const raceId = race[0].id;

      // Insert runners
      const runners = [];
      for (const r of input.runners) {
        const runner = await sql`
          INSERT INTO runners (race_id, horse_name, jockey, trainer, barrier, weight, odds)
          VALUES (${raceId}, ${r.horseName}, ${r.jockey}, ${r.trainer}, ${r.barrier || null}, ${r.weight || null}, ${r.odds})
          RETURNING *
        `;
        runners.push(runner[0]);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, raceId, runnerCount: runners.length }));
    } catch (err) {
      console.error('[proxy] race add error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/kb/probability — calculate true probability for runner */
  if (req.method === 'GET' && url.startsWith('/api/kb/probability')) {
    const qs = new URLSearchParams(url.split('?')[1] || '');
    const horseName = qs.get('horse');
    const jockey = qs.get('jockey');
    const trainer = qs.get('trainer');
    const track = qs.get('track');
    const odds = parseFloat(qs.get('odds') || '0');

    if (!horseName || !jockey || !trainer || !track || !odds) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing parameters' }));
      return;
    }

    try {
      // Get jockey stats
      const jockeyRow = await sql`SELECT total_runs, total_wins, total_places FROM jockey_stats WHERE jockey_name = ${jockey}`;
      const jockeyWinRate = jockeyRow.length > 0 ? jockeyRow[0].total_wins / Math.max(jockeyRow[0].total_runs, 1) : 0.15;
      const jockeyWeight = Math.min(jockeyRow.length > 0 ? jockeyRow[0].total_runs / 50 : 0.3, 1);

      // Get trainer stats
      const trainerRow = await sql`SELECT total_runs, total_wins, total_places FROM trainer_stats WHERE trainer_name = ${trainer}`;
      const trainerWinRate = trainerRow.length > 0 ? trainerRow[0].total_wins / Math.max(trainerRow[0].total_runs, 1) : 0.15;
      const trainerWeight = Math.min(trainerRow.length > 0 ? trainerRow[0].total_runs / 50 : 0.3, 1);

      // Get horse at track stats
      const horseRow = await sql`SELECT total_runs, total_wins, total_places FROM horse_stats WHERE horse_name = ${horseName} AND track = ${track}`;
      const horseWinRate = horseRow.length > 0 ? horseRow[0].total_wins / Math.max(horseRow[0].total_runs, 1) : 0.12;
      const horseWeight = Math.min(horseRow.length > 0 ? horseRow[0].total_runs / 30 : 0.2, 1);

      // Market implied probability from odds
      const impliedProb = 1 / odds;

      // Weighted true probability
      const trueProb = (
        jockeyWinRate * jockeyWeight * 0.35 +
        trainerWinRate * trainerWeight * 0.35 +
        horseWinRate * horseWeight * 0.20 +
        impliedProb * 0.10
      );

      // Cap between 0.05 and 0.95
      const cappedProb = Math.max(0.05, Math.min(0.95, trueProb));

      // Calculate edge
      const edge = (cappedProb * odds) - 1;
      const hasEdge = edge > 0;

      // Calculate Full Kelly stake
      let kellyStake = 0;
      if (hasEdge) {
        const b = odds - 1;
        const fullKelly = (b * cappedProb - (1 - cappedProb)) / b;
        kellyStake = Math.max(0, fullKelly * 1.0);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        horse: horseName,
        trueProb: (cappedProb * 100).toFixed(1),
        impliedProb: (impliedProb * 100).toFixed(1),
        edge: (edge * 100).toFixed(1),
        hasEdge,
        kellyPercent: (kellyStake * 100).toFixed(2),
        jockeyWinRate: (jockeyWinRate * 100).toFixed(1),
        trainerWinRate: (trainerWinRate * 100).toFixed(1),
        horseWinRate: (horseWinRate * 100).toFixed(1),
      }));
    } catch (err) {
      console.error('[proxy] kb probability error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/admin/update-bet-urls — update source_url for bets */
  if (req.method === 'POST' && url === '/api/admin/update-bet-urls') {
    interface UpdateUrlReq {
      track: string;
      raceNum: number;
      sourceUrl: string;
    }
    let input: UpdateUrlReq | null = null;
    try {
      const body = await readBody(req);
      input = JSON.parse(body) as UpdateUrlReq;
    } catch { /* malformed JSON */ }

    if (!input || !input.track || !input.sourceUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing track, raceNum, or sourceUrl' }));
      return;
    }

    try {
      const result = await sql`
        UPDATE bets
        SET source_url = ${input.sourceUrl}
        WHERE track = ${input.track} AND race_num = ${input.raceNum} AND source_url IS NULL
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Updated ${(result as any).count || 0} bets`,
        track: input.track,
        raceNum: input.raceNum,
      }));
    } catch (err) {
      console.error('[proxy] update urls error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/admin/cleanup-bets — remove old test data and duplicates */
  if (req.method === 'POST' && url === '/api/admin/cleanup-bets') {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Delete all completed bets (old test data)
      const completedDeleted = await sql`
        DELETE FROM bets
        WHERE result IS NOT NULL
      `;

      // Delete bets with zero or negative stakes (invalid bets)
      const invalidDeleted = await sql`
        DELETE FROM bets
        WHERE stake <= 0
      `;

      // Delete duplicate bets by keeping only the first instance of each race+horse
      const allBets = await sql`
        SELECT id, track, race_num, horse, date, row_number() OVER (
          PARTITION BY track, race_num, horse, date ORDER BY created_at ASC
        ) as rn
        FROM bets
        WHERE result IS NULL
      `;

      const duplicateIds = allBets
        .filter((b: any) => b.rn > 1)
        .map((b: any) => b.id);

      let duplicatesDeleted = 0;
      if (duplicateIds.length > 0) {
        const result = await sql`
          DELETE FROM bets
          WHERE id = ANY(${duplicateIds}::uuid[])
        `;
        duplicatesDeleted = result.count || 0;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Database cleaned',
        deleted: {
          completedBets: (completedDeleted as any).count || 0,
          invalidStakes: (invalidDeleted as any).count || 0,
          duplicates: duplicatesDeleted,
        },
      }));
    } catch (err) {
      console.error('[proxy] cleanup error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/roi-timeline — ROI at different bet times (Early vs Closing prices) */
  if (req.method === 'GET' && url === '/api/roi-timeline') {
    try {
      // Analyze ROI based on when bets were placed
      const logs = await sql`
        SELECT
          kelly_stake,
          closing_odds,
          predicted_odds,
          actual_result,
          actual_pnl,
          EXTRACT(HOUR FROM created_at) as hour_placed,
          EXTRACT(EPOCH FROM (created_at))::INTEGER as time_seconds
        FROM kelly_logs
        WHERE actual_result IS NOT NULL AND created_at IS NOT NULL
        ORDER BY created_at
      `;

      const timeGroups: { [key: string]: { pnl: number; count: number; staked: number } } = {};

      for (const log of logs) {
        const hourKey = `${log.hour_placed || 'unknown'}:00`;
        if (!timeGroups[hourKey]) {
          timeGroups[hourKey] = { pnl: 0, count: 0, staked: 0 };
        }

        const pnl = parseFloat(log.actual_pnl || '0');
        const stake = parseFloat(log.kelly_stake || '0');

        timeGroups[hourKey].pnl += pnl;
        timeGroups[hourKey].count += 1;
        timeGroups[hourKey].staked += stake;
      }

      // Calculate ROI at each time
      const timeline = Object.entries(timeGroups).map(([time, data]) => ({
        time,
        totalPnL: parseFloat(data.pnl.toFixed(2)),
        totalStaked: parseFloat(data.staked.toFixed(2)),
        betsCount: data.count,
        roi: data.staked > 0 ? parseFloat(((data.pnl / data.staked) * 100).toFixed(2)) : 0,
        avgPnLPerBet: data.count > 0 ? parseFloat((data.pnl / data.count).toFixed(2)) : 0
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        roiTimeline: timeline,
        insight: timeline.length > 0
          ? `ROI varies by time: ${timeline.map(t => `${t.time}=${t.roi}%`).join(', ')}`
          : 'Not enough data for time-series analysis'
      }));
    } catch (err) {
      console.error('[proxy] roi timeline error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/clev-audit — Closing Expected Value audit (Strategy Validation) */
  if (req.method === 'GET' && url === '/api/clev-audit') {
    try {
      // Get all kelly logs with closing odds
      const logs = await sql`
        SELECT predicted_odds, closing_odds, confidence, expected_value_percent, actual_result, actual_pnl
        FROM kelly_logs
        WHERE closing_odds IS NOT NULL AND closing_odds > 0
        ORDER BY date DESC
      `;

      let edgeFoundCount = 0;
      let edgeFoundWins = 0;
      let totalOddsDiff = 0;
      let maxOddsDiff = 0;

      for (const log of logs) {
        const predicted = parseFloat(log.predicted_odds);
        const closing = parseFloat(log.closing_odds);

        // Edge found = closing odds > predicted odds (market worse than our prediction)
        if (closing > predicted) {
          edgeFoundCount++;
          const oddsDiff = closing - predicted;
          totalOddsDiff += oddsDiff;
          maxOddsDiff = Math.max(maxOddsDiff, oddsDiff);

          // Count wins on edge-found bets
          if (log.actual_result === 'WIN') {
            edgeFoundWins++;
          }
        }
      }

      const totalBets = logs.length;
      const edgeFoundPercent = totalBets > 0 ? (edgeFoundCount / totalBets) * 100 : 0;
      const winRateOnEdge = edgeFoundCount > 0 ? (edgeFoundWins / edgeFoundCount) * 100 : 0;
      const avgOddsDiff = edgeFoundCount > 0 ? totalOddsDiff / edgeFoundCount : 0;

      // Strategy is validated if:
      // 1. Edge Found % > 50% (find value more often than not)
      // 2. Win Rate on edge > 35% (beat the market at reasonable rate)
      const isValidated = edgeFoundPercent > 50 && winRateOnEdge > 35;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        clEvAudit: {
          totalBets,
          edgeFoundCount,
          edgeFoundPercent: parseFloat(edgeFoundPercent.toFixed(1)),
          winRateOnEdgeBets: parseFloat(winRateOnEdge.toFixed(1)),
          avgOddsDiff: parseFloat(avgOddsDiff.toFixed(2)),
          maxOddsDiff: parseFloat(maxOddsDiff.toFixed(2)),
          strategyValidated: isValidated,
          validation: {
            edgeFoundTarget: '> 50%',
            edgeFoundMet: edgeFoundPercent > 50,
            winRateTarget: '> 35%',
            winRateMet: winRateOnEdge > 35,
            message: isValidated
              ? '✓ Strategy VALIDATED - Edge finding is real, not luck'
              : '⏳ Strategy NOT YET VALIDATED - need more data or better picks'
          }
        }
      }));
    } catch (err) {
      console.error('[proxy] clev audit error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/dashboard — get EV-based analytics and ROI stats */
  if (req.method === 'GET' && url === '/api/dashboard') {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get current bank — carry forward from previous day if not already set
      const bankResult = await sql`
        SELECT bank FROM session_bank
        WHERE date = ${today}
      `;
      let bank = 200;
      if (bankResult.length > 0) {
        bank = parseFloat(bankResult[0].bank);
      } else {
        // Check if there's a previous bank value to carry forward
        const prevBank = await sql`
          SELECT bank FROM session_bank
          ORDER BY date DESC LIMIT 1
        `;
        bank = prevBank.length > 0 ? parseFloat(prevBank[0].bank) : 200;
        // Initialize today's bank with carried forward value
        await sql`
          INSERT INTO session_bank (date, bank, total_staked)
          VALUES (${today}, ${bank}, 0)
          ON CONFLICT (date) DO NOTHING
        `;
      }

      // Get all kelly logs (the source of truth for EV tracking)
      // V2 STRATEGY: Only track bets from 2026-04-10 onwards (fresh start)
      const kellyLogs = await sql`
        SELECT expected_value_percent, actual_result, actual_pnl, kelly_stake, predicted_odds, closing_odds
        FROM kelly_logs
        WHERE date::date >= '2026-04-10'
      `;

      // Calculate EV-based metrics
      let totalBets = 0;
      let totalEvPercent = 0;
      let betsWithEdge = 0;
      let cumulativePnL = 0;
      let totalStaked = 0;
      let betsWithResult = 0;
      let actualVsExpectedDiff = 0;

      for (const log of kellyLogs) {
        totalBets++;
        totalStaked += parseFloat(log.kelly_stake);
        const ev = parseFloat(log.expected_value_percent) || 0;
        totalEvPercent += ev;
        if (ev > 0) betsWithEdge++;

        if (log.actual_result) {
          betsWithResult++;
          const pnl = parseFloat(log.actual_pnl) || 0;
          cumulativePnL += pnl;
          // Track if actual profit matches EV prediction
          const expectedProfit = (parseFloat(log.kelly_stake) * ev) / 100;
          actualVsExpectedDiff += Math.abs(pnl - expectedProfit);
        }
      }

      const avgEvPercent = totalBets > 0 ? totalEvPercent / totalBets : 0;
      const edgeFoundPercent = totalBets > 0 ? (betsWithEdge / totalBets) * 100 : 0;
      const roi = totalStaked > 0 ? ((cumulativePnL / totalStaked) * 100) : 0;
      const evValidation = betsWithResult > 0 ? (1 - (actualVsExpectedDiff / betsWithResult) / 100) * 100 : 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        bank: parseFloat(bank),
        // EV Metrics (what matters)
        totalBets,
        betsWithResult,
        totalStaked: parseFloat(totalStaked),
        cumulativePnL: parseFloat(cumulativePnL),
        roi: parseFloat(roi.toFixed(2)),
        // Edge Finding
        betsWithEdge,
        edgeFoundPercent: parseFloat(edgeFoundPercent.toFixed(1)),
        avgEvPercent: parseFloat(avgEvPercent.toFixed(2)),
        // Validation
        evValidationPercent: parseFloat(evValidation.toFixed(1)),
        // Key message
        targetRoi: 10,
        status: roi >= 10 ? 'HITTING TARGET 🎯' : roi >= 0 ? 'POSITIVE' : 'NEGATIVE',
      }));
    } catch (err) {
      console.error('[proxy] dashboard error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/historical/pnl — Get daily Bank & P&L history for charts */
  if (req.method === 'GET' && url === '/api/historical/pnl') {
    try {
      // Get daily bank history
      const bankHistory = await sql`
        SELECT date, bank FROM session_bank
        WHERE date >= '2026-04-10'
        ORDER BY date ASC
      `;

      // Get daily P&L history (cumulative by date)
      const pnlByDate = await sql`
        SELECT
          date::date as date,
          COALESCE(SUM(actual_pnl), 0) as daily_pnl
        FROM kelly_logs
        WHERE date::date >= '2026-04-10' AND actual_result IS NOT NULL
        GROUP BY date::date
        ORDER BY date ASC
      `;

      // Build cumulative P&L
      let cumulativePnL = 0;
      const pnlHistory = pnlByDate.map((row: any) => {
        cumulativePnL += parseFloat(row.daily_pnl);
        return {
          date: row.date,
          pnl: parseFloat(cumulativePnL.toFixed(2)),
        };
      });

      // Merge bank and P&L data by date
      const dateMap = new Map<string, any>();

      // Initialize with bank data
      for (const row of bankHistory) {
        dateMap.set(row.date, {
          date: row.date,
          bank: parseFloat(row.bank),
          pnl: 0,
        });
      }

      // Add P&L data
      for (const row of pnlHistory) {
        const existing = dateMap.get(row.date) || { date: row.date, bank: 200 };
        existing.pnl = row.pnl;
        dateMap.set(row.date, existing);
      }

      const history = Array.from(dateMap.values()).sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        history,
      }));
    } catch (err) {
      console.error('[proxy] historical pnl error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/results/mark-kelly — Directly mark kelly_logs results (bypasses bets table) */
  if (req.method === 'POST' && url === '/api/results/mark-kelly') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { results } = JSON.parse(body); // [{track, raceNum, horse, result}, ...]
        if (!Array.isArray(results)) throw new Error('results must be array');

        let marked = 0;
        const marked_bets = [];

        for (const r of results) {
          const log = await sql`
            SELECT id, kelly_stake, predicted_odds FROM kelly_logs
            WHERE track = ${r.track} AND race_num = ${r.raceNum} AND horse_name = ${r.horse}
            AND actual_result IS NULL
            LIMIT 1
          `;

          if (log.length > 0) {
            const stake = parseFloat(String(log[0].kelly_stake));
            const odds = parseFloat(String(log[0].predicted_odds));
            let pnl = 0;

            if (r.result === 'WIN') {
              pnl = stake * (odds - 1);
            } else if (r.result === 'PLACE') {
              pnl = stake * ((odds - 1) * 0.25);
            } else {
              pnl = -stake;
            }

            await sql`
              UPDATE kelly_logs
              SET actual_result = ${r.result}, actual_pnl = ${pnl}
              WHERE id = ${log[0].id}
            `;

            marked++;
            marked_bets.push(`${r.track} R${r.raceNum} ${r.horse} = ${r.result} (P&L: $${pnl.toFixed(2)})`);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          marked,
          marked_bets,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('[proxy] mark-kelly error:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
    });
    return;
  }

  /* GET /api/kelly/recommend-stake — Calculate Kelly stake from predicted probability + market odds */
  if (req.method === 'GET' && url.startsWith('/api/kelly/recommend-stake')) {
    const qs = new URLSearchParams(url.split('?')[1] || '');
    const predictedProb = parseFloat(qs.get('predicted_prob') || '0');
    const marketOdds = parseFloat(qs.get('market_odds') || '0');
    const bankroll = parseFloat(qs.get('bankroll') || '200');
    const kellyMultiplier = parseFloat(qs.get('multiplier') || '1.0'); // Full Kelly by default

    if (!predictedProb || !marketOdds || predictedProb <= 0 || predictedProb > 1 || marketOdds < 1.01) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Invalid inputs: predicted_prob (0-1) and market_odds (>=1.01) required'
      }));
      return;
    }

    try {
      // Kelly Criterion: f = (bp - q) / b
      // where f = fraction of bankroll, b = odds-1, p = prob, q = 1-p
      const p = predictedProb;
      const b = marketOdds - 1;
      const q = 1 - p;

      // Calculate edge
      const edge = (p * marketOdds) - 1;
      const hasEdge = edge > 0;

      // Calculate full Kelly
      let kellyFraction = 0;
      if (hasEdge) {
        kellyFraction = (b * p - q) / b;
      }

      // Apply multiplier (0.5 = half Kelly, 1.0 = full Kelly)
      const recommendedFraction = kellyFraction * kellyMultiplier;
      const recommendedStake = bankroll * recommendedFraction;

      // Calculate clEV (Closing Expected Value)
      const impliedProb = 1 / marketOdds;
      const clEV = (p * marketOdds) - 1; // As percentage of stake

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        kelly: {
          predictedProb: (p * 100).toFixed(1),
          marketOdds: marketOdds.toFixed(2),
          impliedProb: (impliedProb * 100).toFixed(1),
          edge: hasEdge,
          kellyFraction: (kellyFraction * 100).toFixed(1),
          kellyMultiplier: kellyMultiplier.toFixed(1),
          recommendedFraction: (recommendedFraction * 100).toFixed(1),
          recommendedStake: recommendedStake.toFixed(2),
          bankroll: bankroll.toFixed(2),
          clEV: (clEV * 100).toFixed(1)
        }
      }));
    } catch (err) {
      console.error('[proxy] kelly recommend error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/kelly/log — log a kelly pick with predicted odds and EV */
  if (req.method === 'POST' && url === '/api/kelly/log') {
    interface KellyLogInput {
      date: string;
      track: string;
      raceNum: number;
      horseName: string;
      jockey: string;
      trainer: string;
      predictedOdds: number;
      closingOdds?: number;
      kellyStake: number;
      confidence: number;
    }
    let input: KellyLogInput | null = null;
    try {
      const body = await readBody(req);
      input = JSON.parse(body) as KellyLogInput;
    } catch { /* malformed JSON */ }

    if (!input || !input.horseName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid kelly log data' }));
      return;
    }

    try {
      // Calculate expected value percentage
      let evPercent = 0;
      if (input.closingOdds && input.closingOdds > input.predictedOdds) {
        const predictedProb = 1 / input.predictedOdds;
        const marketProb = 1 / input.closingOdds;
        evPercent = ((predictedProb - marketProb) / marketProb) * 100;
        // Cap at 999.99 to fit DECIMAL(5,2) field
        evPercent = Math.min(evPercent, 999.99);
      }

      await sql`
        INSERT INTO kelly_logs (date, track, race_num, horse_name, jockey, trainer,
                               predicted_odds, closing_odds, kelly_stake, confidence,
                               expected_value_percent)
        VALUES (${input.date}, ${input.track}, ${input.raceNum}, ${input.horseName},
                ${input.jockey}, ${input.trainer}, ${input.predictedOdds},
                ${input.closingOdds || null}, ${input.kellyStake}, ${input.confidence},
                ${evPercent})
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        expectedValuePercent: evPercent.toFixed(2),
        message: `Logged bet with ${evPercent > 0 ? '+' : ''}${evPercent.toFixed(2)}% EV`,
      }));
    } catch (err) {
      console.error('[proxy] kelly log error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/bets/result — record bet result and calculate P&L */
  if (req.method === 'POST' && url === '/api/bets/result') {
    interface BetResultInput {
      betId: string;
      horseName: string;
      jockey: string;
      trainer: string;
      result: 'WIN' | 'PLACE' | 'LOSS';
      pnl: number;
      stakeAmount: number;
    }
    let input: BetResultInput | null = null;
    try {
      const body = await readBody(req);
      input = JSON.parse(body) as BetResultInput;
    } catch { /* malformed JSON */ }

    if (!input || !input.horseName || !input.result) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid result data' }));
      return;
    }

    try {
      // Store bet result
      await sql`
        INSERT INTO bet_results (horse_name, jockey, trainer, result, stake_amount, pnl)
        VALUES (${input.horseName}, ${input.jockey}, ${input.trainer}, ${input.result}, ${input.stakeAmount}, ${input.pnl})
      `;

      // Update KB stats
      const isWin = input.result === 'WIN';
      const isPlace = input.result === 'PLACE';

      await sql`
        INSERT INTO jockey_stats (jockey_name, total_runs, total_wins, total_places)
        VALUES (${input.jockey}, 1, ${isWin ? 1 : 0}, ${isPlace ? 1 : 0})
        ON CONFLICT (jockey_name) DO UPDATE SET
          total_runs = total_runs + 1,
          total_wins = total_wins + ${isWin ? 1 : 0},
          total_places = total_places + ${isPlace ? 1 : 0}
      `;

      await sql`
        INSERT INTO trainer_stats (trainer_name, total_runs, total_wins, total_places)
        VALUES (${input.trainer}, 1, ${isWin ? 1 : 0}, ${isPlace ? 1 : 0})
        ON CONFLICT (trainer_name) DO UPDATE SET
          total_runs = total_runs + 1,
          total_wins = total_wins + ${isWin ? 1 : 0},
          total_places = total_places + ${isPlace ? 1 : 0}
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        pnl: input.pnl,
        message: `Recorded ${input.result}`,
      }));
    } catch (err) {
      console.error('[proxy] bets result error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/runner/result — mark result and update KB */
  if (req.method === 'POST' && url === '/api/runner/result') {
    interface ResultInput {
      horseName: string;
      jockey: string;
      trainer: string;
      track: string;
      result: 'WIN' | 'PLACE' | 'LOSS';
    }
    let input: ResultInput | null = null;
    try {
      const body = await readBody(req);
      input = JSON.parse(body) as ResultInput;
    } catch { /* malformed JSON */ }

    if (!input || !input.horseName || !input.result) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid result data' }));
      return;
    }

    try {
      const isWin = input.result === 'WIN';
      const isPlace = input.result === 'PLACE';

      // Update jockey stats
      await sql`
        INSERT INTO jockey_stats (jockey_name, total_runs, total_wins, total_places)
        VALUES (${input.jockey}, 1, ${isWin ? 1 : 0}, ${isPlace ? 1 : 0})
        ON CONFLICT (jockey_name) DO UPDATE SET
          total_runs = total_runs + 1,
          total_wins = total_wins + ${isWin ? 1 : 0},
          total_places = total_places + ${isPlace ? 1 : 0}
      `;

      // Update trainer stats
      await sql`
        INSERT INTO trainer_stats (trainer_name, total_runs, total_wins, total_places)
        VALUES (${input.trainer}, 1, ${isWin ? 1 : 0}, ${isPlace ? 1 : 0})
        ON CONFLICT (trainer_name) DO UPDATE SET
          total_runs = total_runs + 1,
          total_wins = total_wins + ${isWin ? 1 : 0},
          total_places = total_places + ${isPlace ? 1 : 0}
      `;

      // Update horse at track stats
      await sql`
        INSERT INTO horse_stats (horse_name, track, total_runs, total_wins, total_places)
        VALUES (${input.horseName}, ${input.track}, 1, ${isWin ? 1 : 0}, ${isPlace ? 1 : 0})
        ON CONFLICT (horse_name, track) DO UPDATE SET
          total_runs = total_runs + 1,
          total_wins = total_wins + ${isWin ? 1 : 0},
          total_places = total_places + ${isPlace ? 1 : 0}
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'KB updated' }));
    } catch (err) {
      console.error('[proxy] runner result error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* /health */
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, proxy: 'TrackWise v2', time: new Date().toISOString() }));
    return;
  }

  /* POST /api/backup/db — backup KB database to JSON */
  if (req.method === 'POST' && url === '/api/backup/db') {
    try {
      // Ensure backup directory exists
      const backupDir = '/tmp/trackwise-backups';
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }

      // Get all KB data
      const jockeys = await sql`SELECT jockey_name, total_runs, total_wins, total_places FROM jockey_stats`;
      const trainers = await sql`SELECT trainer_name, total_runs, total_wins, total_places FROM trainer_stats`;
      const horses = await sql`SELECT horse_name, track, total_runs, total_wins, total_places FROM horse_stats`;
      const kellyLogs = await sql`SELECT date, track, race_num, horse_name, predicted_odds, closing_odds, expected_value_percent, actual_result, actual_pnl FROM kelly_logs ORDER BY created_at DESC LIMIT 1000`;
      const betResults = await sql`SELECT horse_name, result, stake_amount, pnl FROM bet_results ORDER BY created_at DESC LIMIT 500`;

      const backup = {
        timestamp: new Date().toISOString(),
        jockeys: jockeys.length,
        trainers: trainers.length,
        horses: horses.length,
        kellyLogs: kellyLogs.length,
        betResults: betResults.length,
        data: {
          jockeys,
          trainers,
          horses,
          kellyLogs: kellyLogs.slice(0, 500),
          betResults: betResults.slice(0, 200),
        }
      };

      // Save to file with timestamp
      const backupDate = new Date().toISOString().split('T')[0];
      const backupFile = `${backupDir}/kb-backup-${backupDate}-${Date.now()}.json`;
      writeFileSync(backupFile, JSON.stringify(backup, null, 2));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Backed up KB to ${backupFile}`,
        backupStats: {
          jockeys: backup.jockeys,
          trainers: backup.trainers,
          horses: backup.horses,
          kellyLogs: backup.kellyLogs,
          betResults: backup.betResults,
          timestamp: backup.timestamp,
        }
      }));
    } catch (err) {
      console.error('[proxy] backup error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* /api/odds/status — scraper health */
  if (url === '/api/odds/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: tabFetchError ? 'error' : 'idle',
      error: tabFetchError ?? '',
      lastFetch: lastTabFetch,
      runnersFound: Object.values(tabOddsCache).reduce((sum, r) => sum + (r?.runners.length ?? 0), 0),
    }));
    return;
  }

  /* POST /api/odds/racenet/batch — fetch market odds via The Odds API */
  if (req.method === 'POST' && url === '/api/odds/racenet/batch') {
    interface TabBatchReq { races: Array<{ track: string; raceNum: number; date?: string }> }
    let req_races: TabBatchReq['races'] = [];
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body) as TabBatchReq;
      req_races = Array.isArray(parsed?.races) ? parsed.races : [];
    } catch { /* malformed JSON */ }

    if (req_races.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'races array required' }));
      return;
    }

    const date = req_races[0].date ?? todayAEST();
    console.log(`[proxy] POST /api/odds/racenet/batch — fetching ${req_races.length} races for ${date} via Odds API`);

    try {
      // Fetch from The Odds API (Australian racing odds aggregator)
      const oddsApiKey = '6ace392331b2445660bd415cee586b00';

      const apiRes = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.the-odds-api.com',
          port: 443,
          path: `/v4/sports/horse_racing_au/events?apiKey=${oddsApiKey}`,
          method: 'GET',
          headers: {
            'User-Agent': 'TrackWise/1.0'
          },
          timeout: 8000
        };

        https.request(options, (apiRes) => {
          let data = '';
          apiRes.on('data', chunk => data += chunk);
          apiRes.on('end', () => resolve({ status: apiRes.statusCode, data }));
        }).on('error', reject).end();
      });

      const oddsData = JSON.parse((apiRes as any).data);

      // Transform Odds API response to odds cache format
      tabOddsCache = {};
      if (oddsData.events) {
        for (const event of oddsData.events) {
          // Parse event name: "Track Name R1" or similar
          const nameMatch = event.name.match(/(.+?)\s+R(\d+)/i);
          const trackName = nameMatch ? nameMatch[1] : event.name;
          const raceNum = nameMatch ? parseInt(nameMatch[2]) : 0;
          const raceKey = `${trackName}-R${raceNum}`;

          tabOddsCache[raceKey] = {
            runners: (event.bookmakers || [])
              .flatMap((bm: any) => bm.markets?.[0]?.outcomes || [])
              .map((outcome: any) => ({
                name: outcome.name,
                price: {
                  decimal: parseFloat(outcome.price || '0')
                }
              }))
              .filter((r: any) => r.price.decimal > 0)
          };
        }
      }

      lastTabFetch = Date.now();
      tabFetchError = null;

      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ success: true, odds: tabOddsCache }));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[proxy] Odds API error:', errMsg);
      tabFetchError = errMsg;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Odds API failed: ${errMsg}`,
        odds: tabOddsCache,
      }));
    }
    return;
  }

  /* GET /api/odds/racenet — query params (kept for compatibility) */
  if (req.method === 'GET' && url.startsWith('/api/odds/racenet')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ odds: tabOddsCache, cached: true }));
    return;
  }

  /* POST /api/odds/closing — fetch closing odds from race result pages (for CLV calculation) */
  if (req.method === 'POST' && url === '/api/odds/closing') {
    interface ClosingOddsReq {
      races: Array<{ track: string; raceNum: number; horse: string; date?: string }>;
    }
    let reqData: ClosingOddsReq | null = null;
    try {
      const body = await readBody(req);
      reqData = JSON.parse(body) as ClosingOddsReq;
    } catch { /* malformed JSON */ }

    if (!reqData?.races || reqData.races.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'races array required' }));
      return;
    }

    try {
      const results: { [key: string]: { closingOdds: number; source: string } } = {};

      // For now, return placeholder (in production, would scrape racenet/TAB result pages)
      // This is a placeholder that should be filled with actual scraping logic
      for (const race of reqData.races) {
        const key = `${race.track}-${race.raceNum}-${race.horse}`;
        // TODO: Scrape race result page from racenet to get closing odds
        // For now, return null to indicate not available
        results[key] = { closingOdds: 0, source: 'placeholder' };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        closingOdds: results,
        message: 'Closing odds lookup (placeholder - implement scraping)',
      }));
    } catch (err) {
      console.error('[proxy] closing odds error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/form/racingAndSports?track=flemington&date=2026-04-02&raceNum=5 */
  if (req.method === 'GET' && url.startsWith('/api/form/racingAndSports') && !url.includes('/batch')) {
    const qMark = url.indexOf('?');
    const qs    = qMark >= 0 ? new URLSearchParams(url.slice(qMark + 1)) : new URLSearchParams();
    const track   = qs.get('track') ?? '';
    const date    = qs.get('date')  ?? todayAEST();
    const raceNum = parseInt(qs.get('raceNum') ?? '1', 10);

    if (!track) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'track parameter required', data: null }));
      return;
    }

    console.log(`[proxy] GET /api/form/racingAndSports — ${track} R${raceNum} ${date}`);
    try {
      const data = await getFormData(track, date, raceNum);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=600' });
      res.end(JSON.stringify({ success: true, data }));
    } catch (err) {
      console.error('[proxy] form scraper error:', err);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err), data: null }));
    }
    return;
  }

  /* POST /api/form/racingAndSports/batch
     Body: { races: [{track, date, raceNum, horseName, marketId, selectionId}] } */
  if (req.method === 'POST' && url === '/api/form/racingAndSports/batch') {
    interface BatchRaceReq { track: string; date: string; raceNum: number; horseName: string; marketId: string; selectionId: string; }
    let races: BatchRaceReq[] = [];
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      races = Array.isArray(parsed?.races) ? parsed.races : [];
    } catch { /* malformed JSON */ }

    console.log(`[proxy] POST /api/form/racingAndSports/batch — ${races.length} horses`);
    const results: Record<string, RunnerForm | null> = {};

    for (const race of races) {
      const key = `${race.marketId}_${race.selectionId}`;
      try {
        const raceData = await getFormData(race.track, race.date, race.raceNum);
        const runner   = raceData?.find(r => fuzzyMatch(r.name, race.horseName)) ?? null;
        results[key]   = runner;
        if (races.indexOf(race) < races.length - 1) await sleep(1500);
      } catch (err) {
        console.error(`[proxy] form batch error for ${race.horseName}:`, err);
        results[key] = null;
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, results }));
    return;
  }

  /* POST /api/results/batch — fetch race results
     Body: { races: [{track, date, raceNum, horse, marketId, selectionId}] } */
  if (req.method === 'POST' && url === '/api/results/batch') {
    interface ResultsReq { track: string; date: string; raceNum: number; horse: string; marketId: string; selectionId: string; }
    let req_races: ResultsReq[] = [];
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      req_races = Array.isArray(parsed?.races) ? parsed.races : [];
    } catch { /* malformed JSON */ }

    if (req_races.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, results: {} }));
      return;
    }

    console.log(`[proxy] POST /api/results/batch — fetching ${req_races.length} race results`);
    const resultsMap: Record<string, RunnerResult | null> = {};

    for (const race of req_races) {
      const key = `${race.marketId}_${race.selectionId}`;
      try {
        const raceResults = await fetchResults([{ track: race.track, raceNum: race.raceNum, date: race.date, horse: race.horse }]);
        resultsMap[key] = raceResults[`${race.track.toUpperCase()}_R${race.raceNum}`] ?? null;
        if (req_races.indexOf(race) < req_races.length - 1) await sleep(1500);
      } catch (err) {
        console.error(`[proxy] results error for ${race.horse}:`, err);
        resultsMap[key] = null;
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, results: resultsMap }));
    return;
  }

  /* POST /api/bets — save a single bet */
  if (req.method === 'POST' && url === '/api/bets') {
    interface BetReq {
      marketId: string;
      selectionId: string;
      track: string;
      raceNum: number;
      date: string;
      horse: string;
      odds: number;
      stake: number;
    }
    let bet: BetReq | null = null;
    try {
      const body = await readBody(req);
      bet = JSON.parse(body) as BetReq;
    } catch { /* malformed JSON */ }

    if (!bet) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid bet object' }));
      return;
    }

    try {
      const inserted = await sql`
        INSERT INTO bets (market_id, selection_id, track, race_num, date, horse, odds, stake, status)
        VALUES (${bet.marketId}, ${bet.selectionId}, ${bet.track}, ${bet.raceNum}, ${bet.date}, ${bet.horse}, ${bet.odds}, ${bet.stake}, 'BET')
        RETURNING *;
      `;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bet: inserted[0] }));
    } catch (err) {
      console.error('[proxy] bet save error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/bets — fetch all bets */
  if (req.method === 'GET' && url === '/api/bets') {
    try {
      const bets = await sql`SELECT * FROM bets ORDER BY created_at DESC LIMIT 100;`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bets }));
    } catch (err) {
      console.error('[proxy] bets fetch error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/bets/active — fetch today's active (pending) bets */
  if (req.method === 'GET' && url === '/api/bets/active') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const bets = await sql`
        SELECT id, track, race_num, horse, jockey, trainer, odds, stake, confidence, race_time, source_url
        FROM bets
        WHERE date = ${today} AND result IS NULL
        ORDER BY created_at DESC
      `;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bets, count: bets.length }));
    } catch (err) {
      console.error('[proxy] active bets fetch error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/bets/archive — fetch completed bets from past 2 days with results */
  if (req.method === 'GET' && url === '/api/bets/archive') {
    try {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

      const bets = await sql`
        SELECT id, track, race_num, horse, jockey, trainer, odds, stake, confidence, result, race_time, created_at, updated_at
        FROM bets
        WHERE result IS NOT NULL AND date >= ${twoDaysAgoStr}
        ORDER BY updated_at DESC
      `;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bets, count: bets.length }));
    } catch (err) {
      console.error('[proxy] archive bets fetch error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/bets/sportsbet — place a bet from Sportsbet form pick */
  if (req.method === 'POST' && url === '/api/bets/sportsbet') {
    interface SportsbetBetReq {
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
    }
    let bet: SportsbetBetReq | null = null;
    try {
      const body = await readBody(req);
      bet = JSON.parse(body) as SportsbetBetReq;
    } catch { /* malformed JSON */ }

    if (!bet || !bet.horse || !bet.track || !bet.raceNum) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid bet data' }));
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const inserted = await sql`
        INSERT INTO bets (
          market_id, selection_id, track, race_num, date, horse, jockey, trainer,
          odds, stake, confidence, race_time, source_url, result, status
        )
        VALUES (
          ${`${bet.track}-${bet.raceNum}`}, ${bet.horse}, ${bet.track}, ${bet.raceNum},
          ${today}, ${bet.horse}, ${bet.jockey}, ${bet.trainer},
          ${bet.odds}, ${bet.stake}, ${bet.confidence}, ${bet.raceTime || null}, ${bet.sourceUrl || null}, NULL, 'PENDING'
        )
        RETURNING id, track, race_num, horse, jockey, trainer, odds, stake, confidence, race_time, source_url
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bet: inserted[0] }));
    } catch (err) {
      console.error('[proxy] sportsbet bet save error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/bets/mark-result — mark bet result and update KB */
  if (req.method === 'POST' && url === '/api/bets/mark-result') {
    interface MarkResultReq {
      betId: string;
      result: 'WIN' | 'PLACE' | 'LOSS';
    }
    let input: MarkResultReq | null = null;
    try {
      const body = await readBody(req);
      input = JSON.parse(body) as MarkResultReq;
    } catch { /* malformed JSON */ }

    if (!input || !input.betId || !input.result) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid input' }));
      return;
    }

    try {
      // Get bet details
      const bet = await sql`
        SELECT id, horse, jockey, trainer, track FROM bets WHERE id = ${input.betId}
      `;

      if (bet.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Bet not found' }));
        return;
      }

      const betRow = bet[0];
      const isWin = input.result === 'WIN';
      const isPlace = input.result === 'PLACE';

      // Update jockey stats (if jockey is not null)
      const winBonus = isWin ? 1 : 0;
      const placeBonus = isPlace ? 1 : 0;

      if (betRow.jockey && betRow.jockey !== 'Unknown') {
        await sql`
          INSERT INTO jockey_stats (jockey_name, total_runs, total_wins, total_places)
          VALUES (${betRow.jockey}, 1, ${winBonus}, ${placeBonus})
          ON CONFLICT (jockey_name) DO UPDATE SET
            total_runs = jockey_stats.total_runs + 1,
            total_wins = jockey_stats.total_wins + ${winBonus},
            total_places = jockey_stats.total_places + ${placeBonus}
        `;
      }

      // Update trainer stats (if trainer is not null)
      if (betRow.trainer && betRow.trainer !== 'Unknown') {
        await sql`
          INSERT INTO trainer_stats (trainer_name, total_runs, total_wins, total_places)
          VALUES (${betRow.trainer}, 1, ${winBonus}, ${placeBonus})
          ON CONFLICT (trainer_name) DO UPDATE SET
            total_runs = trainer_stats.total_runs + 1,
            total_wins = trainer_stats.total_wins + ${winBonus},
            total_places = trainer_stats.total_places + ${placeBonus}
        `;
      }

      // Update horse stats
      await sql`
        INSERT INTO horse_stats (horse_name, track, total_runs, total_wins, total_places)
        VALUES (${betRow.horse}, ${betRow.track}, 1, ${winBonus}, ${placeBonus})
        ON CONFLICT (horse_name, track) DO UPDATE SET
          total_runs = horse_stats.total_runs + 1,
          total_wins = horse_stats.total_wins + ${winBonus},
          total_places = horse_stats.total_places + ${placeBonus}
      `;

      // Get bet details for P&L calculation
      const betDetails = await sql`
        SELECT stake, odds FROM bets WHERE id = ${input.betId}
      `;

      if (betDetails.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Bet details not found' }));
        return;
      }

      const stake = parseFloat(betDetails[0].stake);
      const odds = parseFloat(betDetails[0].odds);

      // Calculate P&L based on result
      let pnl = 0;
      if (input.result === 'WIN') {
        pnl = stake * (odds - 1);
      } else if (input.result === 'PLACE') {
        pnl = stake * ((odds - 1) * 0.25);
      } else if (input.result === 'LOSS') {
        pnl = -stake;
      }

      // Update bet result
      await sql`
        UPDATE bets
        SET result = ${input.result}, status = 'COMPLETED', updated_at = now()
        WHERE id = ${input.betId}
      `;

      // Update bank balance
      const today = new Date().toISOString().split('T')[0];
      const currentBankRes = await sql`
        SELECT bank FROM session_bank
        WHERE date = ${today}
        ORDER BY date DESC LIMIT 1
      `;

      let currentBank = 200;
      if (currentBankRes.length > 0) {
        currentBank = parseFloat(currentBankRes[0].bank);
      }

      const newBank = Math.max(0, currentBank + pnl);

      // Insert or update bank record for today
      await sql`
        INSERT INTO session_bank (date, bank, total_staked)
        VALUES (${today}, ${newBank}, 0)
        ON CONFLICT (date) DO UPDATE SET
          bank = ${newBank}
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Recorded ${input.result} for ${betRow.horse}`,
        pnl: pnl.toFixed(2),
        newBank: newBank.toFixed(2),
        statsUpdated: {
          jockey: betRow.jockey,
          trainer: betRow.trainer,
          horse: betRow.horse
        }
      }));
    } catch (err) {
      console.error('[proxy] mark result error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/kb/live — get current engine state from kb_live.json */
  if (req.method === 'GET' && url === '/api/kb/live') {
    try {
      const kbPath = path.resolve(__dirname, '../public/data/kb_live.json');
      if (existsSync(kbPath)) {
        const data = JSON.parse(readFileSync(kbPath, 'utf-8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, kb: data }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'kb_live.json not found' }));
      }
    } catch (err) {
      console.error('[proxy] kb fetch error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/bets/update — update bet result by betId */
  if (req.method === 'POST' && url === '/api/bets/update') {
    interface BetUpdateReq {
      betId?: string;
      marketId?: string;
      selectionId?: string;
      result: string;
    }
    let update: BetUpdateReq | null = null;
    try {
      const body = await readBody(req);
      update = JSON.parse(body) as BetUpdateReq;
    } catch { /* malformed JSON */ }

    if (!update) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid update object' }));
      return;
    }

    try {
      let updated;

      // Support both betId and marketId/selectionId
      if (update.betId) {
        updated = await sql`
          UPDATE bets
          SET result = ${update.result}, status = 'SETTLED', updated_at = CURRENT_TIMESTAMP
          WHERE id = ${update.betId}
          RETURNING *;
        `;
      } else if (update.marketId && update.selectionId) {
        updated = await sql`
          UPDATE bets
          SET result = ${update.result}, status = 'SETTLED', updated_at = CURRENT_TIMESTAMP
          WHERE market_id = ${update.marketId} AND selection_id = ${update.selectionId}
          RETURNING *;
        `;
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Must provide betId or marketId/selectionId' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bet: updated[0] }));
    } catch (err) {
      console.error('[proxy] bet update error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* /api/ratings/today  or  /api/ratings/YYYY-MM-DD */
  const ratingsMatch = url.match(/^\/api\/ratings\/(today|[\d-]+)(\?.*)?$/);
  if (ratingsMatch) {
    const rawDate = ratingsMatch[1];
    const date    = rawDate === 'today' ? todayAEST() : rawDate;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid date — use YYYY-MM-DD or "today"' }));
      return;
    }

    console.log(`[proxy] GET ratings → ${date}`);
    try {
      const up = await upstream(RATINGS(date));
      if (up.status !== 200) {
        res.writeHead(up.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Betfair returned HTTP ${up.status}` }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'max-age=1800' });
      res.end(up.body);
    } catch (err) {
      console.error('[proxy] upstream error:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Upstream failed: ${err instanceof Error ? err.message : err}` }));
    }
    return;
  }

  /* GET /api/paper-bets — fetch all paper bets */
  if (req.method === 'GET' && url === '/api/paper-bets') {
    try {
      const bets = await sql`SELECT * FROM paper_bets ORDER BY created_at DESC LIMIT 200;`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bets }));
    } catch (err) {
      console.error('[proxy] paper bets fetch error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/paper-bets/result — update paper bet with actual result */
  if (req.method === 'POST' && url === '/api/paper-bets/result') {
    interface ResultUpdate {
      betId: string;
      result: 'WIN' | 'PLACE' | 'LOSS';
    }
    let update: ResultUpdate | null = null;
    try {
      const body = await readBody(req);
      update = JSON.parse(body) as ResultUpdate;
    } catch { /* malformed */ }

    if (!update) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid update' }));
      return;
    }

    try {
      const bet = await sql`SELECT * FROM paper_bets WHERE id = ${update.betId} LIMIT 1;`;
      if (!bet || bet.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Bet not found' }));
        return;
      }

      // Calculate P&L
      const b = bet[0];
      let pl = 0;
      if (update.result === 'WIN') {
        pl = b.win_stake * (b.odds - 1);
      } else if (update.result === 'PLACE') {
        pl = b.place_stake * ((b.odds - 1) / 4);
      } else {
        pl = -b.stake;
      }

      const updated = await sql`
        UPDATE paper_bets
        SET result = ${update.result}, pl = ${parseFloat(pl.toFixed(2))}, result_time = now()
        WHERE id = ${update.betId}
        RETURNING *;
      `;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bet: updated[0] }));
    } catch (err) {
      console.error('[proxy] paper bet result error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/daily-summary — fetch all daily summaries */
  if (req.method === 'GET' && url === '/api/daily-summary') {
    try {
      const summary = await sql`SELECT * FROM daily_summary ORDER BY date DESC;`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, summary }));
    } catch (err) {
      console.error('[proxy] daily summary fetch error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/stats/lifetime — fetch cumulative lifetime stats */
  if (req.method === 'GET' && url === '/api/stats/lifetime') {
    try {
      const stats = await sql`
        SELECT
          COUNT(DISTINCT date) as total_days,
          COUNT(*) as total_bets,
          SUM(total_stake)::DECIMAL as total_stake,
          SUM(total_pl)::DECIMAL as total_pl,
          ROUND(AVG(roi)::NUMERIC, 2) as avg_daily_roi,
          SUM(wins) as total_wins,
          SUM(places) as total_places,
          SUM(losses) as total_losses,
          CASE
            WHEN SUM(total_stake) > 0 THEN ROUND((SUM(total_pl) / SUM(total_stake) * 100)::NUMERIC, 2)
            ELSE 0
          END as lifetime_roi
        FROM daily_summary;
      `;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, stats: stats[0] }));
    } catch (err) {
      console.error('[proxy] lifetime stats error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/form/jockey-stats — top performing jockeys */
  if (req.method === 'GET' && url === '/api/form/jockey-stats') {
    try {
      const jockeys = await sql`
        SELECT jockey_name, total_rides, wins, places, losses, win_pct, avg_odds, updated_at
        FROM jockey_performance
        WHERE total_rides >= 3
        ORDER BY win_pct DESC, total_rides DESC
        LIMIT 50;
      `;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, jockeys }));
    } catch (err) {
      console.error('[proxy] jockey stats error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/form/trainer-stats — top performing trainers */
  if (req.method === 'GET' && url === '/api/form/trainer-stats') {
    try {
      const trainers = await sql`
        SELECT trainer_name, total_rides, wins, places, losses, win_pct, avg_odds, updated_at
        FROM trainer_performance
        WHERE total_rides >= 3
        ORDER BY win_pct DESC, total_rides DESC
        LIMIT 50;
      `;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, trainers }));
    } catch (err) {
      console.error('[proxy] trainer stats error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/form/horse-history?horse={name} — historical performance for horse */
  if (req.method === 'GET' && url.startsWith('/api/form/horse-history')) {
    const params = new URLSearchParams(url.split('?')[1]);
    const horseName = params.get('horse');

    if (!horseName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'horse parameter required' }));
      return;
    }

    try {
      const history = await sql`
        SELECT date, track, race_num, barrier, weight, jockey_name, trainer_name,
               odds, speed_rating, form_score, result, pl
        FROM form_history
        WHERE horse_name = ${horseName}
        ORDER BY date DESC
        LIMIT 20;
      `;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, history, horse: horseName }));
    } catch (err) {
      console.error('[proxy] horse history error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/form/insights — form data insights (high-level) */
  if (req.method === 'GET' && url === '/api/form/insights') {
    try {
      const insights = await sql`
        SELECT
          (SELECT COUNT(DISTINCT jockey_name) FROM jockey_performance WHERE total_rides > 0) as unique_jockeys,
          (SELECT COUNT(DISTINCT trainer_name) FROM trainer_performance WHERE total_rides > 0) as unique_trainers,
          (SELECT COUNT(DISTINCT horse_name) FROM form_history) as unique_horses,
          (SELECT COUNT(*) FROM form_history) as total_form_entries,
          (SELECT ROUND(AVG(win_pct)::NUMERIC, 2) FROM jockey_performance WHERE total_rides > 0) as avg_jockey_win_pct,
          (SELECT ROUND(AVG(win_pct)::NUMERIC, 2) FROM trainer_performance WHERE total_rides > 0) as avg_trainer_win_pct
      `;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, insights: insights[0] }));
    } catch (err) {
      console.error('[proxy] form insights error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* GET /api/scrape-race?url={url} — fetch and return racing.com race page HTML */
  if (req.method === 'GET' && url.startsWith('/api/scrape-race')) {
    const params = new URLSearchParams(url.split('?')[1]);
    const raceUrl = params.get('url');

    if (!raceUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'url parameter required' }));
      return;
    }

    try {
      console.log('[proxy] scraping:', raceUrl);
      const raceRes = await fetch(raceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });
      const html = await raceRes.text();
      console.log('[proxy] scraped HTML length:', html.length);
      // Return first 2000 chars for debugging
      const preview = html.substring(0, 2000);
      console.log('[proxy] preview:', preview);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, html, preview }));
    } catch (err) {
      console.error('[proxy] scrape race error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  /* POST /api/kb/import — bulk import historical races to build KB */
  if (req.method === 'POST' && url === '/api/kb/import') {
    interface HistoricalRace {
      date: string;
      track: string;
      raceNum: number;
      runners: Array<{
        horseName: string;
        jockey: string;
        trainer: string;
        result: 'WIN' | 'PLACE' | 'LOSS';
      }>;
    }
    let input: HistoricalRace[] | null = null;
    try {
      const body = await readBody(req);
      input = JSON.parse(body) as HistoricalRace[];
    } catch { /* malformed JSON */ }

    if (!input || !Array.isArray(input)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Expected array of races' }));
      return;
    }

    try {
      let racesProcessed = 0;
      let statsUpdated = 0;

      for (const race of input) {
        for (const runner of race.runners || []) {
          // Update jockey stats
          const jockeyExists = await sql`SELECT * FROM jockey_stats WHERE jockey_name = ${runner.jockey}`;
          if (jockeyExists.length > 0) {
            await sql`
              UPDATE jockey_stats
              SET total_runs = total_runs + 1,
                  total_wins = total_wins + ${runner.result === 'WIN' ? 1 : 0},
                  total_places = total_places + ${runner.result === 'PLACE' ? 1 : 0},
                  updated_at = now()
              WHERE jockey_name = ${runner.jockey}
            `;
          } else {
            await sql`
              INSERT INTO jockey_stats (jockey_name, total_runs, total_wins, total_places)
              VALUES (${runner.jockey}, 1, ${runner.result === 'WIN' ? 1 : 0}, ${runner.result === 'PLACE' ? 1 : 0})
            `;
          }

          // Update trainer stats
          const trainerExists = await sql`SELECT * FROM trainer_stats WHERE trainer_name = ${runner.trainer}`;
          if (trainerExists.length > 0) {
            await sql`
              UPDATE trainer_stats
              SET total_runs = total_runs + 1,
                  total_wins = total_wins + ${runner.result === 'WIN' ? 1 : 0},
                  total_places = total_places + ${runner.result === 'PLACE' ? 1 : 0},
                  updated_at = now()
              WHERE trainer_name = ${runner.trainer}
            `;
          } else {
            await sql`
              INSERT INTO trainer_stats (trainer_name, total_runs, total_wins, total_places)
              VALUES (${runner.trainer}, 1, ${runner.result === 'WIN' ? 1 : 0}, ${runner.result === 'PLACE' ? 1 : 0})
            `;
          }

          // Update horse stats
          const horseExists = await sql`SELECT * FROM horse_stats WHERE horse_name = ${runner.horseName} AND track = ${race.track}`;
          if (horseExists.length > 0) {
            await sql`
              UPDATE horse_stats
              SET total_runs = total_runs + 1,
                  total_wins = total_wins + ${runner.result === 'WIN' ? 1 : 0},
                  total_places = total_places + ${runner.result === 'PLACE' ? 1 : 0},
                  updated_at = now()
              WHERE horse_name = ${runner.horseName} AND track = ${race.track}
            `;
          } else {
            await sql`
              INSERT INTO horse_stats (horse_name, track, total_runs, total_wins, total_places)
              VALUES (${runner.horseName}, ${race.track}, 1, ${runner.result === 'WIN' ? 1 : 0}, ${runner.result === 'PLACE' ? 1 : 0})
            `;
          }

          statsUpdated++;
        }
        racesProcessed++;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        racesProcessed,
        statsUpdated,
        message: `Imported ${racesProcessed} races and updated ${statsUpdated} runner stats`,
      }));
    } catch (err) {
      console.error('[proxy] KB import error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  // POST /api/kb/enrich - Enrich KB with jockey/trainer data
  if (req.method === 'POST' && url === '/api/kb/enrich') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { csvData } = data;

        if (!csvData || typeof csvData !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'csvData field required (CSV as string)' }));
          return;
        }

        // Parse CSV data
        const lines = csvData.split('\n').filter((l: string) => l.trim());
        const records = new Map<string, { jockey: string; trainer: string }>();

        let isFirstLine = true;
        for (const line of lines) {
          if (isFirstLine) {
            isFirstLine = false;
            continue; // Skip header
          }

          const [date, track, race_num, horse_name, jockey, trainer] = line.split(',').map((f: string) => f.trim());
          if (date && track && race_num && horse_name && jockey && trainer) {
            const key = `${date}-${track}-${race_num}-${horse_name}`;
            records.set(key, { jockey, trainer });
          }
        }

        // Get all Betfair-imported races and enrich them
        let enrichedCount = 0;

        const races = await sql`
          SELECT id, date, track, race_num, runners
          FROM manual_races
          WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        `;

        for (const race of races) {
          const runners = typeof race.runners === 'string' ? JSON.parse(race.runners) : race.runners;
          let modified = false;

          for (const runner of runners) {
            const key = `${race.date}-${race.track}-${race.race_num}-${runner.horseName || runner.name}`;
            const jt = records.get(key);

            if (jt) {
              runner.jockey = jt.jockey;
              runner.trainer = jt.trainer;
              modified = true;
              enrichedCount++;
            }
          }

          if (modified) {
            await sql`
              UPDATE manual_races
              SET runners = ${sql.json(runners)}
              WHERE id = ${race.id}
            `;

            // Re-log enriched runners
            for (const runner of runners) {
              const jt = records.get(`${race.date}-${race.track}-${race.race_num}-${runner.horseName || runner.name}`);
              if (jt) {
                await sql`
                  INSERT INTO kelly_logs (date, track, race_num, horse_name, jockey, trainer, confidence)
                  VALUES (${race.date}, ${race.track}, ${race.race_num}, ${runner.horseName || runner.name}, ${jt.jockey}, ${jt.trainer}, 50)
                  ON CONFLICT (date, track, race_num, horse_name) DO UPDATE SET
                    jockey = EXCLUDED.jockey,
                    trainer = EXCLUDED.trainer
                `;
              }
            }
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          enrichedCount,
          recordsProcessed: records.size,
          message: `Enriched ${enrichedCount} runners with jockey/trainer data`,
        }));
      } catch (err) {
        console.error('[proxy] KB enrich error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  // POST /api/parse-form - Parse Sportsbet Form URL for better predictions
  if (req.method === 'POST' && url === '/api/parse-form') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { url: formUrl } = JSON.parse(body);

        if (!formUrl || !formUrl.includes('sportsbetform.com.au')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Must provide Sportsbet Form URL' }));
          return;
        }

        // Import and use the form parser
        const { default: parseFormCard } = await import('./parse-form-card.js');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Use npm run parse-form <url> to parse Sportsbet Form data',
          url: formUrl,
          instructions: 'Pass parsed runner data to Daily Picks for better confidence scores',
        }));
      } catch (err) {
        console.error('[proxy] Form parse error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  /* POST /api/bets/scrape-results - Scrape Sportsbet results and mark bets */
  if (req.method === 'POST' && url === '/api/bets/scrape-results') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { url: formUrl } = JSON.parse(body);
        console.log(`[proxy] Scraping results from: ${formUrl}`);

        if (!formUrl || !formUrl.includes('sportsbetform.com.au')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Must provide Sportsbet Form URL' }));
          return;
        }

        puppeteerExtra.use(StealthPlugin());
        const browser = await puppeteerExtra.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(30000);

        await page.goto(formUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        }).catch((e) => {
          console.error(`[proxy] Navigation warning: ${e.message}`);
        });

        await new Promise(r => setTimeout(r, 2000));

        const pageData = await page.evaluate(() => {
          const text = document.body.innerText || '';
          return { text };
        });

        // Extract track from page title (most reliable source) before closing browser
        let pageTitle = '';
        try {
          pageTitle = await page.title();
        } catch (e) {
          // Page might be closed, ignore
        }

        await browser.close();

        // Parse results from page text
        const lines = pageData.text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

        // Extract race info
        let raceTrack = 'Unknown';
        let raceNum = 0;

        // Try page title first (most reliable)
        if (pageTitle && raceTrack === 'Unknown') {
          const titleMatch = pageTitle.match(/([A-Za-z\s]+?)\s+Race\s+(\d+)/i);
          if (titleMatch) {
            raceTrack = titleMatch[1].trim();
            raceNum = parseInt(titleMatch[2]);
          }
        }

        // If track not found in title, scan body text with expanded track list
        if (raceTrack === 'Unknown') {
          const allAustralianTracks = /^(Kyneton|Taree|Geraldton|Warwick|Mildura|Swan Hill|Wangaratta|Albury|Ararat|Casterton|Colac|Cranbourne|Moe|Shepparton|Stawell|Werribee|Yarra Valley|Goulburn|Nowra|Port Macquarie|Grafton|Cessnock|Orange|Bathurst|Coffs Harbour|Broken Hill|Mackay|Rockhampton|Ipswich|Sunshine Coast|Longreach|Cairns|Brisbane|Gold Coast|Sydney|Randwick|Rosehill|Flemington|Melbourne|Hobart|Launceston|Adelaide|Perth)/;

          for (const line of lines) {
            if (raceTrack === 'Unknown' && allAustralianTracks.test(line)) {
              raceTrack = line.match(/^(\w+(?:\s+\w+)?)/)?.[1] || 'Unknown';
            }
            if (raceNum === 0) {
              const match = line.match(/[Rr]ace\s*(\d+)|R(\d+)/);
              if (match) raceNum = parseInt(match[1] || match[2]);
            }
          }
        }

        // If still not found in title or body, try page title fallback with regex
        if (raceTrack === 'Unknown' && pageTitle) {
          const fallbackMatch = pageTitle.match(/([A-Za-z\s]+)/);
          if (fallbackMatch) {
            raceTrack = fallbackMatch[1].trim();
          }
        }

        console.log(`[proxy] Extracted: ${raceTrack} R${raceNum}`);

        // Find results section (look for "1st", "Winner", or similar)
        const results: Array<{ position: number; horse: string }> = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase();

          // Look for placings (1st, 2nd, 3rd)
          if (line.includes('1st') || line.includes('winner')) {
            const nextLine = lines[i + 1];
            if (nextLine && !nextLine.includes('st') && !nextLine.includes('th')) {
              results.push({ position: 1, horse: nextLine });
            }
          } else if (line.includes('2nd')) {
            const nextLine = lines[i + 1];
            if (nextLine && !nextLine.includes('st') && !nextLine.includes('th')) {
              results.push({ position: 2, horse: nextLine });
            }
          } else if (line.includes('3rd')) {
            const nextLine = lines[i + 1];
            if (nextLine && !nextLine.includes('st') && !nextLine.includes('th')) {
              results.push({ position: 3, horse: nextLine });
            }
          }
        }

        console.log(`[proxy] Found ${results.length} results: ${results.slice(0, 3).map(r => r.horse).join(', ')}...`);

        // Match with active bets and mark results
        const today = new Date().toISOString().split('T')[0];
        let markedCount = 0;

        // Get active bets for this race
        const activeBets = await sql`
          SELECT id, horse FROM bets
          WHERE track = ${raceTrack} AND race_num = ${raceNum}
          AND date = ${today} AND result IS NULL
        `;

        console.log(`[proxy] Active bets for ${raceTrack} R${raceNum}: ${activeBets.map((b: any) => b.horse).join(', ')}`);

        for (const result of results) {
          try {
            for (const bet of activeBets) {
              // Fuzzy match horse name
              const betHorse = bet.horse.toLowerCase().replace(/[^a-z0-9]/g, '');
              const resultHorse = result.horse.toLowerCase().replace(/[^a-z0-9]/g, '');

              const similarity = betHorse === resultHorse ||
                                betHorse.includes(resultHorse) ||
                                resultHorse.includes(betHorse);

              if (similarity) {
                console.log(`[proxy] MATCHED: ${bet.horse} (bet) = ${result.horse} (result) position ${result.position}`);
                const resultType = result.position === 1 ? 'WIN' : result.position <= 3 ? 'PLACE' : 'LOSS';

                // Mark the bet
                await sql`
                  UPDATE bets
                  SET result = ${resultType}, status = 'COMPLETED', updated_at = now()
                  WHERE id = ${bet.id}
                `;

                // Update KB
                const betData = await sql`SELECT jockey, trainer FROM bets WHERE id = ${bet.id}`;
                if (betData[0]) {
                  const isWin = resultType === 'WIN';
                  const isPlace = resultType === 'PLACE';

                  await sql`
                    INSERT INTO jockey_stats (jockey_name, total_runs, total_wins, total_places)
                    VALUES (${betData[0].jockey}, 1, ${isWin ? 1 : 0}, ${isPlace ? 1 : 0})
                    ON CONFLICT (jockey_name) DO UPDATE SET
                      total_runs = jockey_stats.total_runs + 1,
                      total_wins = jockey_stats.total_wins + ${isWin ? 1 : 0},
                      total_places = jockey_stats.total_places + ${isPlace ? 1 : 0}
                  `;

                  await sql`
                    INSERT INTO trainer_stats (trainer_name, total_runs, total_wins, total_places)
                    VALUES (${betData[0].trainer}, 1, ${isWin ? 1 : 0}, ${isPlace ? 1 : 0})
                    ON CONFLICT (trainer_name) DO UPDATE SET
                      total_runs = trainer_stats.total_runs + 1,
                      total_wins = trainer_stats.total_wins + ${isWin ? 1 : 0},
                      total_places = trainer_stats.total_places + ${isPlace ? 1 : 0}
                  `;
                }

                markedCount++;
                break;
              }
            }
          } catch (e) {
            console.error(`[proxy] Error marking result: ${e}`);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          track: raceTrack,
          raceNum,
          resultsFound: results.length,
          betsMarked: markedCount,
          message: `Marked ${markedCount} bet results from ${raceTrack} R${raceNum}`,
        }));
      } catch (err) {
        console.error('[proxy] Scrape results error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  /* Helper: Look up jockey/trainer KB performance and return confidence boost */
  const getJockeyTrainerBoost = (jockeyName: string, trainerName: string): { jockeyBoost: number; trainerBoost: number; description: string } => {
    let jockeyBoost = 0;
    let trainerBoost = 0;
    let details: string[] = [];

    try {
      // Helper to normalize strike rate (handle both decimal 0.18 and percentage 18.0)
      const normalizeRate = (rate: number): number => rate > 1 ? rate / 100 : rate;

      // Look up jockey
      if (jockeyName && jockeyName !== 'Unknown') {
        const jockey = kbDb.prepare('SELECT strike_rate, tier FROM jockeys WHERE name = ?').get(jockeyName);
        if (jockey && jockey.strike_rate) {
          const winRate = normalizeRate(jockey.strike_rate);
          // Phase 2 jockey weighting: A-tier >20%, B-tier 15-20%, C-tier <15%
          if (winRate > 0.20) {
            jockeyBoost = 18; // A-tier: strong confidence boost
            details.push(`${jockeyName} (A ${(winRate*100).toFixed(1)}%)`);
          } else if (winRate > 0.15) {
            jockeyBoost = 12; // B-tier: moderate boost
            details.push(`${jockeyName} (B ${(winRate*100).toFixed(1)}%)`);
          } else if (winRate > 0.10) {
            jockeyBoost = 6; // C-tier: minor boost
            details.push(`${jockeyName} (C ${(winRate*100).toFixed(1)}%)`);
          }
        }
      }

      // Look up trainer
      if (trainerName && trainerName !== 'Unknown') {
        const trainer = kbDb.prepare('SELECT strike_rate, tier FROM trainers WHERE name = ?').get(trainerName);
        if (trainer && trainer.strike_rate) {
          const winRate = normalizeRate(trainer.strike_rate);
          // Phase 2 trainer weighting: A-tier >15%, B-tier 12-15%, C-tier <12%
          if (winRate > 0.15) {
            trainerBoost = 12; // A-tier: strong confidence boost
            details.push(`${trainerName} (A ${(winRate*100).toFixed(1)}%)`);
          } else if (winRate > 0.12) {
            trainerBoost = 8; // B-tier: moderate boost
            details.push(`${trainerName} (B ${(winRate*100).toFixed(1)}%)`);
          } else if (winRate > 0.10) {
            trainerBoost = 4; // C-tier: minor boost
            details.push(`${trainerName} (C ${(winRate*100).toFixed(1)}%)`);
          }
        }
      }
    } catch (e) {
      // KB lookup failed (database may not be ready), proceed without boost
      console.log(`[KB] Jockey/trainer lookup failed (using form-only scoring): ${e instanceof Error ? e.message : String(e)}`);
    }

    return {
      jockeyBoost,
      trainerBoost,
      description: details.length > 0 ? ` [${details.join(' + ')}]` : '',
    };
  };

  /* POST /api/parse-sportsbet - Parse Sportsbet Form URL and generate picks */
  if (req.method === 'POST' && url === '/api/parse-sportsbet') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { url: formUrl } = JSON.parse(body);
        console.log(`[proxy] Parsing Sportsbet Form: ${formUrl}`);

        if (!formUrl || !formUrl.includes('sportsbetform.com.au')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Must provide Sportsbet Form URL (sportsbetform.com.au)' }));
          return;
        }

        // Use Puppeteer to parse the form
        puppeteerExtra.use(StealthPlugin());

        const browser = await puppeteerExtra.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(30000);

        console.log(`[proxy] Navigating to ${formUrl}...`);
        await page.goto(formUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        }).catch((e) => {
          console.error(`[proxy] Navigation warning (may continue): ${e.message}`);
        });

        await new Promise(r => setTimeout(r, 2000));

        // Extract track from page title first (most reliable source)
        let raceTrack = 'Unknown Track';
        try {
          const pageTitle = await page.title();
          const titleMatch = pageTitle.match(/([A-Za-z\s]+?)\s+Race\s+\d+/i);
          if (titleMatch) {
            raceTrack = titleMatch[1].trim();
          }
        } catch (e) {
          console.log('[proxy] Title extraction skipped');
        }

        const pageData = await page.evaluate(() => {
          const text = document.body.innerText || '';
          return { text };
        });

        await browser.close();

        // Parse runners from text
        const lines = pageData.text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        console.log(`[proxy] Extracted ${lines.length} lines from page`);

        // Extract race information from page
        // raceTrack already initialized above with title extraction
        let raceNum = 0;
        let raceDistance = '';
        let raceTime = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Look for track name - major Australian racing tracks (body scan fallback only if title didn't work)
          if (raceTrack === 'Unknown Track') {
            const trackMatch = line.match(/^(Albury|Ararat|Ascot|Adelaide|Balaklava|Ballarat|Barossa|Beaudesert|Belmont|Belmore Park|Bendigo|Bordertown|Broome|Broken Hill|Bundall|Bunbury|Cairns|Caloundra|Cannington|Carnarvon|Casterton|Casuarina|Cessnock|Champion|Coffs Harbour|Colac|Coolgardie|Cranbourne|Currumbin|Doomben|Derby|Devonport|Dubbo|Eagle Farm|Echuca|Elwick|Fannie Bay|Fitzroy Crossing|Flemington|Geelong|Geraldton|Gosford|Goulburn|Grafton|Groote Eylandt|Hamilton|Hawkesbury|Hobart|Ipswich|Katherine|Kalgoorlie|Kempsey|Kilmore|Kimberley|Kingston Town|Kyneton|Lake Grace|Launceston|Lismore|Longreach|Mackay|Moe|Melbourne|Morphettville|Moree|Mudgee|Mildura|Murray Bridge|Murwillumbah|Newcastle|Northampton|Northam|Nowra|Nymph|Oberon|Onslow|Orange|Pakenham|Palmerston|Pemberton|Perth|Picton|Pinjarra|Port Augusta|Port Hedland|Port Macquarie|Randwick|Rockhampton|Rosehill|Sale|Sandown|Scone|Seymour|Shark Bay|Shepparton|Shoalhaven|South Coast|Southport|Stawell|Strathalbyn|Sunshine Coast|Surfers|Swan Hill|Sydney|Tamworth|Tattersalls|Taree|Three Springs|Toowoomba|Townsville|Traralgon|Trigg|Tweed|Wadeye|Wagga|Wagin|Wangaratta|Warwick|Warrnambool|Werribee|Wickepin|Wyalkatchem|Wyndham|Yarra Valley|York)/);
            if (trackMatch) {
              raceTrack = trackMatch[1];
            }
          }

          // Look for race number (R1, R2, Race 1, Race 2, etc.)
          if (raceNum === 0) {
            const raceMatch = line.match(/[Rr]ace\s*(\d+)|R(\d+)/);
            if (raceMatch) {
              raceNum = parseInt(raceMatch[1] || raceMatch[2]);
            }
          }

          // Look for distance (e.g., "1200m", "2000m")
          if (!raceDistance) {
            const distMatch = line.match(/(\d{3,4})\s*m(?:etres)?/i);
            if (distMatch) {
              raceDistance = distMatch[1] + 'm';
            }
          }

          // Look for race time (HH:MM format, usually appears early in race details)
          if (!raceTime && /\d{1,2}:\d{2}/.test(line)) {
            const timeMatch = line.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              const min = timeMatch[2];
              // Validate it's a reasonable time (0-23 hours)
              if (hour >= 0 && hour < 24) {
                raceTime = `${hour}:${min}`;
              }
            }
          }
        }

        console.log(`[proxy] Extracted race: ${raceTrack} Race ${raceNum} ${raceDistance} @ ${raceTime}`);

        const picks: any[] = [];
        let runnerNum = 0;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // More flexible barrier detection: match lines starting with 1-2 digits followed by space and text
          const barrierMatch = line.match(/^(\d{1,2})\s+/);

          if (barrierMatch) {
            const barrier = parseInt(barrierMatch[1]);
            // Be lenient with barrier range (1-30 covers most racing)
            if (barrier > 0 && barrier <= 30) {
              // Skip obvious non-runner lines (like form descriptions)
              const testHorse = line.replace(/^\d{1,2}\s+/, '').trim();
              if (testHorse.includes('year old') || testHorse.includes('gelding') || testHorse.includes('horse') || testHorse.length < 2) {
                continue;
              }

              runnerNum++;

              // Extract horse name and other data - split by tab if present
              let horseName = line.replace(/^\d{1,2}\s+/, '').trim();
              let jockey = 'Unknown';
              let trainer = 'Unknown';
              let weight: number | undefined;
              let odds: number | undefined;

              // If line has tab-separated data, extract from parts
              if (horseName.includes('\t')) {
                const parts = horseName.split('\t').map(p => p.trim());
                horseName = parts[0] || horseName;
                // parts[1] might be jockey, parts[2] might be trainer, etc.
                if (parts.length > 1) jockey = parts[1].replace(/\(\)/g, '').trim() || 'Unknown';
                if (parts.length > 2) trainer = parts[2].replace(/\(\)/g, '').trim() || 'Unknown';
              }

              // Clean up horse name (remove extra whitespace)
              horseName = horseName.replace(/\s+/g, ' ').trim();

              // Extract odds from the same line if present (look for decimals at end)
              const oddsMatch = line.match(/\$?(\d+\.\d{2})\s*$/);
              if (oddsMatch) {
                const oddsVal = parseFloat(oddsMatch[1]);
                if (oddsVal >= 1.01 && oddsVal <= 999) {
                  odds = oddsVal;
                }
              }

              // Look ahead for weight, jockey, trainer and odds (expand search window)
              for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                const nextLine = lines[j];

                // Stop if we hit the next barrier
                if (/^\d{1,2}\s+/.test(nextLine)) break;

                // Weight: look for decimal numbers like 53.5 or 54.0
                if (!weight && /^(\d{2})\.([50])$/.test(nextLine)) {
                  const m = nextLine.match(/^(\d{2})\.([50])$/);
                  if (m) weight = parseFloat(`${m[1]}.${m[2]}`);
                }

                // Odds: look for decimal numbers like 3.45 or 5.20 (if not found in main line)
                if (!odds && /^\d+\.\d{2}$/.test(nextLine)) {
                  const val = parseFloat(nextLine);
                  // Validate odds are in reasonable range (1.01 to 999)
                  if (val >= 1.01 && val <= 999) {
                    odds = val;
                  }
                }

                // Jockey: look for names (capital letters, spaces allowed, no numbers)
                if (jockey === 'Unknown' && /^[A-Z][A-Za-z\s]{2,}$/.test(nextLine) && nextLine.length < 40) {
                  jockey = nextLine;
                }

                // Trainer: look for similar pattern after jockey
                if (trainer === 'Unknown' && jockey !== 'Unknown' && /^[A-Z][A-Za-z\s]{2,}$/.test(nextLine) && nextLine !== jockey && nextLine.length < 40) {
                  trainer = nextLine;
                }
              }

              // Calculate confidence based on form data + KB performance
              let confidence = 50; // Base confidence

              // Barrier bonus
              if (barrier <= 3) confidence += 18;
              else if (barrier <= 6) confidence += 12;
              else if (barrier <= 10) confidence += 6;
              else confidence += 2;

              // Weight bonus (lighter is better)
              if (weight) {
                if (weight < 53) confidence += 12;
                else if (weight < 56) confidence += 8;
                else if (weight < 60) confidence += 4;
              } else {
                confidence += 3; // Unknown weight gets small boost
              }

              // Odds bonus (higher odds = potentially better value)
              if (odds) {
                if (odds >= 8) confidence += 8;
                else if (odds >= 5) confidence += 6;
                else if (odds >= 3) confidence += 3;
                else if (odds >= 2) confidence += 1;
              } else {
                confidence -= 5; // No odds penalty
              }

              // Phase 2 Hybrid: KB jockey/trainer performance boost (70% of model weight)
              const { jockeyBoost, trainerBoost, description: kbDesc } = getJockeyTrainerBoost(jockey, trainer);
              confidence += jockeyBoost + trainerBoost;
              const kbNote = kbDesc ? kbDesc : '';

              // Only add valid runners
              if (horseName.length >= 3) {
                const finalConfidence = Math.min(Math.max(confidence, 15), 100);
                const boost = jockeyBoost + trainerBoost;
                if (boost > 0) {
                  console.log(`  [KB] ${horseName}: +${boost}% from KB (${jockey}/${trainer})${kbNote}`);
                }
                picks.push({
                  number: runnerNum,
                  horse: horseName,
                  jockey,
                  trainer,
                  barrier,
                  weight,
                  odds: odds || 0,
                  confidence: finalConfidence,
                  track: raceTrack,
                  raceNum,
                  raceDistance,
                  raceTime,
                });
              }
            }
          }
        }

        console.log(`[proxy] Found ${picks.length} runners before filtering`);

        // Filter and sort by confidence, take top 5
        const topPicks = picks
          .filter(p => p.confidence >= 40) // Lower threshold to 40
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 5) // Get top 5 instead of 3
          .map(p => ({
            horse: p.horse,
            jockey: p.jockey,
            trainer: p.trainer,
            barrier: p.barrier,
            weight: p.weight,
            odds: p.odds,
            confidence: p.confidence,
            track: p.track,
            raceNum: p.raceNum,
            raceDistance: p.raceDistance,
            raceTime: p.raceTime,
          }));

        console.log(`[proxy] Generated ${topPicks.length} picks after filtering (threshold: 40%)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: topPicks.length > 0,
          picks: topPicks,
          totalRunners: picks.length,
          message: topPicks.length > 0
            ? `Generated ${topPicks.length} picks from ${picks.length} runners`
            : `No picks met threshold (found ${picks.length} runners, lowest confidence: ${picks.length > 0 ? Math.max(...picks.map(p => p.confidence)) : 0}%)`,
        }));
      } catch (err) {
        console.error('[proxy] Sportsbet parse error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  // GET /api/races/today
  if (req.method === 'GET' && url.startsWith('/api/races/today')) {
    try {
      const raceScript = path.resolve(__dirname, './get-today-races.ts');
      let output = '';
      try {
        output = execSync(`npx tsx ${raceScript}`, {
          encoding: 'utf-8',
          cwd: path.resolve(__dirname, '..'),
          timeout: 60000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (execErr) {
        console.error('[proxy] Race extraction error:', execErr);
      }

      const urls = output.split('\n').filter(l => l.startsWith('https://') && l.includes('sportsbetform.com.au'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: urls.length, urls: urls }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: String(err) }));
    }
    return;
  }

  // POST /api/results/scrape — Fire-and-forget async scraper
  if (req.method === 'POST' && url === '/api/results/scrape') {
    // Return immediately, scraper runs in background
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Scraper started in background',
      timestamp: new Date().toISOString()
    }));

    // Run scraper asynchronously (don't wait for it)
    const resultsScript = path.resolve(__dirname, './fetch-results-tab.ts');
    const { spawn } = await import('child_process');
    const scraper = spawn('npx', ['tsx', resultsScript], {
      cwd: path.resolve(__dirname, '..'),
      detached: true,
      stdio: 'pipe'
    });

    let output = '';
    scraper.stdout?.on('data', (data) => {
      output += data.toString();
      console.log('[scraper] stdout:', data.toString().trim());
    });

    scraper.stderr?.on('data', (data) => {
      console.error('[scraper] stderr:', data.toString().trim());
    });

    scraper.on('close', (code) => {
      console.log(`[scraper] completed with code ${code}`);
      const successMatch = output?.match(/Updated:\s*(\d+)\s+bets?/i);
      if (successMatch) {
        console.log(`[scraper] Updated ${successMatch[1]} bets`);
      }
    });

    scraper.unref();
    return;
  }

  /* GET /api/races/today — Extract today's Australian races from Sportsbet Form */
  if (req.method === 'GET' && url === '/api/races/today') {
    try {
      const browser = await puppeteerExtra
        .use(StealthPlugin())
        .launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
          ],
        });

      const page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });

      const AUSTRALIAN_TRACK_IDS: Record<string, string> = {
        '435951': 'Alice Springs',
        '435956': 'Doomben',
        '435963': 'Benalla',
        '435964': 'Ballina',
        '435965': 'Warrnambool',
        '435966': 'Rockhampton',
        '435967': 'Toowoomba',
        '435975': 'Werribee',
        '435979': 'Morphettville',
        '435955': 'Goulburn',
        '435974': 'Caulfield',
        '436054': 'Bowen',
        '436088': 'Ascot',
        '436089': 'Narrogin',
        '436344': 'Newcastle'
      };

      await page.goto('https://www.sportsbetform.com.au/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      const races = await page.evaluate((trackIds) => {
        const raceLinks = [];
        document.querySelectorAll('a').forEach(link => {
          const href = link.href;
          const match = href.match(/sportsbetform\.com\.au\/(\d+)\/(\d+)\//);
          if (match && trackIds[match[1]]) {
            raceLinks.push({
              href,
              trackId: match[1],
              trackName: trackIds[match[1]]
            });
          }
        });
        return raceLinks.filter((r, i, arr) => arr.findIndex(x => x.href === r.href) === i);
      }, AUSTRALIAN_TRACK_IDS);

      await browser.close();

      const urls = races.map(r => r.href);
      const trackCounts = new Map<string, number>();
      races.forEach(r => {
        trackCounts.set(r.trackName, (trackCounts.get(r.trackName) || 0) + 1);
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        urls,
        total: urls.length,
        trackCount: trackCounts.size,
        tracks: Object.fromEntries(trackCounts)
      }));
    } catch (err) {
      console.error('[proxy] races/today error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }));
    }
    return;
  }

  // 404 Not Found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', routes: [
    '/health',
    '/api/ratings/today',
    '/api/ratings/YYYY-MM-DD',
    'POST /api/odds/racenet/batch   body:{races:[{track,raceNum,date?}]} — TAB live odds',
    'GET  /api/odds/status',
    'GET  /api/form/racingAndSports?track=flemington&date=YYYY-MM-DD&raceNum=5',
    'POST /api/form/racingAndSports/batch  body:{races:[{track,date,raceNum,horseName,marketId,selectionId}]}',
    'GET  /api/paper-bets — Paper trading bets',
    'POST /api/paper-bets/result — Update paper bet result',
    'GET  /api/daily-summary — Daily P&L summaries',
    'GET  /api/stats/lifetime — Lifetime cumulative stats',
    'GET  /api/form/jockey-stats — Top performing jockeys (accumulated history)',
    'GET  /api/form/trainer-stats — Top performing trainers (accumulated history)',
    'GET  /api/form/horse-history?horse=NAME — Historical performance for horse',
    'GET  /api/form/insights — Form knowledge base insights',
    'POST /api/kb/enrich body:{csvData} — Enrich KB with jockey/trainer CSV data',
    'GET  /api/races/today — Extract today\'s Sportsbet race links',
    'POST /api/results/scrape — Fetch completed race results from Racing.com and update bets',
  ] }));
});

server.listen(PORT, async () => {
  await initDB();
  console.log(`\n  ✓ TrackWise proxy v2  →  http://localhost:${PORT}`);
  console.log(`  Betfair ratings       →  GET /api/ratings/today`);
  console.log(`  TAB live odds         →  POST /api/odds/racenet/batch`);
  console.log(`  R&S form data         →  GET /api/form/racingAndSports`);
  console.log(`  Bet persistence       →  POST /api/bets, GET /api/bets, POST /api/bets/update`);
  console.log(`  Health check          →  GET /health`);
  console.log(`  No API keys required.\n`);
});

process.on('SIGINT',  () => { process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${PORT} already in use — proxy may already be running.\n`);
  } else {
    console.error('[proxy] server error:', err);
  }
  process.exit(1);
});
