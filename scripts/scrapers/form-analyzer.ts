#!/usr/bin/env node
/**
 * scripts/scrapers/form-analyzer.ts
 * Analyzes horse form from Racing.com full-form pages
 * Extracts: name, form line, wins, places, runs, jockey, trainer, weight, odds
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

// ── Types ──────────────────────────────────────────────────────────────────
export interface HorseForm {
  name: string;
  number: number;
  formLine: string; // e.g., "3-864" = recent 3rd, unplaced, 6th, 6th, 4th
  wins: number;
  places: number;
  runs: number;
  strikeRate: number; // wins / runs * 100
  placeRate: number; // (wins + places) / runs * 100
  lastRun: number | null; // last finishing position (3 = 3rd, etc)
  weight?: number;
  jockey?: string;
  trainer?: string;
  rtg?: number; // Racing.com rating
  winOdds?: number;
  placeOdds?: number;
  formScore: number; // 0-100 composite score
}

// ── Utilities ──────────────────────────────────────────────────────────────
function log(level: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [FORM-ANALYZER] ${level.padEnd(5)} ${msg}`);
}

function parseCareerRecord(text: string): { runs: number; wins: number; places: number } {
  // Parse "C 15:1-0-4" format → runs=15, wins=1, places=0
  const match = text.match(/C\s+(\d+):(\d+)-(\d+)-\d+/);
  if (!match) return { runs: 0, wins: 0, places: 0 };
  return {
    runs: parseInt(match[1]),
    wins: parseInt(match[2]),
    places: parseInt(match[3]),
  };
}

function parseFormLine(text: string): { line: string; lastRun: number | null } {
  // Parse "F 3-864" → line="3-864", lastRun=3
  const match = text.match(/F\s+([\d\-]+)/);
  if (!match) return { line: '', lastRun: null };

  const line = match[1];
  const firstChar = line.charAt(0);
  const lastRun = firstChar === '-' ? null : parseInt(firstChar);

  return { line, lastRun };
}

function calculateFormScore(form: HorseForm): number {
  if (form.runs === 0) return 0;

  // Weighted scoring:
  // - Strike rate (35%): wins per run
  // - Place rate (25%): places per run
  // - Recency (25%): favor recent good form (position 1-3)
  // - Consistency (15%): favor horses with form in most recent 5 runs

  const strikeScore = (form.strikeRate / 100) * 35;
  const placeScore = (form.placeRate / 100) * 25;

  // Recency: bonus for recent wins/places
  let recencyScore = 0;
  if (form.lastRun !== null) {
    if (form.lastRun === 1) recencyScore = 25;
    else if (form.lastRun === 2 || form.lastRun === 3) recencyScore = 18;
    else if (form.lastRun <= 6) recencyScore = 10;
    else recencyScore = 2;
  }

  // Consistency: count placings in form line
  let consistencyScore = 0;
  if (form.formLine.length > 0) {
    const placings = (form.formLine.match(/[123]/g) || []).length;
    consistencyScore = (placings / Math.min(form.formLine.length, 5)) * 15;
  }

  return Math.round(strikeScore + placeScore + recencyScore + consistencyScore);
}

// ── Scrape Form Data ───────────────────────────────────────────────────────
export async function scrapeRaceForm(
  date: string,
  track: string,
  raceNum: number
): Promise<HorseForm[]> {
  let browser;
  try {
    const slug = track.toLowerCase().replace(/\s+/g, '-');
    const url = `https://www.racing.com/form/${date}/${slug}/race/${raceNum}/full-form`;

    log('INFO', `Scraping form from ${url}`);

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1200 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);

    // Wait for content to fully render - increase wait time
    await new Promise(resolve => setTimeout(resolve, 3000));

    const horses = await page.evaluate(() => {
      const results: any[] = [];

      // Look for horse containers - use the working selector
      const horseElements = Array.from(document.querySelectorAll('[class*="race-entry"]'));

      // Debug: log selector results
      if (horseElements.length === 0) {
        // Try alternative selectors to find out why
        const alt1 = document.querySelectorAll('[class*="table-row"]');
        const alt2 = document.querySelectorAll('[class*="entry"]');
        console.log(`DEBUG: race-entry=${horseElements.length}, table-row=${alt1.length}, entry=${alt2.length}`);
        return results;
      }

      horseElements.forEach((el) => {
        const text = el.textContent || '';

        // Extract name and number (pattern: "1. Onigiri (GB)")
        const nameMatch = text.match(/^(\d+)\.\s+([^(]+)/);
        if (!nameMatch) return;

        const number = parseInt(nameMatch[1]);
        const name = nameMatch[2].trim();

        // Extract career record: "C 15:1-0-4" means 15 runs, 1 win, 0 places
        // Note: some might be "C 1:1-0-0" (no space after C)
        const careerMatch = text.match(/C\s*(\d+):(\d+)-(\d+)-\d+/);
        if (!careerMatch) return;

        const runs = parseInt(careerMatch[1]);
        const wins = parseInt(careerMatch[2]);
        const places = parseInt(careerMatch[3]);

        // Extract form line (pattern: "F 3-864")
        const formMatch = text.match(/F\s+([\d\-]+)/);
        const formLine = formMatch ? formMatch[1] : '';

        // Extract trainer (pattern: "T: D.W.Dwane")
        const trainerMatch = text.match(/T:\s+([A-Z][.\w\s-]+?)\s+J:/);
        const trainer = trainerMatch ? trainerMatch[1].trim() : undefined;

        // Extract jockey (pattern: "J: K.Matheson")
        const jockeyMatch = text.match(/J:\s+([A-Z][.\w\s-]+?)(?:\s+F|$)/);
        const jockey = jockeyMatch ? jockeyMatch[1].trim() : undefined;

        // Extract weight (pattern: "W 59.5kg")
        const weightMatch = text.match(/W\s+([\d.]+)kg/);
        const weight = weightMatch ? parseFloat(weightMatch[1]) : undefined;

        // Extract RTG (pattern: "RTG 62")
        const rtgMatch = text.match(/RTG\s+(\d+)/);
        const rtg = rtgMatch ? parseInt(rtgMatch[1]) : undefined;

        // Extract odds: "W$34.00" and "P$5.00"
        const winOddsMatch = text.match(/W\$?([\d.]+)/);
        const winOdds = winOddsMatch ? parseFloat(winOddsMatch[1]) : undefined;

        const placeOddsMatch = text.match(/P\$?([\d.]+)/);
        const placeOdds = placeOddsMatch ? parseFloat(placeOddsMatch[1]) : undefined;

        const { lastRun } = parseFormLine(`F ${formLine}`);

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
          winOdds,
          placeOdds,
          lastRun,
        });
      });

      return results;
    });

    await browser.close();

    log('INFO', `Parsed ${horses.length} horses from page`);

    if (horses.length === 0) {
      log('WARN', `No horses found for ${track} R${raceNum} - parsing returned 0 results`);
      return [];
    }

    // Calculate form scores and convert to HorseForm[]
    const horsesWithScores: HorseForm[] = horses.map((h: any, idx: number) => {
      const strikeRate = (h.wins / h.runs) * 100;
      const placeRate = ((h.wins + h.places) / h.runs) * 100;

      const form: HorseForm = {
        name: h.name,
        number: h.number,
        formLine: h.formLine,
        wins: h.wins,
        places: h.places,
        runs: h.runs,
        strikeRate,
        placeRate,
        lastRun: h.lastRun,
        weight: h.weight,
        jockey: h.jockey,
        trainer: h.trainer,
        rtg: h.rtg,
        winOdds: h.winOdds,
        placeOdds: h.placeOdds,
        formScore: 0,
      };

      form.formScore = calculateFormScore(form);
      return form;
    });

    log('INFO', `Scraped form for ${horsesWithScores.length} runners in ${track} R${raceNum}`);
    return horsesWithScores;
  } catch (err) {
    log('WARN', `Failed to scrape form for ${track} R${raceNum}: ${err}`);
    return [];
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const date = '2026-04-07';
  const track = 'grafton';
  const raceNum = 4;

  scrapeRaceForm(date, track, raceNum).then(horses => {
    console.log(`\n=== ${track.toUpperCase()} R${raceNum} FORM ANALYSIS ===\n`);
    horses.sort((a, b) => b.formScore - a.formScore);
    horses.forEach(h => {
      console.log(`${h.number}. ${h.name.padEnd(25)} | Form: ${h.formLine.padEnd(8)} | Wins: ${h.wins} Places: ${h.places} Runs: ${h.runs} | SR: ${h.strikeRate.toFixed(1)}% | Score: ${h.formScore}/100 | Odds: W${h.winOdds?.toFixed(2) || '?'} P${h.placeOdds?.toFixed(2) || '?'}`);
    });
  });
}

export { calculateFormScore };
