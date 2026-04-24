/**
 * scripts/scrapers/sportsbet.ts
 *
 * Fetches live win/place odds from Sportsbet using Puppeteer + stealth plugin.
 *
 * IMPORTANT — Legal / ToS notice:
 *   Sportsbet's Terms of Service prohibit automated scraping of their platform.
 *   This module is intended for personal paper-trading research only.
 *   Do not use in production, commercially, or at scale.
 *   Use at your own risk.
 *
 * Implementation strategy:
 *   Rather than fragile CSS selector scraping (Sportsbet is a React SPA whose
 *   class names change frequently), we intercept the XHR/fetch calls that the
 *   Sportsbet page makes to its own internal racing API.  This gives us clean
 *   JSON rather than parsed HTML, and is far more stable across UI updates.
 */

// ── Imports ─────────────────────────────────────────────────────────────────
// puppeteer-extra is CJS; use createRequire to load it from this ESM module.
import { createRequire } from 'node:module';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// ── Paths ────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE  = path.resolve(__dirname, '../../logs/scraper.log');

// ── Types ────────────────────────────────────────────────────────────────────
export interface RunnerOdds {
  horse:      string;  // normalised name
  rawName:    string;  // as Sportsbet shows it
  winOdds:    number;
  placeOdds:  number;
  scratched:  boolean;
  startTime?: string;
}

export interface RaceOdds {
  track:      string;
  raceNum:    number;
  runners:    RunnerOdds[];
  fetchedAt:  number;  // Date.now()
}

export type OddsCache = Record<string, RaceOdds>;  // key: "TRACK_R3"

// ── AEST helpers ─────────────────────────────────────────────────────────────
const AEST_TZ = 'Australia/Sydney';

function todayAEST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AEST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function aestHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('en-AU', { timeZone: AEST_TZ, hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
}

function isRacingHours(): boolean {
  const h = aestHour();
  return h >= 9 && h < 19;
}

// ── Logging ──────────────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* log dir may not exist yet */ }
}

// ── Name normalisation for fuzzy matching ────────────────────────────────────
function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// Levenshtein distance for fuzzy matching
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function fuzzyMatch(a: string, b: string, threshold = 0.80): boolean {
  const na = normaliseName(a), nb = normaliseName(b);
  if (na === nb) return true;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return true;
  const similarity = 1 - levenshtein(na, nb) / maxLen;
  return similarity >= threshold;
}

// ── Track → State lookup ─────────────────────────────────────────────────────
const TRACK_TO_STATE: Record<string, string> = {
  'flemington':    'vic',
  'caulfield':     'vic',
  'moonee-valley': 'vic',
  'moe':           'vic',
  'bendigo':       'vic',
  'ballarat':      'vic',
  'sandown':       'vic',
  'cranbourne':    'vic',
  'seymour':       'vic',
  'pakenham':      'vic',
  'geelong':       'vic',
  'randwick':      'nsw',
  'rosehill':      'nsw',
  'warwick-farm':  'nsw',
  'canterbury':    'nsw',
  'kembla-grange': 'nsw',
  'newcastle':     'nsw',
  'gosford':       'nsw',
  'hawkesbury':    'nsw',
  'mudgee':        'nsw',
  'tamworth':      'nsw',
  'eagle-farm':    'qld',
  'doomben':       'qld',
  'ipswich':       'qld',
  'cairns':        'qld',
  'toowoomba':     'qld',
  'gold-coast':    'qld',
  'sunshine-coast':'qld',
  'morphettville': 'sa',
  'mount-gambier': 'sa',
  'murray-bridge': 'sa',
  'ascot':         'wa',
  'belmont':       'wa',
  'pinjarra':      'wa',
  'bunbury':       'wa',
  'albany':        'wa',
  'elwick':        'tas',
  'tattersalls':   'tas',
  'darwin':        'nt',
  'alice-springs': 'nt',
  'canberra':      'act',
};

function trackToSlug(track: string): string {
  return track.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function trackToState(track: string): string {
  const slug = trackToSlug(track);
  return TRACK_TO_STATE[slug] ?? 'au';
}

function buildRaceUrl(track: string, raceNum: number, date: string): string {
  const state = trackToState(track);
  const slug  = trackToSlug(track);
  return `https://www.sportsbet.com.au/racing/horse-racing/${state}/${slug}/${date}/race-${raceNum}`;
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

let cache: OddsCache   = {};
let browser: any       = null;
let lastFetch: number  = 0;
let fetchInProgress    = false;

export type ScraperStatus = 'idle' | 'running' | 'ok' | 'error';
let scraperStatus: ScraperStatus = 'idle';
let scraperError  = '';

export function getStatus(): { status: ScraperStatus; error: string; lastFetch: number } {
  return { status: scraperStatus, error: scraperError, lastFetch };
}

export function getCachedOdds(): OddsCache {
  return cache;
}

// ── Browser management ───────────────────────────────────────────────────────
async function getBrowser() {
  if (browser) {
    try { await browser.version(); return browser; } catch { browser = null; }
  }
  log('INFO', 'Launching headless Chrome with stealth plugin');
  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080',
    ],
  });
  return browser;
}

async function closeBrowser() {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
    log('INFO', 'Browser closed');
  }
}

// ── Core scraping function ───────────────────────────────────────────────────
/**
 * Scrapes odds for a single race by navigating to the race page and
 * intercepting Sportsbet's internal API calls.
 *
 * Network interception approach:
 *   We watch for XHR/fetch responses matching Sportsbet's internal bet-offer
 *   or market-data endpoints. The JSON these return contains runner names and
 *   prices in a structured format.
 *
 * NOTE: The exact API endpoint paths are inferred from common Sportsbet
 *   network patterns.  If this stops working, open DevTools → Network tab
 *   on any Sportsbet race page and look for calls containing "bet-offer",
 *   "market", or "racing/event" — update ODDS_URL_PATTERNS accordingly.
 */
const ODDS_URL_PATTERNS = [
  /api\.sportsbet\.com\.au.*bet-offer/i,
  /api\.sportsbet\.com\.au.*racing.*event/i,
  /api\.sportsbet\.com\.au.*market/i,
  /sportsbet\.com\.au.*\/api\/.*race/i,
];

interface RawRunner {
  name?:          string;
  runnerName?:    string;
  displayName?:   string;
  winPrice?:      number;
  placePrice?:    number;
  displayOdds?:   { win?: number; place?: number };
  status?:        string;
  scratched?:     boolean;
  returnWin?:     number;
  returnPlace?:   number;
}

function parseRunnersFromJson(data: unknown): RunnerOdds[] {
  // Sportsbet's JSON structure varies — walk the object looking for runner arrays
  const results: RunnerOdds[] = [];

  function extract(obj: unknown) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(extract); return; }

    const o = obj as Record<string, unknown>;

    // Look for objects that smell like runner/betOffer objects
    const nameKeys   = ['runnerName', 'name', 'displayName', 'selectionName'];
    const winKeys    = ['winPrice', 'returnWin', 'win', 'winOdds'];
    const placeKeys  = ['placePrice', 'returnPlace', 'place', 'placeOdds'];
    const scrKeys    = ['scratched', 'isScratched', 'status'];

    const rawName = nameKeys.reduce((v, k) => v || (typeof o[k] === 'string' ? o[k] as string : ''), '');
    const winOdds = winKeys.reduce((v, k) => v || (typeof o[k] === 'number' && o[k] > 1 ? o[k] as number : 0), 0);
    const placeOdds = placeKeys.reduce((v, k) => v || (typeof o[k] === 'number' && o[k] > 1 ? o[k] as number : 0), 0);
    const scratched = scrKeys.some(k =>
      o[k] === true || o[k] === 'SCRATCHED' || o[k] === 'Scratched',
    );

    // Check nested displayOdds structure
    const displayOdds = o['displayOdds'] as Record<string, number> | undefined;
    const dWin   = displayOdds?.win   ?? displayOdds?.Win   ?? 0;
    const dPlace = displayOdds?.place ?? displayOdds?.Place ?? 0;

    const finalWin   = winOdds   || dWin;
    const finalPlace = placeOdds || dPlace;

    if (rawName && finalWin > 1) {
      results.push({
        horse:     normaliseName(rawName),
        rawName,
        winOdds:   finalWin,
        placeOdds: finalPlace || (finalWin - 1) / 4 + 1, // estimate if not present
        scratched,
      });
    }

    // Recurse into all object values
    Object.values(o).forEach(v => {
      if (v && typeof v === 'object') extract(v);
    });
  }

  extract(data);

  // Deduplicate by normalised name (keep last seen — most complete)
  const seen = new Map<string, RunnerOdds>();
  for (const r of results) seen.set(r.horse, r);
  return Array.from(seen.values());
}

async function scrapeRace(track: string, raceNum: number, date: string): Promise<RunnerOdds[]> {
  const url    = buildRaceUrl(track, raceNum, date);
  const label  = `${track} R${raceNum}`;
  log('INFO', `Scraping ${label} → ${url}`);

  const b    = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language':  'en-AU,en;q=0.9',
      'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Encoding':  'gzip, deflate, br',
    });

    const capturedRunners: RunnerOdds[] = [];

    // Intercept API responses matching known patterns
    page.on('response', async (response: any) => {
      const respUrl = response.url();
      if (!ODDS_URL_PATTERNS.some(p => p.test(respUrl))) return;
      try {
        const json = await response.json();
        const runners = parseRunnersFromJson(json);
        if (runners.length > 0) {
          log('INFO', `  API intercept: ${runners.length} runners from ${respUrl.slice(0, 80)}`);
          capturedRunners.push(...runners);
        }
      } catch { /* not JSON or parse error — skip */ }
    });

    // Random delay 2–5s before navigation — reduces fingerprinting from instant requests
    const delay = 2000 + Math.floor(Math.random() * 3000);
    log('INFO', `  ${label}: waiting ${delay}ms before navigation`);
    await new Promise(r => setTimeout(r, delay));

    // Navigate directly to the race URL (more reliable than going via homepage)
    const navResult = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout:   30_000,
    });

    if (navResult.status() === 404) {
      log('WARN', `  ${label}: 404 — race page not found (URL may need adjustment for this track)`);
      return [];
    }

    // Wait for the price buttons to appear — confirms odds are loaded and page isn't a bot wall
    let oddsLoaded = false;
    try {
      await page.waitForSelector('[data-automation-id="price-button"]', { timeout: 15_000 });
      oddsLoaded = true;
      log('INFO', `  ${label}: price buttons visible`);
    } catch {
      log('WARN', `  ${label}: price buttons not found within 15s — may be bot-detected or page structure changed`);
    }

    // If odds loaded, also try DOM extraction as primary path (faster than API interception)
    if (oddsLoaded && capturedRunners.length === 0) {
      const domRunners = await page.evaluate(() => {
        const results: Array<{ rawName: string; winOdds: number; scratched: boolean }> = [];

        // Each runner row — Sportsbet wraps them in a container with the runner name nearby
        // and price buttons with data-automation-id="price-button"
        const priceButtons = document.querySelectorAll('[data-automation-id="price-button"]');
        priceButtons.forEach(btn => {
          // Walk up to find the runner container, then find the runner name
          let el: Element | null = btn;
          let runnerName = '';
          let scratched  = false;
          for (let depth = 0; depth < 8 && el; depth++) {
            el = el.parentElement;
            if (!el) break;
            // Look for a sibling or descendant with the runner name
            const nameEl = el.querySelector(
              '[data-automation-id="runner-name"], [class*="runnerName"], [class*="runner-name"]',
            );
            if (nameEl?.textContent?.trim()) {
              runnerName = nameEl.textContent.trim();
              break;
            }
            // Check for scratched indicator
            if (el.textContent?.toLowerCase().includes('scratched')) scratched = true;
          }

          const priceText = btn.textContent?.replace(/[^0-9.]/g, '') ?? '';
          const price     = parseFloat(priceText);
          if (runnerName && price > 1) {
            results.push({ rawName: runnerName, winOdds: price, scratched });
          }
        });

        return results;
      }).catch(() => []);

      if (domRunners.length > 0) {
        log('INFO', `  ${label}: ${domRunners.length} runners from DOM price buttons`);
        for (const r of domRunners) {
          capturedRunners.push({
            horse:     r.rawName.toLowerCase().replace(/[^a-z0-9]/g, '').trim(),
            rawName:   r.rawName,
            winOdds:   r.winOdds,
            placeOdds: (r.winOdds - 1) / 4 + 1,
            scratched: r.scratched,
          });
        }
      }
    }

    // Small extra wait to capture any delayed API calls
    if (capturedRunners.length === 0) {
      await new Promise(r => setTimeout(r, 1500));
    }

    // Fallback: look for window state blobs
    if (capturedRunners.length === 0) {
      log('WARN', `  ${label}: No odds from API interception or DOM — trying page state`);
      const pageData = await page.evaluate(() => {
        const win = window as Record<string, unknown>;
        return JSON.stringify(
          win.__PRELOADED_STATE__ ??
          win.__INITIAL_STATE__   ??
          win.__DATA__            ??
          null,
        );
      });

      if (pageData && pageData !== 'null') {
        try {
          const runners = parseRunnersFromJson(JSON.parse(pageData));
          capturedRunners.push(...runners);
          if (runners.length > 0) log('INFO', `  ${label}: ${runners.length} runners from page state`);
        } catch { /* ignore */ }
      }
    }

    if (capturedRunners.length === 0) {
      log('WARN', [
        `  ${label}: Could not extract odds.`,
        `  → Check logs/scraper.log and open ${url} in DevTools`,
        `  → Network tab: look for API calls containing "bet-offer", "market", or runner data`,
        `  → Update ODDS_URL_PATTERNS in sportsbet.ts to match`,
      ].join('\n'));
    } else {
      log('INFO', `  ${label}: ${capturedRunners.length} runners captured`);
    }

    // Deduplicate
    const seen = new Map<string, RunnerOdds>();
    for (const r of capturedRunners) seen.set(r.horse, r);
    return Array.from(seen.values());

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', `  ${label}: ${msg}`);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
export interface ScrapeRequest {
  track:   string;
  raceNum: number;
}

/**
 * Fetch odds for the requested races.
 * Uses cache — only re-fetches if entry is older than CACHE_TTL_MS.
 */
export async function fetchOdds(races: ScrapeRequest[]): Promise<OddsCache> {
  if (fetchInProgress) {
    log('INFO', 'Fetch already in progress — returning cache');
    return cache;
  }

  fetchInProgress = true;
  scraperStatus   = 'running';
  const date      = todayAEST();

  try {
    let anyFetched = false;

    for (const { track, raceNum } of races) {
      const key = `${track.toUpperCase()}_R${raceNum}`;
      const existing = cache[key];
      const age = existing ? Date.now() - existing.fetchedAt : Infinity;

      if (age < CACHE_TTL_MS) {
        log('INFO', `Cache hit: ${key} (${Math.round(age / 1000)}s old)`);
        continue;
      }

      try {
        const runners = await scrapeRace(track, raceNum, date);
        cache[key] = { track, raceNum, runners, fetchedAt: Date.now() };
        anyFetched = true;
      } catch (err: unknown) {
        log('ERROR', `Failed to scrape ${key}: ${err instanceof Error ? err.message : err}`);
        // Keep stale cache rather than removing entry
      }
    }

    scraperStatus = 'ok';
    scraperError  = '';
    if (anyFetched) lastFetch = Date.now();
  } catch (err: unknown) {
    scraperStatus = 'error';
    scraperError  = err instanceof Error ? err.message : String(err);
    log('ERROR', `fetchOdds: ${scraperError}`);
  } finally {
    fetchInProgress = false;
  }

  return cache;
}

// ── Auto-refresh loop ────────────────────────────────────────────────────────
const REFRESH_INTERVAL = 4 * 60 * 1000;
let   refreshTimer: ReturnType<typeof setTimeout> | null = null;
let   autoRaces: ScrapeRequest[] = [];

export function setAutoRefreshRaces(races: ScrapeRequest[]) {
  autoRaces = races;
}

async function autoRefreshTick() {
  if (autoRaces.length === 0) return;

  if (!isRacingHours()) {
    log('INFO', 'Outside racing hours — scraper paused');
    return;
  }

  log('INFO', `Auto-refresh: ${autoRaces.length} races`);
  await fetchOdds(autoRaces).catch(err =>
    log('ERROR', `Auto-refresh error: ${err instanceof Error ? err.message : err}`),
  );
}

export function startAutoRefresh() {
  if (refreshTimer) return;
  log('INFO', 'Auto-refresh started');
  const tick = async () => {
    await autoRefreshTick();
    refreshTimer = setTimeout(tick, REFRESH_INTERVAL);
  };
  refreshTimer = setTimeout(tick, REFRESH_INTERVAL);
}

export function stopAutoRefresh() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  closeBrowser().catch(() => {});
  log('INFO', 'Auto-refresh stopped');
}

// ── Helper: find odds for a horse by fuzzy name match ────────────────────────
export function findRunnerOdds(
  cache: OddsCache,
  track: string,
  raceNum: number,
  horseName: string,
): RunnerOdds | undefined {
  const key = `${track.toUpperCase()}_R${raceNum}`;
  const race = cache[key];
  if (!race) return undefined;
  return race.runners.find(r => fuzzyMatch(r.rawName, horseName));
}
