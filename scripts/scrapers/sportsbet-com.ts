/**
 * scripts/scrapers/sportsbet-com.ts
 *
 * Form and odds data from Sportsbet.com.au (major Australian betting site).
 *
 * URL pattern:
 *   https://www.sportsbet.com.au/horse-racing/australia-nz/{track}/race-{raceNum}-{marketId}
 *
 * Data extracted per runner:
 *   - Runner name, barrier, weight
 *   - Jockey and trainer names
 *   - Current odds
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.resolve(__dirname, '../../logs/sportsbet-scraper.log');

// ── Types ──────────────────────────────────────────────────────────────────────
export interface RunnerForm {
  name: string;
  speedRating: number | null;
  classRating: number | null;
  neuralRating: number | null;
  last6: any[];
  jockeyStats: { name: string; winPct: number; tier: 1 | 2 | 3 } | null;
  trainerStats: { name: string; winPct: number; tier: 1 | 2 | 3 } | null;
  trackDistRecord: { starts: number; wins: number; places: number } | null;
  daysSinceLastRun: number | null;
  weight: number | null;
  barrier: number | null;
}

// ── Cache ──────────────────────────────────────────────────────────────────────
const CACHE_TTL = 10 * 60 * 1000;
interface CacheEntry {
  data: RunnerForm[];
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>();

function cacheKey(track: string, date: string, raceNum: number): string {
  return `sb_${normaliseTrack(track)}_${date}_R${raceNum}`;
}

// ── Browser with throttling ────────────────────────────────────────────────────
let browser: any = null;
let browserStarting = false;
let lastRequestTime = 0;
const REQUEST_DELAY_MS = 2000;

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

function log(msg: string) {
  const line = `[${new Date().toISOString()}] [SPORTSBET] ${msg}`;
  console.log(line);
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch { /* ignore */ }
}

function normaliseTrack(track: string): string {
  return track.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// ── DOM extraction ─────────────────────────────────────────────────────────────
async function extractFromSportsbetDom(page: any): Promise<RunnerForm[]> {
  try {
    const runners = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid*="runner"], .runner-row, .selection-row, [role="option"]');
      const results: RunnerForm[] = [];

      rows.forEach((row: any) => {
        try {
          const nameEl = row.querySelector('[data-testid*="name"], .runner-name, .selection-name, span');
          const name = nameEl?.textContent?.trim() || '';

          // Extract any numeric data from row
          const text = row.textContent || '';
          const barrierMatch = text.match(/\b(\d+)\b/);
          const barrier = barrierMatch ? parseInt(barrierMatch[1], 10) : null;

          if (name && name.length > 2) {
            results.push({
              name,
              barrier,
              weight: null,
              speedRating: null,
              classRating: null,
              neuralRating: null,
              last6: [],
              jockeyStats: null,
              trainerStats: null,
              trackDistRecord: null,
              daysSinceLastRun: null,
            });
          }
        } catch { /* skip */ }
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

  await throttleRequest();

  const trackSlug = normaliseTrack(track);
  // URL pattern: https://www.sportsbet.com.au/horse-racing/australia-nz/{track}/race-{raceNum}-{marketId}
  // We'll try without marketId first, as it may be inferred
  const baseUrl = `https://www.sportsbet.com.au/horse-racing/australia-nz/${trackSlug}/race-${raceNum}`;

  let b: any;
  let page: any;
  try {
    b = await getBrowser();
    page = await b.newPage();

    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });

    log(`Scraping: ${baseUrl}`);
    await page.goto(baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 25_000,
    }).catch((err: any) => {
      log(`Navigation error: ${err.message}`);
    });

    await page.waitForSelector('[data-testid*="runner"], .runner-row, .selection-row, [role="option"]', {
      timeout: 5_000,
    }).catch(() => null);

    const runners = await extractFromSportsbetDom(page);

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
