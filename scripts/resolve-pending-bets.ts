#!/usr/bin/env node
/**
 * Resolve Pending Bets Against Scraped Results
 *
 * Fetches Sportsbet race results and matches them to pending bets in the database.
 * Updates bets with WIN/PLACE/LOSS results and calculated P&L.
 *
 * Usage: npm run resolve-bets
 *        OR: triggered via API /api/scrape/results
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

interface RaceResult {
  position: number;
  horseName: string;
  placing: 'WIN' | 'PLACE' | 'LOSS';
}

interface PendingBet {
  id: number;
  raceId: number;
  horseName: string;
  jockeyName: string | null;
  trainerName: string | null;
  stake: number;
  openingOdds: number;
  track: string;
  raceNum: number;
  meetingId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function log(level: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [RESOLVER] ${level.padEnd(5)} ${msg}`);
}

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Levenshtein distance for more accurate string matching
function levenshteinDistance(a: string, b: string): number {
  const aNorm = normaliseName(a);
  const bNorm = normaliseName(b);
  const matrix: number[][] = [];

  for (let i = 0; i <= bNorm.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= aNorm.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bNorm.length; i++) {
    for (let j = 1; j <= aNorm.length; j++) {
      const cost = aNorm[j - 1] === bNorm[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j] + 1,      // deletion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[bNorm.length][aNorm.length];
}

function fuzzyMatch(a: string, b: string, threshold: number = 0.85): boolean {
  const aNorm = normaliseName(a);
  const bNorm = normaliseName(b);

  // Exact match
  if (aNorm === bNorm) return true;

  // Substring match (handles truncation)
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;

  // Levenshtein distance-based similarity
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(aNorm.length, bNorm.length);
  const similarity = 1 - (distance / maxLen);
  return similarity >= threshold;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPING
// ─────────────────────────────────────────────────────────────────────────────

async function getTodayRaces(): Promise<
  { track: string; trackId: string; raceNum: number; time: string; url: string }[]
> {
  let browser;
  try {
    log('INFO', 'Fetching today\'s Sportsbet races...');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://www.sportsbetform.com.au/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    }).catch(() => null);

    await new Promise(r => setTimeout(r, 1500));

    const races = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a'));
      const races = new Map<string, any[]>();

      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link as HTMLAnchorElement).textContent?.trim() || '';

        if (/\d{2}:\d{2}/.test(text)) {
          const match = href.match(/sportsbetform\.com\.au\/(\d+)\/(\d+)/);
          if (match) {
            const [, trackId, raceId] = match;

            if (!races.has(trackId)) {
              races.set(trackId, []);
            }

            races.get(trackId)!.push({
              trackId,
              raceId,
              time: text,
              url: href,
            });
          }
        }
      }

      return Array.from(races.values()).flat();
    });

    await browser.close();

    const trackMap: Record<string, string> = {
      '435971': 'Cranbourne',
      '435950': 'Darwin',
      '435960': 'Gatton',
      '435967': 'Geelong',
      '435954': 'Gold Coast',
      '435951': 'Alice Springs', // Corrected from Launceston
      '435955': 'Murray Bridge',
      '435956': 'Tamworth',
      '435957': 'Wellington',
      '435973': 'Sandown',
      '435968': 'Moonee Valley',
      '435969': 'Caulfield',
      '435970': 'Flemington',
      '435974': 'Bendigo',
      '436088': 'Ascot',
      '436054': 'Bowen',
      '435964': 'Ballina',
    };

    const result = races.map((r: any) => ({
      track: trackMap[r.trackId] || `Track ${r.trackId}`,
      trackId: r.trackId,
      raceNum: parseInt(r.raceId) || 1,
      time: r.time,
      url: r.url,
    }));

    log('INFO', `Found ${result.length} races`);
    return result;
  } catch (err) {
    log('WARN', `Failed to fetch races: ${err}`);
    if (browser) await browser.close();
    return [];
  }
}

async function scrapeRaceResults(
  url: string,
  track: string,
  raceNum: number
): Promise<RaceResult[]> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    }).catch(() => null);

    await new Promise(r => setTimeout(r, 1000));

    const { finished, results } = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const isFinished =
        bodyText.includes('Result') ||
        bodyText.includes('RESULT') ||
        bodyText.includes('Finished') ||
        bodyText.includes('WIN');

      const horses: RaceResult[] = [];

      // Look for result rows - prioritize Sportsbet-specific selectors
      const rows = document.querySelectorAll(
        '[class*="finishing"], [class*="result-row"], [data-position], tr[class*="result"], ' +
        'div[class*="placing"], div[class*="position"], li'
      );

      for (const row of rows) {
        const text = row.textContent || '';
        if (text.length < 3) continue;

        // Extract position more precisely: match 1st, 2nd, 3rd, etc. at the start
        const posMatch = text.match(/^[\s]*(1st|2nd|3rd|4th|5th|1|2|3|4|5)[\s\.\-]/i);

        if (!posMatch) continue;

        const posStr = posMatch[1].toLowerCase();
        let position = 1;

        if (posStr === '1st' || posStr === '1') position = 1;
        else if (posStr === '2nd' || posStr === '2') position = 2;
        else if (posStr === '3rd' || posStr === '3') position = 3;
        else if (posStr === '4th' || posStr === '4') position = 4;
        else if (posStr === '5th' || posStr === '5') position = 5;
        else continue;

        // Extract horse name more robustly
        // Remove position indicator and jockey info
        let cleanText = text
          .replace(/^[\s]*(1st|2nd|3rd|4th|5th|[1-5])[\s\.\-]+/i, '')
          .trim();

        // Remove common jockey/weight/odds indicators at the end
        cleanText = cleanText
          .replace(/[\s\(]?\d+[kgstlbs\)\s]*$/i, '') // weight
          .replace(/\s+\d+\.\d+\s*$/, '') // odds
          .replace(/\s*\(.*\)\s*$/, '') // parenthetical info
          .trim();

        // Extract horse name - take everything up to a digit sequence or parenthesis
        const nameMatch = cleanText.match(/^([A-Za-z\s\-\']+?)(?:\s*[\(\d]|$)/);

        if (nameMatch) {
          let horseName = nameMatch[1].trim();

          // Validate horse name
          if (horseName.length >= 2 && /[a-zA-Z]/.test(horseName)) {
            const placing =
              position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';

            // Check for duplicates
            if (
              !horses.some(
                h =>
                  h.horseName.toLowerCase() === horseName.toLowerCase()
              )
            ) {
              horses.push({
                position,
                horseName,
                placing,
              });
            }
          }
        }
      }

      return { finished: isFinished, results: horses };
    });

    await browser.close();

    if (!finished) {
      log('WARN', `Race not finished: ${track} R${raceNum}`);
      return [];
    }

    return results;
  } catch (err) {
    log('WARN', `Failed to scrape ${track} R${raceNum}: ${err}`);
    if (browser) await browser.close();
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BET RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

function getPendingBets(date: string): PendingBet[] {
  try {
    const bets = db
      .prepare(
        `
      SELECT
        b.id,
        b.race_id as raceId,
        h.name as horseName,
        j.name as jockeyName,
        t.name as trainerName,
        b.stake,
        b.opening_odds as openingOdds,
        r.track,
        r.race_number as raceNum,
        r.meeting_id as meetingId
      FROM bets b
      JOIN races r ON b.race_id = r.id
      JOIN horses h ON b.horse_id = h.id
      LEFT JOIN jockeys j ON b.jockey_id = j.id
      LEFT JOIN trainers t ON b.trainer_id = t.id
      WHERE DATE(b.placed_at) = ?
        AND b.result IS NULL
      ORDER BY r.track, r.race_number
    `
      )
      .all(date) as PendingBet[];

    return bets;
  } catch (err) {
    log('ERROR', `Failed to fetch pending bets: ${err}`);
    return [];
  }
}

function resolveBet(
  bet: PendingBet,
  raceResults: RaceResult[]
): { result: string; profitLoss: number } | null {
  // Find matching horse in results
  const result = raceResults.find(r => fuzzyMatch(r.horseName, bet.horseName));

  if (!result) {
    return null;
  }

  // Calculate P&L
  const odds = bet.openingOdds || 1;
  let profitLoss = 0;

  if (result.placing === 'WIN') {
    profitLoss = bet.stake * (odds - 1);
  } else if (result.placing === 'PLACE') {
    const placeOdds = 1 + (odds - 1) / 4;
    profitLoss = bet.stake * (placeOdds - 1);
  } else if (result.placing === 'LOSS') {
    profitLoss = -bet.stake;
  }

  return {
    result: result.placing,
    profitLoss: Math.round(profitLoss * 100) / 100,
  };
}

async function resolvePendingBets(): Promise<{
  resolved: number;
  updated: number;
  errors: number;
}> {
  const today = new Date().toISOString().split('T')[0];
  log('INFO', `Resolving pending bets for ${today}`);

  const pendingBets = getPendingBets(today);
  log('INFO', `Found ${pendingBets.length} pending bets`);

  if (pendingBets.length === 0) {
    return { resolved: 0, updated: 0, errors: 0 };
  }

  // Get today's races
  const races = await getTodayRaces();
  if (races.length === 0) {
    log('WARN', 'No races found for today');
    return { resolved: 0, updated: 0, errors: 0 };
  }

  // Group pending bets by race
  const betsByRace = new Map<string, PendingBet[]>();
  for (const bet of pendingBets) {
    const key = `${bet.track}_R${bet.raceNum}`;
    if (!betsByRace.has(key)) {
      betsByRace.set(key, []);
    }
    betsByRace.get(key)!.push(bet);
  }

  let resolved = 0;
  let updated = 0;
  let errors = 0;

  const updateStmt = db.prepare(`
    UPDATE bets
    SET result = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  for (const [raceKey, betList] of betsByRace) {
    // Find race in today's races
    const raceMatch = raceKey.match(/(.+)_R(\d+)$/);
    if (!raceMatch) continue;

    const [, trackName, raceNum] = raceMatch;
    const raceData = races.find(
      r => r.track === trackName && r.raceNum === parseInt(raceNum)
    );

    if (!raceData) {
      log('WARN', `No race found for ${raceKey}`);
      continue;
    }

    log('INFO', `Scraping ${raceKey}...`);

    // Scrape results for this race
    const raceResults = await scrapeRaceResults(
      raceData.url,
      trackName,
      parseInt(raceNum)
    );

    if (raceResults.length === 0) {
      log('WARN', `No results found for ${raceKey}`);
      continue;
    }

    // Resolve each bet
    for (const bet of betList) {
      try {
        const resolution = resolveBet(bet, raceResults);

        if (resolution) {
          updateStmt.run(
            resolution.result,
            resolution.profitLoss,
            bet.id
          );

          log(
            'INFO',
            `✓ Bet ${bet.id} (${bet.horseName}): ${resolution.result} → $${resolution.profitLoss}`
          );

          updated++;
        }

        resolved++;
      } catch (err) {
        log('ERROR', `Failed to resolve bet ${bet.id}: ${err}`);
        errors++;
      }
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  log('INFO', `Resolution complete: ${updated}/${resolved} bets updated`);
  return { resolved, updated, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  try {
    const result = await resolvePendingBets();

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESOLUTION SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Total Resolved: ${result.resolved}`);
    console.log(`  Successfully Updated: ${result.updated}`);
    console.log(`  Errors: ${result.errors}`);
    console.log('='.repeat(60) + '\n');

    process.exit(result.errors > 0 ? 1 : 0);
  } catch (err) {
    log('ERROR', `Fatal: ${err}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
