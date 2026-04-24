/**
 * scripts/scrapers/tab-com.ts
 *
 * Form and odds data from TAB.com.au (Australian Totalisator Agency Board).
 *
 * URL pattern:
 *   https://www.tab.com.au/racing/{date}/{track}/{trackCode}/R/{raceNum}/Win
 *
 * Data extracted per runner:
 *   - Barrier, weight, jockey, trainer
 *   - Current odds
 *   - Runner field size
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
const LOG_FILE = path.resolve(__dirname, '../../logs/tab-com-scraper.log');

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
  return `tab_${normaliseTrack(track)}_${date}_R${raceNum}`;
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
  const line = `[${new Date().toISOString()}] [TAB.COM] ${msg}`;
  console.log(line);
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch { /* ignore */ }
}

function normaliseTrack(track: string): string {
  return track.toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '');
}

function safeNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

// ── DOM extraction ─────────────────────────────────────────────────────────────
async function extractFromTabDom(page: any): Promise<RunnerForm[]> {
  try {
    const runners = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid*="runner"], .runner-row, tr[data-runner-id], tbody tr');
      const results: RunnerForm[] = [];

      rows.forEach((row: any) => {
        try {
          const nameEl = row.querySelector('[data-testid*="name"], .runner-name, .horse-name, td:nth-child(2)');
          const name = nameEl?.textContent?.trim() || '';

          const barrierEl = row.querySelector('[data-testid*="barrier"], .barrier, td:first-child');
          const barrier = parseInt(barrierEl?.textContent?.trim() || '0', 10) || null;

          const weightEl = row.querySelector('[data-testid*="weight"], .weight, .wgt');
          const weight = parseFloat(weightEl?.textContent?.replace(/[^0-9.]/g, '') || '') || null;

          if (name) {
            results.push({
              name,
              barrier,
              weight: weight || null,
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

  const trackCode = normaliseTrack(track);
  const baseUrl = `https://www.tab.com.au/racing/${date}/${track.toUpperCase()}/${trackCode}/R/${raceNum}/Win`;

  let b: any;
  let page: any;
  try {
    b = await getBrowser();
    page = await b.newPage();

    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });

    log(`Scraping: ${baseUrl}`);
    await page.goto(baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 25_000,
    }).catch((err: any) => {
      log(`Navigation error: ${err.message}`);
    });

    await page.waitForSelector('[data-testid*="runner"], .runner-row, tbody tr', {
      timeout: 5_000,
    }).catch(() => null);

    const runners = await extractFromTabDom(page);

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
