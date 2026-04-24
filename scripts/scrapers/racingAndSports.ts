/**
 * scripts/scrapers/racingAndSports.ts
 *
 * Fetches thoroughbred form data from Racing and Sports (racingandsports.com.au).
 *
 * URL pattern:
 *   https://www.racingandsports.com.au/form-guide/thoroughbred/australia/{track}/{date}/race/{raceNum}
 *
 * Data extracted per runner:
 *   - Speed rating, class rating, neural rating
 *   - Wet track record (proven = 1+ win on wet)
 *   - Jockey/trainer stats and tier (1=elite, 2=solid, 3=emerging)
 *   - Track/distance record
 *   - Days since last run, weight, barrier
 *   - Last 6 form runs
 *
 * Personal paper-trading use only.
 */

import { createRequire } from 'node:module';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require   = createRequire(import.meta.url);
const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
puppeteer.use(Stealth());

// ── Paths ──────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE  = path.resolve(__dirname, '../../logs/form-scraper.log');

// ── Types ──────────────────────────────────────────────────────────────────────
export interface FormRun {
  pos:     string;   // "1", "2", "x" (scratched), "?" (unknown)
  track:   string;
  dist:    number;
  cls:     string;
  weight:  number;
  jockey:  string;
  margin:  number;   // lengths (0 = winner)
}

export interface JockeyStats {
  name:        string;
  seasonWins:  number;
  seasonRides: number;
  winPct:      number;
  tier:        1 | 2 | 3;   // 1 = elite (>18%), 2 = solid (10-18%), 3 = emerging (<10%)
}

export interface TrainerStats {
  name:        string;
  seasonWins:  number;
  seasonRides: number;
  winPct:      number;
  tier:        1 | 2 | 3;
}

export interface WetTrackRecord {
  starts:  number;
  wins:    number;
  places:  number;
  proven:  boolean;  // true = at least 1 win on wet
}

export interface TrackDistRecord {
  starts:  number;
  wins:    number;
  places:  number;
}

export interface RunnerForm {
  name:              string;
  speedRating:       number | null;    // 0–100
  classRating:       number | null;    // 0–100
  neuralRating:      number | null;    // model rank within race (1 = best)
  wetTrackRecord:    WetTrackRecord | null;
  last6:             FormRun[];
  jockeyStats:       JockeyStats | null;
  trainerStats:      TrainerStats | null;
  trackDistRecord:   TrackDistRecord | null;
  daysSinceLastRun:  number | null;
  weight:            number | null;    // kg
  barrier:           number | null;
}

// ── Cache ──────────────────────────────────────────────────────────────────────
const CACHE_TTL = 10 * 60 * 1000;  // 10 min

interface CacheEntry {
  data:      RunnerForm[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(track: string, date: string, raceNum: number): string {
  return `${normaliseTrack(track)}_${date}_R${raceNum}`;
}

// ── Browser state with request throttling ──────────────────────────────────────
let browser: any = null;
let browserStarting = false;
let lastRequestTime = 0;
const REQUEST_DELAY_MS = 2500; // 2.5 second delay between requests

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
    // Wait for existing launch
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
  const line = `[${new Date().toISOString()}] [R&S] ${msg}`;
  console.log(line);
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch { /* ignore logging errors */ }
}

// ── Track name normalisation (URL slug format) ─────────────────────────────────
function normaliseTrack(track: string): string {
  return track.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// ── Tier assignment ────────────────────────────────────────────────────────────
function jockeyTier(winPct: number): 1 | 2 | 3 {
  if (winPct >= 0.18) return 1;
  if (winPct >= 0.10) return 2;
  return 3;
}

// ── Safe number parse ──────────────────────────────────────────────────────────
function safeNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

// ── JSON data extraction from intercepted API responses ───────────────────────
function extractRunnersFromJson(json: any): RunnerForm[] | null {
  try {
    // Racing & Sports API returns a nested structure — try common paths
    const runners: any[] =
      json?.data?.runners ??
      json?.runners ??
      json?.race?.runners ??
      json?.formGuide?.runners ??
      (Array.isArray(json) ? json : null);

    if (!runners || !Array.isArray(runners) || runners.length === 0) return null;

    log(`JSON extraction: found ${runners.length} runners`);

    return runners.map((r: any): RunnerForm => {
      const speedRating   = safeNum(r.speedRating ?? r.speed_rating ?? r.sr);
      const classRating   = safeNum(r.classRating ?? r.class_rating ?? r.cr);
      const neuralRating  = safeNum(r.neuralRating ?? r.neural_rating ?? r.modelRank ?? r.rank);
      const weight        = safeNum(r.weight ?? r.weightKg ?? r.kg);
      const barrier       = safeNum(r.barrier ?? r.barrierNumber);

      // Jockey
      const jData = r.jockey ?? r.jockeyDetails ?? {};
      const jWins = parseInt(jData.seasonWins ?? jData.wins ?? '0', 10) || 0;
      const jRides= parseInt(jData.seasonRides ?? jData.rides ?? '0', 10) || 0;
      const jPct  = jRides > 0 ? jWins / jRides : 0;
      const jockey: JockeyStats | null = jData.name ? {
        name: jData.name, seasonWins: jWins, seasonRides: jRides,
        winPct: jPct, tier: jockeyTier(jPct),
      } : null;

      // Trainer
      const tData = r.trainer ?? r.trainerDetails ?? {};
      const tWins = parseInt(tData.seasonWins ?? tData.wins ?? '0', 10) || 0;
      const tRides= parseInt(tData.seasonRides ?? tData.rides ?? '0', 10) || 0;
      const tPct  = tRides > 0 ? tWins / tRides : 0;
      const trainer: TrainerStats | null = tData.name ? {
        name: tData.name, seasonWins: tWins, seasonRides: tRides,
        winPct: tPct, tier: jockeyTier(tPct),
      } : null;

      // Wet track
      const wetData = r.wetTrack ?? r.wet_track ?? r.wetTrackRecord ?? {};
      const wetStarts = parseInt(wetData.starts ?? '0', 10) || 0;
      const wetWins   = parseInt(wetData.wins   ?? '0', 10) || 0;
      const wetPlaces = parseInt(wetData.places ?? '0', 10) || 0;
      const wetTrackRecord: WetTrackRecord | null = wetStarts > 0 ? {
        starts: wetStarts, wins: wetWins, places: wetPlaces, proven: wetWins > 0,
      } : null;

      // Track/dist record
      const tdData = r.trackDistance ?? r.track_distance ?? r.trackDist ?? {};
      const tdStarts = parseInt(tdData.starts ?? '0', 10) || 0;
      const tdWins   = parseInt(tdData.wins   ?? '0', 10) || 0;
      const tdPlaces = parseInt(tdData.places ?? '0', 10) || 0;
      const trackDistRecord: TrackDistRecord | null = tdStarts > 0 ? {
        starts: tdStarts, wins: tdWins, places: tdPlaces,
      } : null;

      // Last 6 form
      const formRaw: any[] = r.last6 ?? r.formRuns ?? r.recentRuns ?? r.runs ?? [];
      const last6: FormRun[] = formRaw.slice(0, 6).map((run: any) => ({
        pos:    String(run.position ?? run.pos ?? '?'),
        track:  String(run.track   ?? ''),
        dist:   parseInt(run.distance ?? run.dist ?? '0', 10) || 0,
        cls:    String(run.class  ?? run.cls ?? ''),
        weight: parseFloat(run.weight ?? '0') || 0,
        jockey: String(run.jockey ?? ''),
        margin: parseFloat(run.margin ?? '0') || 0,
      }));

      const daysSinceLastRun = safeNum(r.daysSinceLastRun ?? r.days_since ?? r.dslr);

      return {
        name: String(r.name ?? r.horseName ?? r.horse ?? ''),
        speedRating, classRating, neuralRating,
        wetTrackRecord, last6,
        jockeyStats: jockey, trainerStats: trainer,
        trackDistRecord, daysSinceLastRun, weight, barrier,
      };
    }).filter(r => r.name !== '');
  } catch (err) {
    log(`JSON extraction error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── DOM extraction (fallback) ─────────────────────────────────────────────────
// Passed as a string to page.evaluate() to avoid esbuild __name injection issues.
const DOM_EXTRACT_SCRIPT = `(function() {
  var results = [];
  var selectors = ['[data-runner]','.runner-row','.form-runner','.race-runner','tr[data-horse]','.runner'];
  var rows = null;
  for (var i = 0; i < selectors.length; i++) {
    var found = document.querySelectorAll(selectors[i]);
    if (found.length > 0) { rows = found; break; }
  }
  if (!rows || rows.length === 0) {
    var tables = document.querySelectorAll('table');
    for (var ti = 0; ti < tables.length; ti++) {
      var trs = tables[ti].querySelectorAll('tr');
      if (trs.length > 2) { rows = trs; break; }
    }
  }
  if (!rows) return results;
  for (var ri = 0; ri < rows.length; ri++) {
    var row = rows[ri];
    var nameEl = row.querySelector('[data-horse],.horse-name,.runner-name,.name,h3,h4,strong');
    var name = nameEl ? (nameEl.textContent || '').trim() : '';
    if (!name) continue;
    var speedEl   = row.querySelector('[data-speed-rating],.speed-rating,.sr');
    var classEl   = row.querySelector('[data-class-rating],.class-rating,.cr');
    var neuralEl  = row.querySelector('[data-neural],.neural-rating,.neural');
    var barrierEl = row.querySelector('[data-barrier],.barrier');
    var weightEl  = row.querySelector('[data-weight],.weight');
    var jockeyEl  = row.querySelector('[data-jockey],.jockey');
    var trainerEl = row.querySelector('[data-trainer],.trainer');
    function t(el) { return el ? (el.textContent || '').trim() : ''; }
    function n(el) { var v = parseFloat(t(el).replace(/[^0-9.]/g,'')); return isNaN(v) ? null : v; }
    results.push({
      name: name,
      speedRating:  n(speedEl),
      classRating:  n(classEl),
      neuralRating: n(neuralEl),
      barrier:      n(barrierEl),
      weight:       n(weightEl),
      jockeyName:   t(jockeyEl) || null,
      trainerName:  t(trainerEl) || null,
    });
  }
  return results;
})()`;

async function extractFromDom(page: any): Promise<RunnerForm[]> {
  try {
    const runners = await page.evaluate(DOM_EXTRACT_SCRIPT);

    log(`DOM extraction: found ${runners.length} runners`);

    // Minimal conversion — DOM gives us less data than the JSON API
    return runners.map((r: any): RunnerForm => ({
      name:           r.name,
      speedRating:    r.speedRating,
      classRating:    r.classRating,
      neuralRating:   r.neuralRating,
      barrier:        r.barrier,
      weight:         r.weight,
      wetTrackRecord: null,
      last6:          [],
      jockeyStats:    r.jockeyName ? { name: r.jockeyName, seasonWins: 0, seasonRides: 0, winPct: 0, tier: 3 } : null,
      trainerStats:   r.trainerName ? { name: r.trainerName, seasonWins: 0, seasonRides: 0, winPct: 0, tier: 3 } : null,
      trackDistRecord: null,
      daysSinceLastRun: null,
    })).filter(r => r.name !== '');
  } catch (err) {
    log(`DOM extraction error: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// ── Main scrape function ───────────────────────────────────────────────────────
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
  const url  = `https://www.racingandsports.com.au/form-guide/thoroughbred/australia/${slug}/${date}/race/${raceNum}`;
  log(`Scraping: ${url}`);

  let b: any;
  let page: any;
  try {
    b    = await getBrowser();
    page = await b.newPage();

    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-AU,en;q=0.9',
    });

    // Intercept API responses for structured JSON data
    let intercepted: RunnerForm[] | null = null;
    const responseHandler = async (response: any) => {
      try {
        const respUrl = response.url();
        const ct = response.headers()['content-type'] ?? '';
        if (!ct.includes('application/json')) return;
        if (!respUrl.includes('racingandsports') && !respUrl.includes('race') && !respUrl.includes('form')) return;
        const text = await response.text().catch(() => '');
        if (!text || text.length < 100) return;
        const json = JSON.parse(text);
        const extracted = extractRunnersFromJson(json);
        if (extracted && extracted.length > 0) {
          intercepted = extracted;
          log(`Intercepted API response from ${respUrl} — ${extracted.length} runners`);
        }
      } catch { /* ignore parse errors */ }
    };
    page.on('response', responseHandler);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout:   30_000,
    });

    // Check for login wall / access gate
    const bodyText = await page.evaluate(() =>
      document.body?.innerText?.slice(0, 500) ?? ''
    ).catch(() => '');

    if (bodyText.toLowerCase().includes('login') || bodyText.toLowerCase().includes('subscribe')) {
      log(`Access gate detected at ${url} — may need account`);
    }

    let runners: RunnerForm[] = [];

    if (intercepted && (intercepted as RunnerForm[]).length > 0) {
      runners = intercepted as RunnerForm[];
    } else {
      // Fall back to DOM extraction
      await page.waitForSelector('[data-runner], .runner-row, .form-runner, table tr', {
        timeout: 5_000,
      }).catch(() => null);
      runners = await extractFromDom(page);
    }

    if (runners.length > 0) {
      log(`Success: ${key} — ${runners.length} runners`);
      cache.set(key, { data: runners, fetchedAt: Date.now() });
      return runners;
    } else {
      log(`No runners found for ${key} — page may require authentication`);
      return null;
    }
  } catch (err) {
    log(`Error scraping ${url}: ${err instanceof Error ? err.message : err}`);
    return null;
  } finally {
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
  }
}

// ── Batch fetch ────────────────────────────────────────────────────────────────
export async function getBatchFormData(
  races: { track: string; date: string; raceNum: number; horseName: string; marketId: string; selectionId: string }[]
): Promise<Record<string, RunnerForm | null>> {
  const results: Record<string, RunnerForm | null> = {};
  for (const race of races) {
    const key = `${race.marketId}_${race.selectionId}`;
    try {
      const raceData = await getFormData(race.track, race.date, race.raceNum);
      results[key]   = raceData?.find(r =>
        r.name.toLowerCase().includes(race.horseName.toLowerCase()) ||
        race.horseName.toLowerCase().includes(r.name.toLowerCase())
      ) ?? null;
    } catch {
      results[key] = null;
    }
  }
  return results;
}
