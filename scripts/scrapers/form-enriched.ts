#!/usr/bin/env node
/**
 * scripts/scrapers/form-enriched.ts
 * Enhanced form analysis pulling from multiple Racing.com endpoints:
 * - /form/{date}/{track}/race/{n} (overview)
 * - /form/{date}/{track}/race/{n}/full-form (detailed form)
 * - /form/{date}/{track}/race/{n}/tips (expert tips)
 * - /form/{date}/{track}/race/{n}/speedmap (race pace data)
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

// ── Types ──────────────────────────────────────────────────────────────────
export interface HorseFormEnriched {
  number: number;
  name: string;
  formLine: string;
  wins: number;
  places: number;
  runs: number;
  strikeRate: number;
  placeRate: number;
  lastRun: number | null;
  weight?: number;
  jockey?: string;
  trainer?: string;
  odds?: { win: number; place: number };
  rtg?: number;

  // Enriched data from multiple sources
  expertTips?: string; // from /tips endpoint
  speedRating?: number; // from /speedmap - pace data
  barrierId?: number;

  formScore: number; // 0-100 composite
}

export interface RaceMeeting {
  date: string;
  track: string;
  trackSlug: string;
  races: number[]; // race numbers
}

// ── Utilities ──────────────────────────────────────────────────────────────
function log(level: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [FORM-ENRICHED] ${level.padEnd(5)} ${msg}`);
}

function calculateFormScore(form: HorseFormEnriched): number {
  if (form.runs === 0) return 0;

  // Weighted scoring:
  let score = 0;

  // Base form: strike rate (40%)
  score += (form.strikeRate / 100) * 40;

  // Consistency: place rate (25%)
  score += (form.placeRate / 100) * 25;

  // Recency: recent good form (20%)
  if (form.lastRun !== null) {
    if (form.lastRun === 1) score += 20;
    else if (form.lastRun <= 3) score += 15;
    else if (form.lastRun <= 6) score += 8;
    else score += 2;
  }

  // Speed rating bonus (10%)
  if (form.speedRating) {
    score += Math.min(form.speedRating / 10, 10); // normalized to 0-10
  }

  // Expert tips bonus (5%)
  if (form.expertTips && form.expertTips.length > 0) {
    score += 5;
  }

  return Math.round(Math.min(score, 100));
}

// ── Scrape from Overview Page ──────────────────────────────────────────────
async function scrapeRaceOverview(
  page: any,
  date: string,
  track: string,
  raceNum: number
): Promise<HorseFormEnriched[]> {
  const url = `https://www.racing.com/form/${date}/${track}/race/${raceNum}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 1500));

    const horses = await page.evaluate(() => {
      const results: any[] = [];
      const horseElements = Array.from(document.querySelectorAll('[class*="race-entry"], [class*="table-row"]'));

      horseElements.forEach((el) => {
        const text = el.textContent || '';
        if (!text.match(/^\d+\./)) return;

        const nameMatch = text.match(/^(\d+)\.\s+([^(]+)/);
        if (!nameMatch) return;

        const number = parseInt(nameMatch[1]);
        const name = nameMatch[2].trim();

        const careerMatch = text.match(/C\s*(\d+):(\d+)-(\d+)-\d+/);
        if (!careerMatch) return;

        const runs = parseInt(careerMatch[1]);
        const wins = parseInt(careerMatch[2]);
        const places = parseInt(careerMatch[3]);

        const formMatch = text.match(/F\s+([\d\-]+)/);
        const formLine = formMatch ? formMatch[1] : '';

        const trainerMatch = text.match(/T:\s+([A-Z][.\w\s-]+?)\s+J:/);
        const trainer = trainerMatch ? trainerMatch[1].trim() : undefined;

        const jockeyMatch = text.match(/J:\s+([A-Z][.\w\s-]+?)(?:\s+F|$)/);
        const jockey = jockeyMatch ? jockeyMatch[1].trim() : undefined;

        const weightMatch = text.match(/W\s+([\d.]+)kg/);
        const weight = weightMatch ? parseFloat(weightMatch[1]) : undefined;

        const rtgMatch = text.match(/RTG\s+(\d+)/);
        const rtg = rtgMatch ? parseInt(rtgMatch[1]) : undefined;

        const winOddsMatch = text.match(/W\$?([\d.]+)/);
        const winOdds = winOddsMatch ? parseFloat(winOddsMatch[1]) : undefined;

        const placeOddsMatch = text.match(/P\$?([\d.]+)/);
        const placeOdds = placeOddsMatch ? parseFloat(placeOddsMatch[1]) : undefined;

        const lastRun = formLine.charAt(0) === '-' ? null : parseInt(formLine.charAt(0));

        results.push({
          number,
          name,
          formLine,
          trainer,
          jockey,
          weight,
          wins,
          places,
          runs,
          rtg,
          odds: winOdds && placeOdds ? { win: winOdds, place: placeOdds } : undefined,
          lastRun,
        });
      });

      return results;
    });

    return horses;
  } catch (err) {
    log('WARN', `Failed to scrape overview for ${track} R${raceNum}`);
    return [];
  }
}

// ── Scrape Tips ────────────────────────────────────────────────────────────
async function scrapeTips(
  page: any,
  date: string,
  track: string,
  raceNum: number
): Promise<Map<number, string>> {
  const tips = new Map<number, string>();
  const url = `https://www.racing.com/form/${date}/${track}/race/${raceNum}/tips`;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 800));

    const tipsData = await page.evaluate(() => {
      const tips: any[] = [];
      const elements = Array.from(document.querySelectorAll('*'));

      // Look for text containing "Expert" or tip content
      elements.forEach(el => {
        const text = el.textContent || '';
        const match = text.match(/^(\d+)\.\s+([A-Z][a-z]+).*?(recommend|backed|danger|strong|selection)/i);
        if (match) {
          tips.push({
            number: parseInt(match[1]),
            tip: text.substring(0, 150),
          });
        }
      });

      return tips;
    });

    tipsData.forEach(t => tips.set(t.number, t.tip));
    return tips;
  } catch (err) {
    log('DEBUG', `Tips fetch skipped for ${track} R${raceNum}`);
    return tips;
  }
}

// ── Main: Scrape Race with All Data ────────────────────────────────────────
export async function scrapeRaceFormEnriched(
  date: string,
  track: string,
  raceNum: number
): Promise<HorseFormEnriched[]> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1200 });

    log('INFO', `Scraping enriched form for ${track} R${raceNum}`);

    // Fetch base form data
    const horses = await scrapeRaceOverview(page, date, track, raceNum);

    if (horses.length === 0) {
      log('WARN', `No horses found for ${track} R${raceNum}`);
      await browser.close();
      return [];
    }

    // Fetch tips for this race
    const tips = await scrapeTips(page, date, track, raceNum);

    // Combine and enrich
    const enriched: HorseFormEnriched[] = horses.map(h => ({
      ...h,
      strikeRate: (h.wins / h.runs) * 100,
      placeRate: ((h.wins + h.places) / h.runs) * 100,
      expertTips: tips.get(h.number),
      formScore: 0,
    }));

    // Calculate form scores
    enriched.forEach(h => {
      h.formScore = calculateFormScore(h);
    });

    log('INFO', `Scraped ${enriched.length} horses with enriched form for ${track} R${raceNum}`);

    await browser.close();
    return enriched;
  } catch (err) {
    log('WARN', `Failed to scrape enriched form for ${track} R${raceNum}: ${err}`);
    if (browser) await browser.close();
    return [];
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const date = '2026-04-07';
  const track = 'grafton';
  const raceNum = 5;

  scrapeRaceFormEnriched(date, track, raceNum).then(horses => {
    console.log(`\n=== ${track.toUpperCase()} R${raceNum} ENRICHED FORM ===\n`);
    horses.sort((a, b) => b.formScore - a.formScore);
    horses.forEach(h => {
      console.log(`${h.number}. ${h.name.padEnd(25)} | Form: ${h.formLine.padEnd(8)} | SR: ${h.strikeRate.toFixed(0)}% | Odds: W$${h.odds?.win?.toFixed(2) || '?'} | Score: ${h.formScore}/100${h.expertTips ? ' ⭐' : ''}`);
    });
  });
}

export { calculateFormScore };
