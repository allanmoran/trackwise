#!/usr/bin/env node
/**
 * Fetch race results from TAB/Racing.com and update pending bets
 * Usage: npx tsx scripts/fetch-results-tab.ts
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

interface PendingBet {
  id: string;
  track: string;
  raceNum: number;
  horse: string;
  jockey: string;
  trainer: string;
  odds: number;
  stake: number;
  createdAt: string;
}

interface RaceResult {
  position: number;
  horseName: string;
  placing: 'WIN' | 'PLACE' | 'LOSS';
}

const TRACK_MAPPING: Record<string, string> = {
  'taree': 'taree',
  'gosford': 'gosford',
  'cairns': 'cairns',
  'geraldton': 'geraldton',
  'pakenham': 'pakenham',
  'kyneton': 'kyneton',
};

async function fetchRacingComResults(track: string, raceNum: number, raceDate: string): Promise<RaceResult[]> {
  let browser;
  try {
    console.log(`    [fetch] Launching browser...`);
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(20000);

    const trackSlug = track.toLowerCase().replace(/\s+/g, '-');
    const url = `https://www.racing.com/form/${raceDate}/${trackSlug}/race-${raceNum}/full-form`;

    console.log(`    [fetch] URL: ${url}`);

    let pageTitle = '';
    try {
      console.log(`    [fetch] Navigating...`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
      pageTitle = await page.title();
      console.log(`    [fetch] Page title: ${pageTitle}`);
    } catch (navErr) {
      console.log(`    [fetch] Navigation warning (continuing): ${navErr}`);
    }

    await new Promise(r => setTimeout(r, 1000));

    console.log(`    [fetch] Evaluating page...`);
    const results = await page.evaluate(() => {
      const horses: RaceResult[] = [];
      const text = document.body.innerText || '';
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);

      let position = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match position headers: "1st", "2nd", "3rd", etc. (anywhere in line)
        if (/\b(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b/i.test(line)) {
          const posMatch = line.match(/(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)/i);
          if (posMatch) {
            const posStr = posMatch[1].toLowerCase();
            if (posStr === '1st') position = 1;
            else if (posStr === '2nd') position = 2;
            else if (posStr === '3rd') position = 3;
            else {
              const num = parseInt(posStr);
              position = isNaN(num) ? position + 1 : num;
            }

            // Next line should have horse info: "NN. Horse Name (weight)"
            if (i + 1 < lines.length) {
              const nextLine = lines[i + 1];
              const nameMatch = nextLine.match(/^\d+\.\s+(.+?)(?:\s*\(|$)/);
              if (nameMatch) {
                const horseName = nameMatch[1].trim();
                if (horseName && horseName.length > 1) {
                  const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';
                  horses.push({ position, horseName, placing });
                }
              }
            }
          }
        }
      }

      return horses;
    });

    console.log(`    [fetch] Found ${results.length} results`);
    await browser.close();
    return results;
  } catch (err) {
    console.error(`    [fetch] ERROR: ${err}`);
    if (browser) await browser.close();
    return [];
  }
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
  const distances = bets.map(b => ({
    bet: b,
    distance: levenshteinDistance(norm(horseName), norm(b.horse))
  }));
  distances.sort((a, b) => a.distance - b.distance);

  if (distances[0].distance < 3) {
    return distances[0].bet;
  }

  return null;
}

function levenshteinDistance(a: string, b: string): number {
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

async function updateBetResult(betId: string, result: 'WIN' | 'PLACE' | 'LOSS') {
  const today = new Date().toISOString().split('T')[0];

  // Update bet result
  await sql`
    UPDATE bets
    SET result = ${result}
    WHERE id = ${betId}
  `;

  // Fetch bet details for KB update
  const bet = await sql`
    SELECT track, race_num, horse, jockey, trainer, odds, stake
    FROM bets
    WHERE id = ${betId}
  `;

  if (bet.length === 0) return;
  const b = bet[0];

  // Update jockey/trainer KB stats
  if (b.jockey && b.jockey !== 'Unknown') {
    if (result === 'WIN') {
      await sql`
        UPDATE jockey_stats
        SET total_runs = total_runs + 1, total_wins = total_wins + 1
        WHERE jockey_name = ${b.jockey}
      `;
    } else if (result === 'PLACE') {
      await sql`
        UPDATE jockey_stats
        SET total_runs = total_runs + 1, total_places = COALESCE(total_places, 0) + 1
        WHERE jockey_name = ${b.jockey}
      `;
    } else {
      await sql`
        UPDATE jockey_stats
        SET total_runs = total_runs + 1
        WHERE jockey_name = ${b.jockey}
      `;
    }
  }

  if (b.trainer && b.trainer !== 'Unknown') {
    if (result === 'WIN') {
      await sql`
        UPDATE trainer_stats
        SET total_runs = total_runs + 1, total_wins = total_wins + 1
        WHERE trainer_name = ${b.trainer}
      `;
    } else if (result === 'PLACE') {
      await sql`
        UPDATE trainer_stats
        SET total_runs = total_runs + 1, total_places = COALESCE(total_places, 0) + 1
        WHERE trainer_name = ${b.trainer}
      `;
    } else {
      await sql`
        UPDATE trainer_stats
        SET total_runs = total_runs + 1
        WHERE trainer_name = ${b.trainer}
      `;
    }
  }

  // Calculate P&L
  const stake = parseFloat(String(b.stake));
  const odds = parseFloat(String(b.odds));
  let pnl = 0;

  if (result === 'WIN') {
    pnl = stake * (odds - 1);
  } else if (result === 'PLACE') {
    pnl = stake * ((odds - 1) * 0.25);
  } else {
    pnl = -stake;
  }

  console.log(`    ✅ ${b.horse}: ${result} (P&L: $${pnl.toFixed(2)})`);
}

async function runFetcher() {
  console.log('\n🏇 TAB/Racing.com Results Fetcher\n');
  console.log('=' .repeat(60));

  let successCount = 0;
  let skipCount = 0;
  let totalPending = 0;

  try {
    // Get all pending bets grouped by race
    console.log('[db] Fetching pending bets from database...');
    const pendingBets = await sql<PendingBet[]>`
      SELECT id, track, race_num as "raceNum", horse, jockey, trainer, odds, stake,
             to_char(created_at, 'YYYY-MM-DD') as "createdAt"
      FROM bets
      WHERE result IS NULL
      ORDER BY track, race_num
    `;

    console.log(`[db] Found ${pendingBets.length} pending bets`);
    totalPending = pendingBets.length;

    if (pendingBets.length === 0) {
      console.log('\nUpdated: 0 bets');
      return;
    }

    console.log(`\n📊 Found ${pendingBets.length} pending bets\n`);

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

    // Fetch results for each race
    for (const [raceKey, bets] of betsByRace) {
      const track = bets[0].track;
      const raceNum = bets[0].raceNum;
      const raceDate = bets[0].createdAt;

      console.log(`\n  📍 ${track} R${raceNum} (${raceDate}) - ${bets.length} bets`);

      try {
        const results = await fetchRacingComResults(track, raceNum, raceDate);

        if (results.length === 0) {
          console.log(`    ⏳ No results (races may not be finished)`);
          skipCount += bets.length;
          continue;
        }

        console.log(`    ✓ Got ${results.length} results`);

        // Match and update each result
        for (const result of results) {
          const bet = await matchHorseToBet(result.horseName, bets);
          if (bet) {
            await updateBetResult(bet.id, result.placing);
            successCount++;
          }
        }

        // Mark unmatched bets as LOSS
        const matchedNorms = results.map(r =>
          r.horseName.toLowerCase().replace(/[^a-z0-9]/g, '')
        );

        for (const bet of bets) {
          const betNorm = bet.horse.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!matchedNorms.some(m => m === betNorm || m.includes(betNorm) || betNorm.includes(m))) {
            await updateBetResult(bet.id, 'LOSS');
            successCount++;
          }
        }
      } catch (err) {
        console.error(`    ❌ Race error: ${err}`);
        skipCount += bets.length;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
    }

  } catch (err) {
    console.error('[Scraper Error]', err);
    successCount = 0;
    skipCount = totalPending;
  } finally {
    // Always output summary in parseable format
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
