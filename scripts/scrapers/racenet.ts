/**
 * scripts/scrapers/racenet.ts
 *
 * Fetches race data from Racenet.com.au — a publicly accessible AU racing
 * information site aggregating odds from Sportsbet, TAB, Ladbrokes + others.
 *
 * Provides richer data than a direct bookmaker scrape:
 *   • Multi-bookmaker win/place odds + best available
 *   • Track condition, rail, weather
 *   • Barrier, jockey, trainer, weight
 *   • Last 5 starts form string
 *   • Trainer & jockey win strike rates
 *   • Scratchings
 *
 * Personal paper-trading use only. Racenet's ToS prohibits automated scraping.
 *
 * URL pattern: https://www.racenet.com.au/horse-racing/{track}/{date}/race-{n}
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require   = createRequire(import.meta.url);
const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
puppeteer.use(Stealth());

// ── Paths ─────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE  = path.resolve(__dirname, '../../logs/scraper.log');

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BookmakerOdds {
  sportsbet?:  number;
  tab?:        number;
  ladbrokes?:  number;
  bluebet?:    number;
  ubet?:       number;
  neds?:       number;
  best:        number;   // best win available across all books
  bestBook:    string;   // name of the best book
  place?:      number;   // best place odds
}

export interface RunnerData {
  // Identity
  horse:       string;   // normalised lowercase no-punct
  rawName:     string;   // as Racenet shows it
  barrier:     number;
  scratched:   boolean;
  // Form
  jockey:      string;
  trainer:     string;
  weight:      string;   // e.g. "57.0"
  form:        string;   // last 5 starts e.g. "x1243"
  jockeyWin:   number;   // win strike rate 0–1 (e.g. 0.15)
  trainerWin:  number;   // win strike rate 0–1
  // Odds
  odds:        BookmakerOdds;
}

export interface RaceInfo {
  // Race-level data
  track:       string;
  raceNum:     number;
  condition:   string;   // e.g. "Good 4"
  rail:        string;   // e.g. "True" or "2m out"
  weather:     string;
  distance:    number;   // metres
  cls:         string;   // "Maiden", "BM78", etc.
  // Runners
  runners:     RunnerData[];
  fetchedAt:   number;
}

export type RacenetCache = Record<string, RaceInfo>;  // key: "TRACK_R3"

// ── AEST helpers ──────────────────────────────────────────────────────────────
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
function isRacingHours(): boolean { const h = aestHour(); return h >= 9 && h < 19; }

// ── Logging ───────────────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

// ── Name normalisation + fuzzy match ─────────────────────────────────────────
export function normaliseName(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}
export function fuzzyMatch(a: string, b: string, threshold = 0.80): boolean {
  const na = normaliseName(a), nb = normaliseName(b);
  if (na === nb) return true;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return true;
  let m = 0;
  const shorter = na.length <= nb.length ? na : nb;
  const longer  = na.length <= nb.length ? nb : na;
  for (const ch of shorter) if (longer.includes(ch)) m++;
  return m / maxLen >= threshold;
}

// ── Track slug (Racenet uses lowercased-hyphenated names) ─────────────────────
function trackSlug(track: string): string {
  return track.toLowerCase()
    .replace(/\bmt\b/g, 'mount').replace(/\bst\b/g, 'saint')
    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function buildUrl(track: string, raceNum: number, date: string): string {
  return `https://www.racenet.com.au/form-guide/${trackSlug(track)}/${date}/race-${raceNum}`;
}

// ── Parse helpers ─────────────────────────────────────────────────────────────
function parseFloat2(s: string | undefined | null): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}
function parsePct(s: string | undefined | null): number {
  // "15%" or "15.3%" or "15" → 0.15
  const n = parseFloat2(s);
  return n > 1 ? n / 100 : n;
}

// ── Browser ───────────────────────────────────────────────────────────────────
let browser: any = null;

async function getBrowser() {
  if (browser) {
    try { await browser.version(); return browser; } catch { browser = null; }
  }
  log('INFO', 'Launching headless Chrome (stealth)');
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
  if (browser) { try { await browser.close(); } catch {} browser = null; }
}

// ── Core scrape ───────────────────────────────────────────────────────────────
/**
 * Scrape a single Racenet race page.
 *
 * Strategy (in order):
 *  1. Network interception — Racenet calls its own API for odds/form data.
 *     Watch for responses matching RACENET_API_PATTERNS and extract JSON.
 *  2. DOM extraction — parse the rendered HTML table of runners using
 *     common Racenet selectors. More fragile but works as fallback.
 *
 * If either step yields runners, merge the data sets and return.
 *
 * NOTE: Racenet's internal API paths and DOM structure can change without
 * notice.  If scraping breaks, open DevTools → Network on any Racenet race
 * page and look for JSON responses with runner/odds arrays, then update
 * RACENET_API_PATTERNS accordingly.  DOM selectors are centralised in
 * SEL below for easy updating.
 */

// Patterns for Racenet's internal API calls (inferred — update if broken)
const RACENET_API_PATTERNS = [
  /racenet\.com\.au\/api.*race/i,
  /racenet\.com\.au\/api.*runner/i,
  /racenet\.com\.au\/api.*form/i,
  /api\.racenet\.com\.au/i,
  /racenet\.com\.au.*\/api\//i,
];

// CSS selectors — centralised so they're easy to update when Racenet redeploys
const SEL = {
  // Race info bar
  condition:   '[data-testid="track-condition"], .track-condition, [class*="trackCondition"]',
  rail:        '[data-testid="rail-position"],   .rail-position,  [class*="railPosition"]',
  weather:     '[data-testid="weather"],         .weather,        [class*="weather"]',
  distance:    '[data-testid="race-distance"],   .race-distance,  [class*="distance"]',
  raceClass:   '[data-testid="race-class"],      .race-class,     [class*="raceClass"]',

  // Runner table rows (Racenet renders a table/list of runners)
  runnerRow:   [
    '[data-testid="runner-row"]',
    '[class*="RunnerRow"]',
    '[class*="runner-row"]',
    'tr[class*="runner"]',
    '.runner-card',
    '[class*="runnerCard"]',
  ].join(', '),

  // Within each runner row
  runnerName:  '[data-testid="runner-name"],  [class*="runnerName"],  [class*="horse-name"],  .runner-name',
  barrier:     '[data-testid="barrier"],      [class*="barrier"]',
  jockey:      '[data-testid="jockey"],       [class*="jockey"]',
  trainer:     '[data-testid="trainer"],      [class*="trainer"]',
  weight:      '[data-testid="weight"],       [class*="weight"]',
  form:        '[data-testid="form"],         [class*="form-string"],  [class*="formString"]',
  jockeyWin:   '[data-testid="jockey-win"],   [class*="jockeyStrike"],  [class*="jockey-strike"]',
  trainerWin:  '[data-testid="trainer-win"],  [class*="trainerStrike"], [class*="trainer-strike"]',
  scratched:   '[class*="scratch"],  [data-testid*="scratch"]',

  // Bookmaker odds (Racenet shows a price comparison grid)
  // Sportsbet column
  sbOdds:      '[data-testid*="sportsbet"] [class*="price"], [class*="SBprice"], td[class*="sportsbet"]',
  tabOdds:     '[data-testid*="tab"]       [class*="price"], [class*="TABprice"], td[class*="tab"]',
  lbOdds:      '[data-testid*="ladbrokes"] [class*="price"], [class*="LBprice"], td[class*="ladbrokes"]',
  bestOdds:    '[data-testid="best-odds"], [class*="bestOdds"], [class*="best-odds"]',
  placeOdds:   '[data-testid="place-odds"], [class*="placeOdds"], [class*="place-odds"]',
};

// Attempt to find text content from the first matching selector
function findText(root: Element | Document, ...selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent.trim();
    } catch {}
  }
  return '';
}

async function scrapeRace(track: string, raceNum: number, date: string): Promise<RaceInfo | null> {
  const url   = buildUrl(track, raceNum, date);
  const label = `${track} R${raceNum}`;
  log('INFO', `Scraping ${label} → ${url}`);

  const b    = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-AU,en;q=0.9',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });

    // Intercept Racenet's internal API calls
    const apiRunners: RunnerData[] = [];
    let   apiCondition = '';

    page.on('response', async (res: any) => {
      const rUrl = res.url() as string;
      const ct   = (res.headers()['content-type'] ?? '') as string;
      // Log ALL JSON API responses (not page HTML) for diagnosis
      if (ct.includes('application/json') || ct.includes('text/plain')) {
        log('INFO', `  NET ${res.status()} ${rUrl.slice(0, 120)}`);
      }
      if (!RACENET_API_PATTERNS.some(p => p.test(rUrl))) return;
      try {
        const json = await res.json();
        const extracted = extractRunnersFromJson(json);
        if (extracted.runners.length > 0) {
          log('INFO', `  API hit: ${extracted.runners.length} runners from ${rUrl.slice(0, 80)}`);
          apiRunners.push(...extracted.runners);
          if (extracted.condition) apiCondition = extracted.condition;
        } else {
          log('INFO', `  API matched pattern but 0 runners: ${rUrl.slice(0, 80)}`);
        }
      } catch {}
    });

    // Random delay 2–4s
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

    const nav = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 });
    const finalUrl = page.url();
    log('INFO', `  ${label}: nav status=${nav.status()} finalUrl=${finalUrl}`);

    if (nav.status() === 404 || finalUrl.includes('/404')) {
      log('WARN', `  ${label}: 404. URL: ${url}`);
      return null;
    }

    // Wait for runner table to appear (confirms page loaded and isn't a bot wall)
    let domOk = false;
    try {
      await page.waitForSelector(SEL.runnerRow, { timeout: 15_000 });
      domOk = true;
      log('INFO', `  ${label}: runner rows visible`);
    } catch {
      log('WARN', `  ${label}: runner rows not found — waiting extra 5s then dumping DOM`);
      await new Promise(r => setTimeout(r, 5000));
      const snapshot = await page.evaluate(() => {
        // Get all unique class names — handle both string and SVGAnimatedString
        const classes = new Set<string>();
        document.querySelectorAll('[class]').forEach(el => {
          const cn = typeof el.className === 'string' ? el.className : '';
          cn.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
        });
        const relevant = Array.from(classes).filter(c => /runner|horse|field|form|odds|price|barrier|starter|silk|jockey|trainer/i.test(c));
        // All data-* attributes in use
        const dataAttrs = new Set<string>();
        document.querySelectorAll('[data-testid],[data-cy],[data-v-]').forEach(el => {
          Array.from(el.attributes).forEach(a => { if (a.name.startsWith('data-')) dataAttrs.add(`${a.name}="${a.value}"`); });
        });
        // Page title and body length
        const title = document.title;
        const bodyLen = document.body.innerHTML.length;
        // First 2000 chars of text content (to see if page rendered)
        const bodyText = document.body.innerText?.slice(0, 500) ?? '';
        // Sample element tags
        const tags = Array.from(new Set(Array.from(document.querySelectorAll('body *')).map(e => e.tagName))).slice(0, 30);
        return { relevant, dataAttrs: Array.from(dataAttrs).slice(0, 30), title, bodyLen, bodyText, tags };
      }).catch(e => ({ relevant: [], dataAttrs: [], title: '', bodyLen: -1, bodyText: String(e), tags: [] }));
      log('INFO', `  ${label}: title="${snapshot.title}" bodyLen=${snapshot.bodyLen}`);
      log('INFO', `  ${label}: bodyText: ${snapshot.bodyText.replace(/\n/g,' ').slice(0,300)}`);
      log('INFO', `  ${label}: relevant classes: ${snapshot.relevant.join(', ')}`);
      log('INFO', `  ${label}: data-testids: ${snapshot.dataAttrs.join(' | ')}`);
      log('INFO', `  ${label}: tags: ${snapshot.tags.join(',')}`);
    }

    // ── DOM extraction ────────────────────────────────────────────────────────
    const domResult = domOk ? await page.evaluate((sel: typeof SEL) => {
      function txt(root: Element | Document, ...ss: string[]): string {
        for (const s of ss) {
          try { const e = root.querySelector(s); if (e?.textContent?.trim()) return e.textContent.trim(); } catch {}
        }
        return '';
      }
      function num(s: string): number { const n = parseFloat(s.replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; }
      function pct(s: string): number { const n = num(s); return n > 1 ? n / 100 : n; }

      // Race-level info
      const condition = txt(document, sel.condition);
      const rail      = txt(document, sel.rail);
      const weather   = txt(document, sel.weather);
      const distance  = num(txt(document, sel.distance));
      const cls       = txt(document, sel.raceClass);

      // Runner rows
      const rows = Array.from(document.querySelectorAll(sel.runnerRow));
      const runners = rows.map(row => {
        const nameRaw   = txt(row, sel.runnerName) || row.querySelector('[class*="name"]')?.textContent?.trim() || '';
        const barrier   = num(txt(row, sel.barrier));
        const jockey    = txt(row, sel.jockey);
        const trainer   = txt(row, sel.trainer);
        const weight    = txt(row, sel.weight);
        const form      = txt(row, sel.form);
        const jockeyWin = pct(txt(row, sel.jockeyWin));
        const trainerWin= pct(txt(row, sel.trainerWin));
        const scratched = !!row.querySelector(sel.scratched) ||
                          row.textContent?.toLowerCase().includes('scratched') || false;

        // Bookmaker odds — look for price cells in order of columns
        // Fallback: look for any numbers > 1.5 in cells that look like prices
        const sbTxt  = txt(row, sel.sbOdds);
        const tabTxt = txt(row, sel.tabOdds);
        const lbTxt  = txt(row, sel.lbOdds);
        const bestTxt= txt(row, sel.bestOdds);
        const plcTxt = txt(row, sel.placeOdds);

        // Generic price cell fallback — grab all cells with decimal numbers
        const allPrices: number[] = [];
        row.querySelectorAll('td, [class*="price"], [class*="odds"]').forEach(cell => {
          const t = cell.textContent?.trim() ?? '';
          const n = num(t);
          if (n >= 1.5 && n <= 200 && /^\d+\.?\d*$/.test(t.replace(/\s/g, ''))) {
            allPrices.push(n);
          }
        });

        const sb    = num(sbTxt)  || 0;
        const tab   = num(tabTxt) || 0;
        const lb    = num(lbTxt)  || 0;
        const best  = num(bestTxt) || Math.max(sb, tab, lb, ...allPrices.slice(0, 6)) || 0;
        const place = num(plcTxt) || 0;

        // Determine which book has the best price
        const bookMap: [string, number][] = [['SB', sb], ['TAB', tab], ['LB', lb]];
        const bestBook = bookMap.reduce((a, b) => b[1] > a[1] ? b : a, ['—', 0])[0];

        return {
          nameRaw, barrier, jockey, trainer, weight, form,
          jockeyWin, trainerWin, scratched,
          sb, tab, lb, best, bestBook, place,
        };
      }).filter(r => r.nameRaw.length > 0);

      return { condition, rail, weather, distance, cls, runners };
    }, SEL).catch(() => null) : null;

    // ── Merge API + DOM data ──────────────────────────────────────────────────
    const domRunners  = domResult?.runners ?? [];
    const raceInfo: RaceInfo = {
      track,
      raceNum,
      condition: apiCondition || domResult?.condition || '',
      rail:      domResult?.rail     || '',
      weather:   domResult?.weather  || '',
      distance:  domResult?.distance || 0,
      cls:       domResult?.cls      || '',
      runners:   [],
      fetchedAt: Date.now(),
    };

    // Build final runner list: prefer DOM data (richer), merge with API runners if available
    if (domRunners.length > 0) {
      raceInfo.runners = domRunners.map(d => {
        // Try to find an API match for odds if DOM odds are missing
        const api = apiRunners.find(a => fuzzyMatch(a.rawName, d.nameRaw));
        const sbOdds = d.sb || api?.odds?.sportsbet || 0;
        const tabOdds= d.tab || api?.odds?.tab || 0;
        const lbOdds = d.lb || api?.odds?.ladbrokes || 0;
        const best   = d.best || api?.odds?.best || Math.max(sbOdds, tabOdds, lbOdds);
        const bestBook = best === sbOdds ? 'SB' : best === tabOdds ? 'TAB' : best === lbOdds ? 'LB' : d.bestBook;

        return {
          horse:      normaliseName(d.nameRaw),
          rawName:    d.nameRaw,
          barrier:    d.barrier,
          scratched:  d.scratched,
          jockey:     d.jockey,
          trainer:    d.trainer,
          weight:     d.weight,
          form:       d.form,
          jockeyWin:  d.jockeyWin,
          trainerWin: d.trainerWin,
          odds: {
            sportsbet: sbOdds || undefined,
            tab:       tabOdds || undefined,
            ladbrokes: lbOdds || undefined,
            best:      best,
            bestBook,
            place:     d.place || api?.odds?.place || undefined,
          },
        } satisfies RunnerData;
      });
    } else if (apiRunners.length > 0) {
      raceInfo.runners = apiRunners;
    }

    if (raceInfo.runners.length === 0) {
      log('WARN', [
        `  ${label}: No runners extracted.`,
        `  → Check ${url} in DevTools`,
        `  → Network: look for JSON with runner/odds arrays, update RACENET_API_PATTERNS`,
        `  → DOM: check SEL selectors match current Racenet markup`,
      ].join('\n'));
    } else {
      const scratched = raceInfo.runners.filter(r => r.scratched).length;
      log('INFO', `  ${label}: ${raceInfo.runners.length} runners (${scratched} SCR) — ${raceInfo.condition || 'cond unknown'}`);
    }

    return raceInfo;

  } catch (err: unknown) {
    log('ERROR', `  ${label}: ${err instanceof Error ? err.message : err}`);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

// ── JSON walker (API response extraction) ─────────────────────────────────────
function extractRunnersFromJson(data: unknown): { runners: RunnerData[]; condition: string } {
  const runners: RunnerData[] = [];
  let condition = '';

  function walk(obj: unknown) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    const o = obj as Record<string, unknown>;

    // Track condition often at race level
    if (typeof o['trackCondition'] === 'string') condition = o['trackCondition'] as string;
    if (typeof o['condition']      === 'string') condition = o['condition']      as string;

    // Runner detection heuristics
    const nameKeys  = ['runnerName', 'horseName', 'name', 'displayName', 'selectionName'];
    const rawName   = nameKeys.reduce((v, k) => v || (typeof o[k] === 'string' ? o[k] as string : ''), '');
    const winKeys   = ['winPrice', 'fixedWin', 'win', 'returnWin', 'spWin'];
    const placeKeys = ['placePrice', 'fixedPlace', 'place', 'returnPlace'];

    if (rawName) {
      const winOdds  = winKeys.reduce((v, k)   => v || (typeof o[k] === 'number' && (o[k] as number) > 1 ? o[k] as number : 0), 0);
      const placeOdds= placeKeys.reduce((v, k) => v || (typeof o[k] === 'number' && (o[k] as number) > 1 ? o[k] as number : 0), 0);
      const scratched= o['scratched'] === true || o['status'] === 'SCRATCHED' || o['isScratched'] === true;

      // Bookmaker breakdown (Racenet sometimes nests prices per book)
      const prices = o['prices'] as Record<string, unknown> | undefined;
      const sb  = (typeof prices?.['sportsbet']  === 'number' ? prices!['sportsbet']  : winOdds) as number;
      const tab = (typeof prices?.['tab']         === 'number' ? prices!['tab']         : 0)       as number;
      const lb  = (typeof prices?.['ladbrokes']   === 'number' ? prices!['ladbrokes']   : 0)       as number;
      const best= Math.max(sb, tab, lb) || winOdds;

      runners.push({
        horse:      normaliseName(rawName),
        rawName,
        barrier:    typeof o['barrier'] === 'number' ? o['barrier'] as number : 0,
        scratched,
        jockey:     typeof o['jockeyName']   === 'string' ? o['jockeyName']   as string : '',
        trainer:    typeof o['trainerName']  === 'string' ? o['trainerName']  as string : '',
        weight:     typeof o['weight']       === 'string' ? o['weight']       as string : '',
        form:       typeof o['formString']   === 'string' ? o['formString']   as string
                  : typeof o['form']         === 'string' ? o['form']         as string : '',
        jockeyWin:  typeof o['jockeyStrikeRate']  === 'number' ? (o['jockeyStrikeRate']  as number) / 100 : 0,
        trainerWin: typeof o['trainerStrikeRate'] === 'number' ? (o['trainerStrikeRate'] as number) / 100 : 0,
        odds: {
          sportsbet: sb   || undefined,
          tab:       tab  || undefined,
          ladbrokes: lb   || undefined,
          best,
          bestBook:  best === sb ? 'SB' : best === tab ? 'TAB' : best === lb ? 'LB' : '?',
          place:     placeOdds || undefined,
        },
      });
    }

    Object.values(o).forEach(v => { if (v && typeof v === 'object') walk(v); });
  }

  walk(data);

  // Deduplicate by normalised name
  const seen = new Map<string, RunnerData>();
  for (const r of runners) seen.set(r.horse, r);
  return { runners: Array.from(seen.values()), condition };
}

// ── Cache & public API ────────────────────────────────────────────────────────
const CACHE_TTL_MS = 3 * 60 * 1000;

let cache: RacenetCache = {};
let fetchInProgress = false;
let lastFetch       = 0;

export type ScraperStatus = 'idle' | 'running' | 'ok' | 'unavailable' | 'error';
let scraperStatus: ScraperStatus = 'idle';
let scraperError  = '';
let runnersFound  = 0;  // total runners extracted across all cached races

export function getStatus() {
  return { status: scraperStatus, error: scraperError, lastFetch, runnersFound };
}
export function getCachedOdds(): RacenetCache { return cache; }

export interface ScrapeRequest { track: string; raceNum: number; }

export async function fetchOdds(races: ScrapeRequest[]): Promise<RacenetCache> {
  if (fetchInProgress) { log('INFO', 'Fetch in progress — returning cache'); return cache; }
  fetchInProgress = true;
  scraperStatus   = 'running';
  const date      = todayAEST();

  try {
    for (const { track, raceNum } of races) {
      const key      = `${track.toUpperCase()}_R${raceNum}`;
      const existing = cache[key];
      if (existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) {
        log('INFO', `Cache hit: ${key}`);
        continue;
      }
      const info = await scrapeRace(track, raceNum, date);
      if (info) cache[key] = info;
    }
    // Count total runners across all cached races
    runnersFound = Object.values(cache).reduce((n, r) => n + r.runners.length, 0);
    scraperStatus = runnersFound > 0 ? 'ok' : 'unavailable';
    scraperError  = runnersFound === 0 ? 'Scraper ran but extracted 0 runners — source may require login or DOM changed' : '';
    lastFetch     = Date.now();
    log('INFO', `fetchOdds complete: ${runnersFound} runners across ${Object.keys(cache).length} cached races — status=${scraperStatus}`);
  } catch (err: unknown) {
    scraperStatus = 'error';
    scraperError  = err instanceof Error ? err.message : String(err);
    log('ERROR', `fetchOdds: ${scraperError}`);
  } finally {
    fetchInProgress = false;
  }

  return cache;
}

export function findRunner(track: string, raceNum: number, horse: string): RunnerData | undefined {
  const race = cache[`${track.toUpperCase()}_R${raceNum}`];
  if (!race) return undefined;
  return race.runners.find(r => fuzzyMatch(r.rawName, horse));
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────
const REFRESH_INTERVAL = 4 * 60 * 1000;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let autoRaces: ScrapeRequest[] = [];

export function setAutoRefreshRaces(r: ScrapeRequest[]) { autoRaces = r; }

export function startAutoRefresh() {
  if (refreshTimer) return;
  const tick = async () => {
    if (autoRaces.length > 0 && isRacingHours()) {
      log('INFO', `Auto-refresh: ${autoRaces.length} races`);
      await fetchOdds(autoRaces).catch(e =>
        log('ERROR', `Auto-refresh: ${e instanceof Error ? e.message : e}`),
      );
    } else if (!isRacingHours()) {
      log('INFO', 'Outside racing hours — scraper paused');
    }
    refreshTimer = setTimeout(tick, REFRESH_INTERVAL);
  };
  refreshTimer = setTimeout(tick, REFRESH_INTERVAL);
  log('INFO', 'Racenet auto-refresh started (4 min interval, 9am–7pm AEST)');
}

export function stopAutoRefresh() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  closeBrowser().catch(() => {});
  log('INFO', 'Auto-refresh stopped');
}
