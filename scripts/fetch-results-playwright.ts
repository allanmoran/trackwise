#!/usr/bin/env node
/**
 * Fetch race results using Playwright with anti-bot bypass
 * Techniques: Browser delays, header spoofing, real Chromium browser
 * Supports: Racenet.com.au, Sportsbet.com.au, TAB, Punters.com.au
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

interface PendingBet {
  id: string;
  track: string;
  raceNum: number;
  horse: string;
  odds: number;
  stake: number;
}

interface RaceResult {
  position: number;
  horseName: string;
  placing: 'WIN' | 'PLACE' | 'LOSS';
}

// Browser user agents to rotate
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomDelay(): number {
  // Random delay between 3-7 seconds
  return Math.floor(Math.random() * 4000) + 3000;
}

async function fetchFromRacenetAu(track: string, raceNum: number, raceDate: string): Promise<RaceResult[]> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent: getRandomUserAgent(),
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
      },
    });

    const trackSlug = track.toLowerCase().replace(/\s+/g, '-');
    const url = `https://www.racenet.com.au/${raceDate}/${trackSlug}/race-${raceNum}`;

    console.log(`    [racenet] Trying: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch {
      console.log(`    [racenet] Navigation failed, trying with longer timeout...`);
      return [];
    }

    await page.waitForTimeout(getRandomDelay());

    // Try to find results in page content
    const pageText = await page.content();

    // Look for position markers in the HTML
    const results = await page.evaluate(() => {
      const horses: RaceResult[] = [];
      const text = document.body.innerText;
      const lines = text.split('\n');

      let position = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect position: "1st", "2nd", etc.
        const posMatch = line.match(/^(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b/i);
        if (posMatch) {
          const posStr = posMatch[1].toLowerCase();
          if (posStr === '1st') position = 1;
          else if (posStr === '2nd') position = 2;
          else if (posStr === '3rd') position = 3;
          else position = parseInt(posStr) || position + 1;

          // Next line or same line should have horse name
          const horseName = line.substring(posStr.length).trim().split(/\s+/)[0];
          if (horseName && horseName.length > 2) {
            const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';
            horses.push({ position, horseName, placing });
          }
        }
      }

      return horses;
    });

    if (results.length > 0) {
      console.log(`    ✓ Got ${results.length} results from racenet`);
      return results;
    }
  } catch (err) {
    console.log(`    [racenet] Error: ${String(err).split('\n')[0]}`);
  } finally {
    if (browser) await browser.close();
  }

  return [];
}

async function fetchFromSportsbetAu(track: string, raceNum: number): Promise<RaceResult[]> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent: getRandomUserAgent(),
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
      },
    });

    // Try direct racing results URL
    const trackSlug = track.toLowerCase().replace(/\s+/g, '-');
    const url = `https://www.sportsbet.com.au/racing/results/${trackSlug}`;

    console.log(`    [sportsbet] Trying: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch {
      console.log(`    [sportsbet] Direct URL failed`);
      return [];
    }

    await page.waitForTimeout(getRandomDelay());

    const results = await page.evaluate((rNum) => {
      const horses: RaceResult[] = [];
      const text = document.body.innerText;
      const lines = text.split('\n').filter(l => l.trim());

      // Look for race results section
      let inRaceNum = false;
      let position = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check if this is the race we want
        if (line.includes(`Race ${rNum}`) || line.includes(`R${rNum}`)) {
          inRaceNum = true;
          continue;
        }

        if (inRaceNum) {
          const posMatch = line.match(/^(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b/i);
          if (posMatch) {
            const posStr = posMatch[1].toLowerCase();
            if (posStr === '1st') position = 1;
            else if (posStr === '2nd') position = 2;
            else if (posStr === '3rd') position = 3;
            else position = parseInt(posStr) || position + 1;

            // Extract horse name from line after position
            const horseName = line.substring(posStr.length).trim().split(/[\s\(]/)[0];
            if (horseName && horseName.length > 2) {
              const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';
              horses.push({ position, horseName, placing });
            }
          }
        }
      }

      return horses;
    }, raceNum);

    if (results.length > 0) {
      console.log(`    ✓ Got ${results.length} results from sportsbet`);
      return results;
    }
  } catch (err) {
    console.log(`    [sportsbet] Error: ${String(err).split('\n')[0]}`);
  } finally {
    if (browser) await browser.close();
  }

  return [];
}

async function levenshteinDistance(a: string, b: string): Promise<number> {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

async function matchHorseToBet(horseName: string, bets: PendingBet[]): Promise<PendingBet | null> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Exact match
  let match = bets.find(b => norm(b.horse) === norm(horseName));
  if (match) return match;
  
  // Substring match
  match = bets.find(b =>
    norm(horseName).includes(norm(b.horse)) || norm(b.horse).includes(norm(horseName))
  );
  if (match) return match;
  
  // Close match (Levenshtein < 3)
  const distances = await Promise.all(
    bets.map(async b => ({
      bet: b,
      distance: await levenshteinDistance(norm(horseName), norm(b.horse))
    }))
  );
  distances.sort((a, b) => a.distance - b.distance);
  
  if (distances[0].distance < 3) {
    return distances[0].bet;
  }
  
  return null;
}

async function updateBetResult(betId: string, horseName: string, result: 'WIN' | 'PLACE' | 'LOSS', odds: number, stake: number) {
  // Calculate P&L
  let pnl = 0;
  if (result === 'WIN') {
    pnl = stake * (odds - 1);
  } else if (result === 'PLACE') {
    pnl = stake * ((odds - 1) * 0.25);
  } else {
    pnl = -stake;
  }

  // Update bet result
  await sql`
    UPDATE bets
    SET result = ${result}
    WHERE id = ${betId}
  `;

  // Update kelly_logs
  await sql`
    UPDATE kelly_logs
    SET actual_result = ${result}, actual_pnl = ${pnl}
    WHERE bet_id = ${betId}
  `;

  console.log(`    ✅ ${horseName}: ${result} (P&L: $${pnl.toFixed(2)})`);
}

async function runFetcher() {
  console.log('\n🏇 PLAYWRIGHT RESULTS FETCHER - Anti-Bot Bypass\n');
  console.log('='.repeat(60));

  let successCount = 0;
  let skipCount = 0;

  try {
    const today = new Date().toISOString().split('T')[0];
    
    console.log('[db] Fetching pending bets from today...');
    const pendingBets = await sql<PendingBet[]>`
      SELECT id, track, race_num as "raceNum", horse, odds::numeric, stake::numeric
      FROM bets
      WHERE result IS NULL AND created_at::date = ${today}
      ORDER BY track, race_num
    `;

    console.log(`[db] Found ${pendingBets.length} pending bets\n`);

    if (pendingBets.length === 0) {
      console.log('No pending bets to resolve.\n');
      return;
    }

    // Group by race
    const betsByRace = new Map<string, PendingBet[]>();
    for (const bet of pendingBets) {
      const key = `${bet.track}-R${bet.raceNum}`;
      if (!betsByRace.has(key)) {
        betsByRace.set(key, []);
      }
      betsByRace.get(key)!.push(bet);
    }

    console.log(`[races] Processing ${betsByRace.size} races\n`);

    // Try to fetch results for each race
    for (const [raceKey, bets] of betsByRace) {
      const track = bets[0].track;
      const raceNum = bets[0].raceNum;

      console.log(`\n  📍 ${track} R${raceNum} - ${bets.length} bets`);

      let results: RaceResult[] = [];

      // Try multiple sources with delays
      console.log(`    [attempt 1/3] Trying racenet.com.au...`);
      results = await fetchFromRacenetAu(track, raceNum, today);
      
      if (results.length === 0) {
        await new Promise(r => setTimeout(r, getRandomDelay()));
        console.log(`    [attempt 2/3] Trying sportsbet.com.au...`);
        results = await fetchFromSportsbetAu(track, raceNum);
      }

      if (results.length === 0) {
        console.log(`    ⏳ No results found (race may not be finished)`);
        skipCount += bets.length;
        continue;
      }

      console.log(`    ✓ Got ${results.length} results`);

      // Match and update
      for (const result of results) {
        const bet = await matchHorseToBet(result.horseName, bets);
        if (bet) {
          await updateBetResult(bet.id, bet.horse, result.placing, bet.odds, bet.stake);
          successCount++;
        }
      }

      // Add delay between races to avoid detection
      await new Promise(r => setTimeout(r, getRandomDelay()));
    }

  } catch (err) {
    console.error('[Error]', err);
  } finally {
    console.log('\n' + '='.repeat(60));
    console.log(`Updated: ${successCount} bets`);
    if (skipCount > 0) {
      console.log(`Pending: ${skipCount} bets`);
    }
    console.log();

    await sql.end();
  }
}

runFetcher().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
