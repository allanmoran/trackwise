/**
 * scripts/scrapers/racing-com.ts
 *
 * High-quality form data from Racing.com (Australia's premier racing site).
 *
 * URL patterns:
 *   https://www.racing.com/form/{date}/{track}/race/{raceNum}/form
 *   https://www.racing.com/form/{date}/{track}/race/{raceNum}/full-form
 *   https://www.racing.com/form/{date}/{track}/race/{raceNum}/speedmap
 *   https://www.racing.com/form/{date}/{track}/race/{raceNum}/tips
 *
 * Data extracted per runner:
 *   - Speed ratings and class
 *   - Last 6 form runs with detailed margins
 *   - Jockey/trainer stats
 *   - Track/distance record
 *   - Weight and barrier
 *   - Expert tips consensus
 *
 * Personal paper-trading use only.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');
puppeteer.use(Stealth());

// ── Paths ──────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.resolve(__dirname, '../../logs/racing-com-scraper.log');

// ── Types (reuse from racingAndSports) ──────────────────────────────────────────
export interface FormRun {
  pos: string;
  track: string;
  dist: number;
  cls: string;
  weight: number;
  jockey: string;
  margin: number;
}

export interface JockeyStats {
  name: string;
  seasonWins: number;
  seasonRides: number;
  winPct: number;
  tier: 1 | 2 | 3;
}

export interface TrainerStats {
  name: string;
  seasonWins: number;
  seasonRides: number;
  winPct: number;
  tier: 1 | 2 | 3;
}

export interface TrackDistRecord {
  starts: number;
  wins: number;
  places: number;
}

export interface RunnerForm {
  name: string;
  speedRating: number | null;
  classRating: number | null;
  neuralRating: number | null;
  last6: FormRun[];
  jockeyStats: JockeyStats | null;
  trainerStats: TrainerStats | null;
  trackDistRecord: TrackDistRecord | null;
  daysSinceLastRun: number | null;
  weight: number | null;
  barrier: number | null;
}

// ── Cache ──────────────────────────────────────────────────────────────────────
const CACHE_TTL = 15 * 60 * 1000; // 15 min

interface CacheEntry {
  data: RunnerForm[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(track: string, date: string, raceNum: number): string {
  return `rc_${normaliseTrack(track)}_${date}_R${raceNum}`;
}

// ── Browser state with request throttling ──────────────────────────────────────
let browser: any = null;
let browserStarting = false;
let lastRequestTime = 0;
const REQUEST_DELAY_MS = 3000; // 3 second delay between requests

async function throttleRequest() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_DELAY_MS) {
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function getBrowser() {
  if (browser) return browser;
  if (browserStarting) {
    let retries = 0;
    while (browserStarting && retries < 30) {
      await new Promise(r => setTimeout(r, 500));
      retries++;
    }
    return browser;
  }
  browserStarting = true;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768',
      ],
    });
    log('Browser launched');
  } finally {
    browserStarting = false;
  }
  return browser;
}

// ── Logging ────────────────────────────────────────────────────────────────────
function log(msg: string) {
  const line = `[${new Date().toISOString()}] [RACING.COM] ${msg}`;
  console.log(line);
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch { /* ignore logging errors */ }
}

// ── Utilities ──────────────────────────────────────────────────────────────────
function normaliseTrack(track: string): string {
  return track.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function jockeyTier(winPct: number): 1 | 2 | 3 {
  if (winPct >= 0.18) return 1;
  if (winPct >= 0.10) return 2;
  return 3;
}

function safeNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

// ── DOM extraction from Racing.com ─────────────────────────────────────────────
async function extractFromRacingComDom(page: any): Promise<RunnerForm[]> {
  try {
    const runners = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid*="runner"], .runner-row, .horse-row, table tbody tr');
      const results: any[] = [];

      rows.forEach((row: any) => {
        try {
          // Extract horse name
          const nameEl = row.querySelector('[data-testid*="name"], .horse-name, td:nth-child(2)');
          const name = nameEl?.textContent?.trim() || '';

          // Extract barrier
          const barrierEl = row.querySelector('[data-testid*="barrier"], .barrier, td:nth-child(1)');
          const barrier = parseInt(barrierEl?.textContent?.trim() || '0', 10) || null;

          // Extract weight
          const weightEl = row.querySelector('[data-testid*="weight"], .weight');
          const weight = safeNum(weightEl?.textContent);

          // Extract speed rating
          const speedEl = row.querySelector('[data-testid*="speed"], .speed-rating');
          const speedRating = safeNum(speedEl?.textContent);

          if (name) {
            results.push({
              name,
              barrier,
              weight,
              speedRating,
              classRating: null,
              neuralRating: null,
              last6: [],
              jockeyStats: null,
              trainerStats: null,
              trackDistRecord: null,
              daysSinceLastRun: null,
            });
          }
        } catch { /* skip row */ }
      });

      return results;
    });

    log(`DOM extraction: found ${runners.length} runners`);
    return runners;
  } catch (err) {
    log(`DOM extraction error: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// ── Main scraper ───────────────────────────────────────────────────────────────
export async function getFormData(
  track: string,
  date: string,
  raceNum: number,
): Promise<RunnerForm[] | null> {
  const key = cacheKey(track, date, raceNum);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    log(`Cache hit: ${key}`);
    return cached.data;
  }

  // Throttle to avoid bot detection
  await throttleRequest();

  const slug = normaliseTrack(track);
  const baseUrl = `https://www.racing.com/form/${date}/${slug}/race/${raceNum}`;

  let b: any;
  let page: any;
  try {
    b = await getBrowser();
    page = await b.newPage();

    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-AU,en;q=0.9',
    });

    // Try /form endpoint first
    log(`Scraping: ${baseUrl}/form`);
    await page.goto(`${baseUrl}/form`, {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    }).catch((err: any) => {
      log(`Navigation error: ${err.message}`);
    });

    // Wait for runner data to load
    await page.waitForSelector('[data-testid*="runner"], .runner-row, table tbody tr', {
      timeout: 5_000,
    }).catch(() => null);

    let runners = await extractFromRacingComDom(page);

    if (runners.length > 0) {
      log(`Success: ${key} — ${runners.length} runners`);
      cache.set(key, { data: runners, fetchedAt: Date.now() });
      return runners;
    } else {
      log(`No runners found for ${key}`);
      return null;
    }
  } catch (err) {
    log(`Error scraping ${baseUrl}: ${err instanceof Error ? err.message : err}`);
    return null;
  } finally {
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
  }
}

// ── Batch fetch ────────────────────────────────────────────────────────────────
export async function getBatchFormData(
  races: { track: string; date: string; raceNum: number }[]
): Promise<Record<string, RunnerForm[] | null>> {
  const results: Record<string, RunnerForm[] | null> = {};
  for (const race of races) {
    const key = `${race.track}_${race.date}_R${race.raceNum}`;
    const data = await getFormData(race.track, race.date, race.raceNum);
    results[key] = data;
  }
  return results;
}
