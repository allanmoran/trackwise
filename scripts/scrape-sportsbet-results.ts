#!/usr/bin/env node
/**
 * Auto-scrape Sportsbet Form URLs to get race results
 * Updates pending bets with WIN/PLACE/LOSS results
 *
 * Usage: npx tsx scripts/scrape-sportsbet-results.ts
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

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
  sourceUrl: string;
}

interface RaceResult {
  position: number;
  horseName: string;
  placing: 'WIN' | 'PLACE' | 'LOSS';
}

async function scrapeRaceResults(url: string): Promise<RaceResult[]> {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    console.log(`  🔍 Scraping ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => {
      console.warn(`  ⚠️  Navigation warning: ${e.message}`);
    });

    // Wait for page to settle
    await new Promise(r => setTimeout(r, 2000));

    // Extract results from page
    const results = await page.evaluate(() => {
      const horses: RaceResult[] = [];

      // Look for result rows - typically in a results table
      // Pattern: Win, Place positions are shown, Loss is anything not placed
      const resultRows = document.querySelectorAll('[class*="result"], [class*="finishing"], tr');

      let position = 1;
      for (const row of resultRows) {
        const text = row.textContent || '';

        // Look for position numbers (1st, 2nd, 3rd, etc.)
        const posMatch = text.match(/^(1st|2nd|3rd|\d+(?:st|nd|rd|th))/i);
        if (posMatch) {
          position = parseInt(posMatch[1]);

          // Extract horse name - usually after position
          const nameMatch = text.match(/(?:1st|2nd|3rd|\d+(?:st|nd|rd|th))\s+(.+?)(?:\s+\(|$)/i);
          if (nameMatch) {
            const horseName = nameMatch[1].trim();
            const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';

            horses.push({
              position,
              horseName,
              placing,
            });
          }
        }
      }

      return horses;
    });

    await browser.close();
    return results;
  } catch (err) {
    await browser.close();
    console.error(`  ❌ Scrape failed: ${err}`);
    return [];
  }
}

async function matchHorseToBet(horseName: string, bets: PendingBet[]): Promise<PendingBet | null> {
  // Exact match first
  let match = bets.find(b => b.horse.toLowerCase() === horseName.toLowerCase());
  if (match) return match;

  // Partial match (horse name contains or is contained in)
  match = bets.find(b =>
    horseName.toLowerCase().includes(b.horse.toLowerCase()) ||
    b.horse.toLowerCase().includes(horseName.toLowerCase())
  );
  if (match) return match;

  // Levenshtein distance for typos
  const distances = bets.map(b => ({
    bet: b,
    distance: levenshteinDistance(horseName.toLowerCase(), b.horse.toLowerCase())
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

  // Update KB stats (jockey and trainer)
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
        SET total_runs = total_runs + 1, total_places = total_places + 1
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
        SET total_runs = total_runs + 1, total_places = total_places + 1
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
  let pnl = 0;
  if (result === 'WIN') {
    pnl = b.stake * (b.odds - 1);
  } else if (result === 'PLACE') {
    pnl = b.stake * ((b.odds - 1) * 0.25);
  } else {
    pnl = -b.stake;
  }

  console.log(`    ✅ ${b.horse}: ${result} (P&L: $${pnl.toFixed(2)})`);
}

async function runScraper() {
  console.log('\n🏇 Sportsbet Results Auto-Scraper\n');
  console.log('=' .repeat(60));

  try {
    // Get all pending bets with their source URLs
    const pendingBets = await sql<PendingBet[]>`
      SELECT id, track, race_num as "raceNum", horse, jockey, trainer, odds, stake, source_url as "sourceUrl"
      FROM bets
      WHERE result IS NULL AND source_url IS NOT NULL
      ORDER BY source_url
    `;

    if (pendingBets.length === 0) {
      console.log('\n✅ No pending bets to scrape\n');
      return;
    }

    console.log(`\n📊 Found ${pendingBets.length} pending bets\n`);

    // Group bets by URL
    const betsByUrl = new Map<string, PendingBet[]>();
    for (const bet of pendingBets) {
      if (!betsByUrl.has(bet.sourceUrl)) {
        betsByUrl.set(bet.sourceUrl, []);
      }
      betsByUrl.get(bet.sourceUrl)!.push(bet);
    }

    let successCount = 0;
    let failCount = 0;

    // Scrape each unique URL
    for (const [url, bets] of betsByUrl) {
      const raceInfo = bets[0];
      console.log(`\n📍 ${raceInfo.track} R${raceInfo.raceNum}`);

      try {
        const results = await scrapeRaceResults(url);

        if (results.length === 0) {
          console.log('  ⚠️  No results extracted from page');
          failCount += bets.length;
          continue;
        }

        // Match results to bets
        for (const result of results) {
          const bet = await matchHorseToBet(result.horseName, bets);
          if (bet) {
            await updateBetResult(bet.id, result.placing);
            successCount++;
          }
        }

        // Mark unmatched bets as LOSS (they didn't finish)
        const matchedHorses = results.map(r => r.horseName);
        for (const bet of bets) {
          if (!matchedHorses.some(h =>
            h.toLowerCase().includes(bet.horse.toLowerCase()) ||
            bet.horse.toLowerCase().includes(h.toLowerCase())
          )) {
            console.log(`    ❓ ${bet.horse}: LOSS (unplaced)`);
            await updateBetResult(bet.id, 'LOSS');
            successCount++;
          }
        }
      } catch (err) {
        console.error(`  ❌ Scrape error: ${err}`);
        failCount += bets.length;
      }

      // Rate limit between requests
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Results Updated: ${successCount}/${pendingBets.length}`);
    if (failCount > 0) {
      console.log(`⚠️  Failed: ${failCount}`);
    }
    console.log();

  } catch (err) {
    console.error('[Error]', err);
  } finally {
    await sql.end();
  }
}

runScraper().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
