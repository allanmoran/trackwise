/**
 * scripts/scrapers/tab.ts
 *
 * Fetches live odds from TAB (Totalisator Agency Board) — Australia's official
 * racing betting platform. TAB publishes form guides and odds publicly.
 *
 * URL pattern: https://www.tab.com.au/racing/form-guide/{state}/{track}/{date}/race-{n}
 * Example: https://www.tab.com.au/racing/form-guide/nsw/gosford/2026-04-02/race-5
 *
 * Returns:
 *   • Barrier, jockey, trainer, weight
 *   • TAB win/place odds (official live odds)
 *   • Track condition, rail, weather
 *   • Last 5 form string
 *   • Track distance info
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');
puppeteer.use(Stealth());

// ── Paths ─────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TabRunnerOdds {
  horse:      string;    // normalised lowercase
  rawName:    string;    // as TAB shows it
  barrier:    number;
  scratched:  boolean;
  jockey:     string;
  trainer:    string;
  weight:     string;    // e.g. "57.0"
  winOdds:    number;    // TAB win odds (decimal)
  placeOdds:  number;    // TAB place odds (decimal)
  form:       string;    // last 5 starts
}

export interface TabRaceOdds {
  track:      string;
  raceNum:    number;
  condition:  string;    // e.g. "Good 4"
  rail:       string;    // e.g. "True"
  weather:    string;
  distance:   number;    // metres
  cls:        string;    // race class
  runners:    TabRunnerOdds[];
  fetchedAt:  number;
}

export type TabOddsCache = Record<string, TabRaceOdds>;  // key: "TRACK_R3"

// ── Utilities ─────────────────────────────────────────────────────────────────
function log(level: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] [TAB] ${level.padEnd(4)} ${msg}\n`;
  process.stdout.write(line);
}

export function normaliseName(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function parseFloat2(s: string | undefined | null): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ── Track slug builder ──────────────────────────────────────────────────────
function getStateCode(track: string): string {
  // NZ tracks get 'nz', AU tracks default to 'au' (proxy can infer from track name)
  const nzTracks = ['WINGATUI', 'RICCARTON', 'TRENTHAM', 'TE RAPA', 'ELLERSLIE',
                     'PUKEKOHE', 'MATAMATA', 'ROTORUA', 'HASTINGS', 'AVONDALE',
                     'MANAWATU', 'HAWKE\'S BAY', 'WHANGANUI', 'TIMARU', 'GORE',
                     'ASHBURTON', 'INVERCARGILL', 'NEW PLYMOUTH', 'FEILDING'];
  if (nzTracks.includes(track.toUpperCase())) return 'nz';
  // AU state inference (fallback to 'au' if unknown)
  const stateMap: Record<string, string> = {
    'GOSFORD': 'nsw', 'RANDWICK': 'nsw', 'ROSEHILL': 'nsw', 'WARWICK FARM': 'nsw',
    'FLEMINGTON': 'vic', 'CAULFIELD': 'vic', 'MOONEE VALLEY': 'vic', 'SANDOWN': 'vic',
    'EAGLE FARM': 'qld', 'DOOMBEN': 'qld', 'SUNSHINE COAST': 'qld',
    'MORPHETTVILLE': 'sa', 'STRATHALBYN': 'sa',
    'BELMONT PARK': 'wa', 'ASCOT': 'wa',
    'HOBART': 'tas', 'LAUNCESTON': 'tas',
  };
  return stateMap[track.toUpperCase()] || 'au';
}

function trackSlug(track: string): string {
  return track.toLowerCase()
    .replace(/\bmt\b/g, 'mount').replace(/\bst\b/g, 'saint')
    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function buildUrl(track: string, raceNum: number, date: string): string {
  const state = getStateCode(track);
  const slug = trackSlug(track);
  return `https://www.tab.com.au/racing/form-guide/${state}/${slug}/${date}/race-${raceNum}`;
}

// ── Browser instance ───────────────────────────────────────────────────────
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

// ── Extract runners from API responses ────────────────────────────────────
function extractRunnersFromApiResponses(responses: any[]): TabRunnerOdds[] {
  const runners: TabRunnerOdds[] = [];

  for (const resp of responses) {
    // Try different response structures
    const runnerArrays = [
      resp.runners, resp.selections, resp.races?.[0]?.runners,
      resp.data?.runners, resp.result?.runners,
    ].filter(Boolean);

    for (const arr of runnerArrays) {
      if (!Array.isArray(arr)) continue;

      for (const r of arr) {
        if (!r || !r.name) continue;

        const runner: TabRunnerOdds = {
          horse: normaliseName(r.name || r.horseName || r.horseNameFull || ''),
          rawName: r.name || r.horseName || r.horseNameFull || '',
          barrier: parseInt(r.barrier ?? r.barrierNumber ?? 0, 10),
          scratched: r.scratched || r.withdrawn || r.isScratched || false,
          jockey: r.jockey?.name || r.jockeyName || r.jockey || '',
          trainer: r.trainer?.name || r.trainerName || r.trainer || '',
          weight: r.weight || r.weightString || '',
          winOdds: parseFloat2(r.winOdds || r.odds?.win || r.price?.win || r.winPrice),
          placeOdds: parseFloat2(r.placeOdds || r.odds?.place || r.price?.place || r.placePrice),
          form: r.form || r.formString || '',
        };

        if (runner.rawName) runners.push(runner);
      }
    }
  }

  return runners;
}

// ── Core scrape ───────────────────────────────────────────────────────────
async function scrapeRace(track: string, raceNum: number, date: string): Promise<TabRaceOdds | null> {
  const url = buildUrl(track, raceNum, date);
  const label = `${track} R${raceNum}`;

  log('INFO', `Scraping ${label} → ${url}`);

  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    );

    // Intercept API calls for odds data
    const apiResponses: any[] = [];
    page.on('response', async (res: any) => {
      const rUrl = res.url() as string;
      const ct = (res.headers()['content-type'] ?? '') as string;
      // Capture JSON responses that might contain odds
      if ((ct.includes('application/json') || ct.includes('text/plain')) &&
          (rUrl.includes('/api/') || rUrl.includes('racing') || rUrl.includes('race'))) {
        try {
          const json = await res.json();
          if (json && (json.runners || json.races || json.odds || json.selections)) {
            log('INFO', `  API: ${rUrl.slice(0, 80)}`);
            apiResponses.push(json);
          }
        } catch {}
      }
    });

    // Random delay 1–3s
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

    const nav = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
    const finalUrl = page.url();
    log('INFO', `  ${label}: nav status=${nav?.status() ?? 0} finalUrl=${finalUrl}`);

    if (nav?.status() === 404 || finalUrl.includes('/404')) {
      log('WARN', `  ${label}: 404 — race may not be on TAB yet`);
      return null;
    }

    // If we captured API responses with odds, use them
    if (apiResponses.length > 0) {
      log('INFO', `  ${label}: captured ${apiResponses.length} API responses`);
      // Try to extract runners from API responses
      const runners = extractRunnersFromApiResponses(apiResponses);
      if (runners.length > 0) {
        const raceOdds: TabRaceOdds = {
          track, raceNum,
          condition: '', rail: '', weather: '', distance: 0, cls: '',
          runners: runners,
          fetchedAt: Date.now(),
        };
        log('INFO', `  ${label}: ✓ ${runners.length} runners from API`);
        return raceOdds;
      }
    }

    // Fallback: wait for DOM to render
    try {
      await page.waitForSelector('[class*="runner"], tr[class*="race-field"], [data-testid*="runner"]', {
        timeout: 10_000
      });
      log('INFO', `  ${label}: runner rows visible`);
    } catch {
      log('WARN', `  ${label}: runner rows not found after 10s`);
      return null;
    }

    // DOM extraction
    const result = await page.evaluate(() => {
      function txt(root: Element | Document, ...selectors: string[]): string {
        for (const sel of selectors) {
          try {
            const el = root.querySelector(sel);
            if (el?.textContent?.trim()) return el.textContent.trim();
          } catch {}
        }
        return '';
      }

      function num(s: string): number {
        const n = parseFloat(s.replace(/[^0-9.]/g, ''));
        return isNaN(n) ? 0 : n;
      }

      // Race info
      const condition = txt(document,
        '[class*="trackCondition"]', '[class*="condition"]', 'span:has-text("Good")'
      ).replace(/Track Condition[:\s]*/i, '');

      const rail = txt(document,
        '[class*="railPosition"]', '[class*="rail"]', 'span:has-text("True")'
      ).replace(/Rail[:\s]*/i, '');

      const weather = txt(document,
        '[class*="weather"]', 'span:has-text("Fine")'
      ).replace(/Weather[:\s]*/i, '');

      const distanceStr = txt(document,
        '[class*="distance"]', '[class*="raceDistance"]'
      );
      const distance = num(distanceStr);

      const cls = txt(document,
        '[class*="raceClass"]', '[class*="class"]'
      ).replace(/Class[:\s]*/i, '');

      // Runner rows — TAB uses various structures
      const runnerSelectors = [
        '[data-testid*="runner-row"]',
        '[class*="runner-row"]',
        'tr[class*="field"]',
        '[class*="raceField"]',
        '[class*="RunnerRow"]',
      ];

      let rows: Element[] = [];
      for (const sel of runnerSelectors) {
        rows = Array.from(document.querySelectorAll(sel));
        if (rows.length > 0) break;
      }

      const runners = rows.map(row => {
        // Horse name
        const nameRaw = txt(row,
          '[class*="horseName"]', '[class*="horse-name"]', 'a[href*="/horse/"]'
        ).replace(/\d+\.\s*/, ''); // strip barrier number prefix

        // Barrier
        const barrierCell = txt(row, '[class*="barrier"]', 'td:first-child');
        const barrier = num(barrierCell);

        // Jockey, trainer, weight
        const jockey = txt(row, '[class*="jockey"]', '[data-testid*="jockey"]');
        const trainer = txt(row, '[class*="trainer"]', '[data-testid*="trainer"]');
        const weight = txt(row, '[class*="weight"]', '[data-testid*="weight"]');

        // Win and place odds — TAB shows these in dedicated columns
        const winOddsStr = txt(row,
          '[class*="winOdds"]', '[class*="win-odds"]', '[data-testid*="win-price"]'
        );
        const placeOddsStr = txt(row,
          '[class*="placeOdds"]', '[class*="place-odds"]', '[data-testid*="place-price"]'
        );

        // Fallback: find all numbers in range 1.5–200 and assume first two are win/place
        const allPrices: number[] = [];
        row.querySelectorAll('td, [class*="price"], [class*="odds"]').forEach(cell => {
          const t = cell.textContent?.trim() ?? '';
          const n = num(t);
          if (n >= 1.5 && n <= 200 && /^\d+\.?\d*$/.test(t.replace(/\s/g, ''))) {
            allPrices.push(n);
          }
        });

        const winOdds = num(winOddsStr) || allPrices[0] || 0;
        const placeOdds = num(placeOddsStr) || allPrices[1] || 0;

        // Scratched flag
        const scratched = row.textContent?.toLowerCase().includes('scratch') ||
                         !!row.querySelector('[class*="scratch"]');

        // Form string (last 5 starts)
        const form = txt(row, '[class*="form"]', '[class*="formString"]');

        return { nameRaw, barrier, jockey, trainer, weight, form, winOdds, placeOdds, scratched };
      }).filter(r => r.nameRaw.length > 0);

      return { condition, rail, weather, distance, cls, runners };
    }).catch((err) => {
      log('ERROR', `DOM extraction failed: ${err.message}`);
      return null;
    });

    if (!result || result.runners.length === 0) {
      log('WARN', `  ${label}: 0 runners extracted`);
      return null;
    }

    // Build final result
    const raceOdds: TabRaceOdds = {
      track,
      raceNum,
      condition: result.condition,
      rail: result.rail,
      weather: result.weather,
      distance: result.distance,
      cls: result.cls,
      runners: result.runners.map(r => ({
        horse: normaliseName(r.nameRaw),
        rawName: r.nameRaw,
        barrier: r.barrier,
        scratched: r.scratched,
        jockey: r.jockey,
        trainer: r.trainer,
        weight: r.weight,
        winOdds: r.winOdds,
        placeOdds: r.placeOdds,
        form: r.form,
      })),
      fetchedAt: Date.now(),
    };

    log('INFO', `  ${label}: ✓ ${raceOdds.runners.length} runners, ${raceOdds.runners.filter(r => r.winOdds > 0).length} with odds`);
    return raceOdds;

  } catch (err) {
    log('ERROR', `${label}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    try { await page.close(); } catch {}
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function fetchTabOdds(races: Array<{ track: string; raceNum: number; date: string }>): Promise<TabOddsCache> {
  const results: TabOddsCache = {};

  for (const race of races) {
    const key = `${race.track.toUpperCase()}_R${race.raceNum}`;
    const odds = await scrapeRace(race.track, race.raceNum, race.date);
    results[key] = odds || {
      track: race.track,
      raceNum: race.raceNum,
      condition: '',
      rail: '',
      weather: '',
      distance: 0,
      cls: '',
      runners: [],
      fetchedAt: Date.now(),
    };
  }

  return results;
}

// Cleanup on exit
process.on('exit', closeBrowser);
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});
