#!/usr/bin/env node
/**
 * Fetch results from a specific Sportsbet URL and update matching bets
 * Usage: npx tsx scripts/fetch-single-race-results.ts <url> <track> <raceNum>
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

interface RaceResult {
  position: number;
  horseName: string;
  placing: 'WIN' | 'PLACE' | 'LOSS';
}

async function fetchSportsbetResults(url: string): Promise<RaceResult[]> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    console.log(`  🔍 Fetching: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' }).catch(e => {
      console.warn(`  Navigation: ${e.message}`);
    });

    await new Promise(r => setTimeout(r, 3000));

    const results = await page.evaluate(() => {
      const horses: RaceResult[] = [];

      // Look for finishing positions in the page
      const text = document.body.innerText || '';
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      let position = 1;
      for (const line of lines) {
        // Look for position patterns like "1st", "2nd", "3rd" or "1", "2", "3"
        const posMatch = line.match(/^(1st|2nd|3rd|4th|1|2|3|4)\s+/i);

        if (posMatch && position <= 10) {
          // Extract horse name - everything after position
          const nameStart = line.indexOf(' ') + 1;
          let horseName = line.substring(nameStart);

          // Clean up - remove odds, weights, and other data
          horseName = horseName.split(/\$|@|\(|\d{2}\.\d/)[0].trim();

          if (horseName && horseName.length > 2 && !horseName.match(/^\d/)) {
            const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';
            horses.push({
              position,
              horseName,
              placing,
            });
            position++;
          }
        }
      }

      return horses;
    });

    await browser.close();
    return results;
  } catch (err) {
    if (browser) await browser.close();
    console.error(`  ❌ Fetch failed: ${err}`);
    return [];
  }
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

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

async function matchHorseToBets(horseName: string, track: string, raceNum: number) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const bets = await sql`
    SELECT id, horse, jockey, trainer, odds, stake
    FROM bets
    WHERE track = ${track} AND race_num = ${raceNum} AND result IS NULL
  `;

  for (const bet of bets) {
    // Exact match
    if (norm(bet.horse) === norm(horseName)) return bet;
  }

  for (const bet of bets) {
    // Substring match
    if (norm(horseName).includes(norm(bet.horse)) || norm(bet.horse).includes(norm(horseName))) {
      return bet;
    }
  }

  // Levenshtein match
  const distances = bets.map(b => ({
    bet: b,
    distance: levenshteinDistance(norm(horseName), norm(b.horse))
  }));
  distances.sort((a, b) => a.distance - b.distance);

  if (distances[0] && distances[0].distance < 3) {
    return distances[0].bet;
  }

  return null;
}

async function updateBetResult(betId: string, track: string, raceNum: number, result: 'WIN' | 'PLACE' | 'LOSS') {
  await sql`
    UPDATE bets
    SET result = ${result}
    WHERE id = ${betId}
  `;

  const bet = await sql`
    SELECT horse, jockey, trainer, odds, stake
    FROM bets
    WHERE id = ${betId}
  `;

  if (bet.length === 0) return;
  const b = bet[0];

  // Update KB stats
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

async function run() {
  const url = process.argv[2];
  const track = process.argv[3];
  const raceNum = parseInt(process.argv[4]);

  if (!url || !track || isNaN(raceNum)) {
    console.error('\nUsage: npx tsx scripts/fetch-single-race-results.ts <url> <track> <raceNum>');
    console.error('Example: npx tsx scripts/fetch-single-race-results.ts "https://www.sportsbet.com.au/..." Gosford 1\n');
    process.exit(1);
  }

  console.log(`\n🏇 Fetching Single Race Results\n`);
  console.log('=' .repeat(60));
  console.log(`\n📍 ${track} R${raceNum}\n`);

  try {
    const results = await fetchSportsbetResults(url);

    if (results.length === 0) {
      console.log('  ⚠️  No results found on page');
      await sql.end();
      return;
    }

    console.log(`  Found ${results.length} positions:\n`);
    for (const r of results) {
      console.log(`    ${r.position}. ${r.horseName} (${r.placing})`);
    }

    console.log('');

    let updated = 0;

    // Match and update each result
    for (const result of results) {
      const bet = await matchHorseToBets(result.horseName, track, raceNum);
      if (bet) {
        await updateBetResult(bet.id, track, raceNum, result.placing);
        updated++;
      } else {
        console.log(`    ❓ ${result.horseName}: No matching bet found`);
      }
    }

    // Mark unmatched bets as LOSS
    const unmatchedBets = await sql`
      SELECT id, horse FROM bets
      WHERE track = ${track} AND race_num = ${raceNum} AND result IS NULL
    `;

    for (const bet of unmatchedBets) {
      console.log(`    ❓ ${bet.horse}: LOSS (unplaced)`);
      await updateBetResult(bet.id, track, raceNum, 'LOSS');
      updated++;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Updated ${updated} bets\n`);

  } catch (err) {
    console.error('[Error]', err);
  } finally {
    await sql.end();
  }
}

run().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
