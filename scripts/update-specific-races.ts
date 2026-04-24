#!/usr/bin/env node
/**
 * Update specific races using provided Racing.com URLs
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

async function fetchResults(url: string): Promise<RaceResult[]> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    await page.goto(url, { waitUntil: 'networkidle2' }).catch(e => {
      console.warn(`  Navigation: ${e.message}`);
    });

    await new Promise(r => setTimeout(r, 2000));

    const results = await page.evaluate(() => {
      const horses: RaceResult[] = [];
      const text = document.body.innerText || '';
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);

      let position = 1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match position headers: "1st", "2nd", "3rd", etc.
        const posMatch = line.match(/^(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)/i);
        if (posMatch) {
          const posStr = posMatch[1].toLowerCase();
          if (posStr.includes('1st')) position = 1;
          else if (posStr.includes('2nd')) position = 2;
          else if (posStr.includes('3rd')) position = 3;
          else position = parseInt(posStr);

          // Next line usually has horse name and number: "3. Mortlake (IRE) (7)"
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const nameMatch = nextLine.match(/^\d+\.\s+(.+?)\s*\(/);
            if (nameMatch) {
              const horseName = nameMatch[1].trim();
              if (horseName) {
                const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';
                horses.push({
                  position,
                  horseName,
                  placing,
                });
              }
            }
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

async function updateRace(track: string, raceNum: number, url: string) {
  console.log(`\n📍 ${track} R${raceNum}`);
  console.log(`  🔍 ${url}`);

  const results = await fetchResults(url);

  if (results.length === 0) {
    console.log('  ⚠️  No results found');
    return;
  }

  console.log(`  Found ${results.length} positions\n`);
  for (const r of results) {
    console.log(`    ${r.position}. ${r.horseName} (${r.placing})`);
  }
  console.log('');

  // Get pending bets
  const bets = await sql`
    SELECT id, horse FROM bets
    WHERE track = ${track} AND race_num = ${raceNum} AND result IS NULL
  `;

  // Match and update
  let updated = 0;
  for (const result of results) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    let bestMatch = null;
    let bestDistance = 999;

    for (const bet of bets) {
      if (norm(bet.horse) === norm(result.horseName)) {
        bestMatch = bet;
        break;
      }

      const distance = levenshteinDistance(norm(result.horseName), norm(bet.horse));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = bet;
      }
    }

    if (bestMatch && bestDistance < 3) {
      await updateBetResult(bestMatch.id, track, raceNum, result.placing);
      updated++;

      // Remove from pending list
      bets.splice(bets.indexOf(bestMatch), 1);
    }
  }

  // Mark remaining as LOSS
  for (const bet of bets) {
    await updateBetResult(bet.id, track, raceNum, 'LOSS');
    updated++;
  }

  return updated;
}

async function run() {
  console.log('\n🏇 Update Specific Races\n');
  console.log('='.repeat(60));

  try {
    const races = [
      { track: 'Taree', raceNum: 1, url: 'https://www.racing.com/form/2026-04-09/taree/race/1' },
      { track: 'Gosford', raceNum: 1, url: 'https://www.racing.com/form/2026-04-09/gosford/race/1' },
      { track: 'Geraldton', raceNum: 1, url: 'https://www.racing.com/form/2026-04-09/geraldton/race/1' },
      { track: 'Cairns', raceNum: 1, url: 'https://www.racing.com/form/2026-04-09/ladbrokes-cannon-park/race/1' },
    ];

    let totalUpdated = 0;

    for (const race of races) {
      const count = await updateRace(race.track, race.raceNum, race.url);
      if (count) totalUpdated += count;
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('='.repeat(60));
    console.log(`\n✅ Updated ${totalUpdated} bets\n`);

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
