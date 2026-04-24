#!/usr/bin/env node
/**
 * scripts/scrapers/race-results.ts
 * Scrapes race results from Racing.com
 * Returns: Finishing positions for horses in completed races
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

// ── Types ──────────────────────────────────────────────────────────────────
interface RunnerResult {
  horse: string;
  position: number; // 1 = win, 2-3 = place, 4+ = unplaced
  result: 'WIN' | 'PLACE' | 'LOSS';
}

interface RaceResult {
  track: string;
  raceNum: number;
  status: 'finished' | 'pending' | 'live';
  runners: RunnerResult[];
  scrapeTime: string;
}

// ── Utilities ──────────────────────────────────────────────────────────────
function log(level: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [RACE-RESULTS] ${level.padEnd(5)} ${msg}`);
}

function normaliseName(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// ── Scrape Results ─────────────────────────────────────────────────────────
async function scrapeRaceResults(track: string, raceNum: number): Promise<RaceResult | null> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Build URL based on track (simplified - Racing.com structure varies)
    const trackSlug = track.toLowerCase().replace(/\s+/g, '-');
    const url = `https://www.racing.com/racing/${trackSlug}`;

    log('INFO', `Scraping results from ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null);

    // Look for race results section
    const results = await page.evaluate((rNum) => {
      const resultsContainer = document.querySelector('[class*="result"], [class*="card"]');
      if (!resultsContainer) return null;

      const runners: Array<{ name: string; pos: number }> = [];
      const positionElements = resultsContainer.querySelectorAll('[class*="position"], [class*="finished"], tr');

      let position = 1;
      positionElements.forEach((el) => {
        const nameEl = el.querySelector('[class*="name"], td:nth-child(2)');
        const nameText = nameEl?.textContent?.trim();

        if (nameText && nameText.length > 0 && position <= 10) {
          runners.push({ name: nameText, pos: position });
          position++;
        }
      });

      return runners.length > 0 ? runners : null;
    }, raceNum);

    await browser.close();

    if (!results || results.length === 0) {
      log('WARN', `${track} R${raceNum}: No results found (race may not be finished)`);
      return null;
    }

    // Convert positions to WIN/PLACE/LOSS
    const runners: RunnerResult[] = results.map((r: any) => ({
      horse: r.name,
      position: r.pos,
      result: r.pos === 1 ? 'WIN' : r.pos <= 3 ? 'PLACE' : 'LOSS',
    }));

    log('INFO', `${track} R${raceNum}: Found ${runners.length} runners`);

    return {
      track,
      raceNum,
      status: 'finished',
      runners,
      scrapeTime: new Date().toISOString(),
    };
  } catch (err) {
    log('WARN', `Failed to scrape ${track} R${raceNum}: ${err}`);
    if (browser) await browser.close();
    return null;
  }
}

// ── Export ─────────────────────────────────────────────────────────────────
export { scrapeRaceResults, RaceResult, RunnerResult };

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const track = process.argv[2] || 'GRAFTON';
  const raceNum = parseInt(process.argv[3] || '1');

  scrapeRaceResults(track, raceNum).then(result => {
    if (result) {
      console.log(`\n=== ${result.track} R${result.raceNum} RESULTS ===\n`);
      result.runners.forEach(r => {
        console.log(`${r.position}. ${r.name} - ${r.result}`);
      });
    } else {
      console.log('No results found');
    }
  });
}
