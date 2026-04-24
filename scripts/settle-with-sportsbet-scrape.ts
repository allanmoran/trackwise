#!/usr/bin/env node
/**
 * Automatic settlement with improved Sportsbet Form scraping
 * 1. Fetch race URLs for April 11-12
 * 2. Extract barrier->horse mappings from form pages
 * 3. Match against barrier finish positions
 * 4. Settle with improved fuzzy matching
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Barrier finish positions from racenet
const barrierResults: Record<string, Record<number, number[]>> = {
  'Ascot': { 1: [11, 5, 4], 2: [3, 2, 1], 3: [1, 8, 5], 4: [5, 3, 4], 5: [5, 3, 2], 6: [10, 4, 1], 7: [1, 6, 9], 8: [5, 3, 2], 9: [2, 6, 8], 10: [5, 2, 7] },
  'Caulfield': { 1: [2, 13, 7], 2: [12, 10, 13], 3: [6, 4, 1], 4: [10, 1, 3], 5: [13, 1, 5], 6: [5, 8, 2], 7: [1, 6, 4], 8: [8, 12, 14], 9: [6, 11, 1], 10: [10, 9, 14] },
  'Alice Springs': { 1: [4, 6, 8], 2: [8, 7, 5], 3: [4, 5, 3], 4: [4, 1, 3], 5: [2, 5, 7], 6: [3, 7, 1], 7: [4, 1, 3] },
  'Ballina': { 1: [10, 7, 6], 2: [13, 7, 2], 3: [9, 3, 8], 4: [4, 8, 5], 5: [2, 4, 7], 6: [4, 12, 5] },
  'Bowen': { 1: [5, 1, 3], 2: [1, 2, 5], 3: [5, 2, 8], 4: [7, 3, 5], 5: [9, 3, 5] },
  'Hobart': { 1: [3, 2, 4], 2: [1, 3, 6], 3: [4, 5, 1], 4: [4, 12, 11], 5: [13, 10, 5], 6: [3, 6, 5], 7: [8, 6, 10] },
};

function log(msg: string) {
  console.log(msg);
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshteinDistance(a: string, b: string): number {
  const aNorm = normaliseName(a);
  const bNorm = normaliseName(b);
  const matrix: number[][] = [];
  for (let i = 0; i <= bNorm.length; i++) matrix[i] = [i];
  for (let j = 0; j <= aNorm.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= bNorm.length; i++) {
    for (let j = 1; j <= aNorm.length; j++) {
      const cost = aNorm[j - 1] === bNorm[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[bNorm.length][aNorm.length];
}

function fuzzyMatch(a: string, b: string, threshold: number = 0.85): boolean {
  const aNorm = normaliseName(a);
  const bNorm = normaliseName(b);
  if (aNorm === bNorm) return true;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;
  const distance = levenshteinDistance(a, b);
  return (1 - distance / Math.max(aNorm.length, bNorm.length)) >= threshold;
}

interface RaceURL {
  track: string;
  raceNum: number;
  url: string;
  trackId: string;
}

async function discoverRaceURLs(): Promise<RaceURL[]> {
  let browser;
  try {
    log('🔍 Discovering Sportsbet race URLs...\n');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://www.sportsbetform.com.au/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await new Promise(r => setTimeout(r, 2000));

    const races = await page.evaluate(() => {
      const result: any[] = [];
      const allLinks = Array.from(document.querySelectorAll('a[href*="sportsbetform"]'));

      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link as HTMLAnchorElement).textContent?.trim() || '';

        // Look for time format (HH:MM)
        if (/\d{2}:\d{2}/.test(text)) {
          const match = href.match(/sportsbetform\.com\.au\/(\d+)\/(\d+)/);
          if (match) {
            const [, trackId, raceId] = match;
            result.push({ trackId, raceId, time: text, url: href });
          }
        }
      }

      return result;
    });

    await browser.close();

    const trackMap: Record<string, string> = {
      '435951': 'Alice Springs',
      '436088': 'Ascot',
      '435964': 'Ballina',
      '436054': 'Bowen',
      '435969': 'Caulfield',
      '435974': 'Hobart',
      '436045': 'Kalgoorlie',
      '436046': 'Rockhampton',
      '436050': 'Sunshine Coast',
      '436170': 'Gundagai',
      '436171': 'Port Augusta',
      '436172': 'Swan Hill',
      '436182': 'Terang',
      '436183': 'Wellington',
    };

    const filtered = races
      .filter((r: any) => trackMap[r.trackId])
      .map((r: any) => ({
        track: trackMap[r.trackId],
        trackId: r.trackId,
        raceNum: parseInt(r.raceId) || 0,
        url: r.url,
      }));

    log(`Found ${filtered.length} races\n`);
    return filtered;
  } catch (err) {
    log(`⚠️  Failed to discover URLs: ${err}\n`);
    if (browser) await browser.close();
    return [];
  }
}

async function scrapeFormBarriers(url: string, track: string, raceNum: number): Promise<Record<number, string> | null> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 1500));

    const barriers = await page.evaluate(() => {
      const result: Record<number, string> = {};
      const bodyText = document.body.innerText;

      // Split by lines and look for barrier patterns
      const lines = bodyText.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Pattern: "01 Horse Name" or "1 Horse Name" at start of line
        const match = line.match(/^(\d{1,2})\s+([A-Za-z\s\-']+?)(?:\s+[A-Z]|\s*$)/);
        if (match) {
          const barrier = parseInt(match[1]);
          let horseName = match[2].trim()
            .replace(/\s+/g, ' ')
            .trim();

          // Validate: barrier should be 1-30, name should be reasonable length
          if (horseName.length > 2 && horseName.length < 50 && barrier > 0 && barrier < 30) {
            // Skip trainer/jockey lines
            if (!horseName.match(/^[A-Z][a-z]{2,} [A-Z][a-z]{2,}$/) || horseName.length < 5) {
              result[barrier] = horseName;
            }
          }
        }
      }

      return Object.keys(result).length > 0 ? result : null;
    });

    await browser.close();

    if (barriers) {
      log(`  ✓ ${track} R${raceNum}: ${Object.keys(barriers).length} horses extracted`);
      return barriers;
    }
    return null;
  } catch (err) {
    if (browser) await browser.close();
    return null;
  }
}

function settleBet(betId: number, result: 'WIN' | 'PLACE' | 'LOSS'): boolean {
  try {
    const bet = db.prepare('SELECT stake, opening_odds, closing_odds FROM bets WHERE id = ?').get(betId) as any;
    if (!bet) return false;

    const odds = bet.closing_odds || bet.opening_odds || 0;
    let profitLoss = 0;
    if (result === 'WIN') profitLoss = bet.stake * (odds - 1);
    else if (result === 'PLACE') profitLoss = bet.stake * ((odds - 1) / 4);
    else profitLoss = -bet.stake;

    db.prepare(`UPDATE bets SET result = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(result, Math.round(profitLoss * 100) / 100, betId);
    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  log('\n' + '='.repeat(70));
  log('🏇 AUTOMATIC SETTLEMENT WITH SPORTSBET SCRAPING\n');

  // Get pending bets
  const pendingBets = db.prepare(`
    SELECT b.id, r.track, r.race_number, h.name as horse_name
    FROM bets b
    JOIN races r ON b.race_id = r.id
    JOIN horses h ON b.horse_id = h.id
    WHERE b.result IS NULL AND r.date IN ('2026-04-11', '2026-04-12')
    ORDER BY r.track, r.race_number
  `).all() as any[];

  log(`Found ${pendingBets.length} pending bets\n`);

  // Group by race
  const raceMap = new Map<string, any[]>();
  for (const bet of pendingBets) {
    const key = `${bet.track}_R${bet.race_number}`;
    if (!raceMap.has(key)) raceMap.set(key, []);
    raceMap.get(key)!.push(bet);
  }

  // Discover URLs
  const raceURLs = await discoverRaceURLs();
  const urlMap = new Map<string, RaceURL>();
  for (const race of raceURLs) {
    urlMap.set(`${race.track}_R${race.raceNum}`, race);
  }

  log('📋 SCRAPING FORM DATA FROM SPORTSBET\n');

  let settled = 0;
  const settledByTrack: Record<string, number> = {};

  // Process each race
  for (const [raceKey, raceBets] of raceMap) {
    const [track, raceNum] = raceKey.split('_R');
    const raceNumber = parseInt(raceNum);

    log(`${track} R${raceNumber}:`);

    // Get barrier finish positions
    const trackResults = barrierResults[track];
    const finishingBarriers = trackResults?.[raceNumber];

    if (!finishingBarriers) {
      log(`  ⚠️  No barrier data - marking all as LOSS\n`);
      for (const bet of raceBets) {
        settleBet(bet.id, 'LOSS');
        settled++;
      }
      settledByTrack[track] = (settledByTrack[track] || 0) + raceBets.length;
      continue;
    }

    // Try to scrape form data
    const raceURL = urlMap.get(raceKey);
    let barriers: Record<number, string> | null = null;

    if (raceURL) {
      barriers = await scrapeFormBarriers(raceURL.url, track, raceNumber);
    }

    if (!barriers) {
      log(`  ⚠️  Could not scrape form - marking all as LOSS\n`);
      for (const bet of raceBets) {
        settleBet(bet.id, 'LOSS');
        settled++;
      }
      settledByTrack[track] = (settledByTrack[track] || 0) + raceBets.length;
      continue;
    }

    // Match bets to finishing positions
    for (const bet of raceBets) {
      let result: 'WIN' | 'PLACE' | 'LOSS' = 'LOSS';

      // Check each finishing position
      for (let pos = 0; pos < finishingBarriers.length; pos++) {
        const barrierNum = finishingBarriers[pos];
        const finishingHorse = barriers[barrierNum];

        if (finishingHorse && fuzzyMatch(finishingHorse, bet.horse_name)) {
          result = pos === 0 ? 'WIN' : pos <= 2 ? 'PLACE' : 'LOSS';
          break;
        }
      }

      settleBet(bet.id, result);
      settled++;
    }

    settledByTrack[track] = (settledByTrack[track] || 0) + raceBets.length;
  }

  // Final summary
  log('\n' + '='.repeat(70));
  log('📊 SETTLEMENT COMPLETE\n');
  log(`Settled: ${settled}/${pendingBets.length}`);

  const finalStatus = db.prepare(`
    SELECT
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
      COUNT(CASE WHEN result = 'PLACE' THEN 1 END) as places,
      COUNT(CASE WHEN result = 'LOSS' THEN 1 END) as losses,
      ROUND(SUM(profit_loss), 2) as total_pnl
    FROM bets b
    JOIN races r ON b.race_id = r.id
    WHERE r.date IN ('2026-04-11', '2026-04-12') AND b.result IS NOT NULL
  `).get() as any;

  log(`\nWins: ${finalStatus.wins} | Places: ${finalStatus.places} | Losses: ${finalStatus.losses}`);
  log(`Total P&L: $${finalStatus.total_pnl}`);
  log('\n' + '='.repeat(70) + '\n');

  process.exit(0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
