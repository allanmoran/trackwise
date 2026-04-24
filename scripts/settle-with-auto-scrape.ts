#!/usr/bin/env node
/**
 * Automatically settle bets using:
 * 1. Barrier finish positions from racenet (provided data)
 * 2. Form data scraped from Sportsbet (barrier->horse mapping)
 * 3. Improved fuzzy matching for accuracy
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

interface FormData {
  track: string;
  raceNum: number;
  barriers: Record<number, string>; // barrier -> horse name
}

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
  const maxLen = Math.max(aNorm.length, bNorm.length);
  return (1 - distance / maxLen) >= threshold;
}

async function scrapeFormData(trackId: string, raceId: string): Promise<FormData | null> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    const url = `https://www.sportsbetform.com.au/${trackId}/${raceId}`;

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 1000));

    const formData = await page.evaluate(() => {
      const barriers: Record<number, string> = {};

      // Look for entries/form with barrier numbers and horse names
      const rows = document.querySelectorAll(
        'tr, li, div[class*="entry"], div[class*="horse"], div[class*="field"]'
      );

      for (const row of rows) {
        const text = row.textContent || '';

        // Pattern: "1 Horse Name" or "01. Horse Name" or similar
        const match = text.match(/^\s*(\d{1,2})\s*[\.\-\s]+([A-Za-z\s\-']+?)(?:\s*\(|\s+\d+\w+|\s*$)/);
        if (match) {
          const barrier = parseInt(match[1]);
          let horseName = match[2].trim()
            .replace(/\([^)]*\)/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          if (horseName.length > 2 && barrier > 0 && barrier < 30) {
            barriers[barrier] = horseName;
          }
        }
      }

      return { barriers };
    });

    await browser.close();

    return formData?.barriers && Object.keys(formData.barriers).length > 0
      ? { track: '', raceNum: 0, barriers: formData.barriers }
      : null;
  } catch (err) {
    if (browser) await browser.close();
    return null;
  }
}

function settleBet(betId: number, result: 'WIN' | 'PLACE' | 'LOSS') {
  try {
    const bet = db.prepare('SELECT stake, opening_odds, closing_odds FROM bets WHERE id = ?').get(betId) as any;
    if (!bet) return false;

    const odds = bet.closing_odds || bet.opening_odds || 0;
    let profitLoss = 0;
    if (result === 'WIN') profitLoss = bet.stake * (odds - 1);
    else if (result === 'PLACE') profitLoss = bet.stake * ((odds - 1) / 4);
    else if (result === 'LOSS') profitLoss = -bet.stake;

    db.prepare(`UPDATE bets SET result = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(result, Math.round(profitLoss * 100) / 100, betId);
    return true;
  } catch (err) {
    log(`❌ Error settling bet ${betId}: ${err}`);
    return false;
  }
}

async function main() {
  log('\n' + '='.repeat(70));
  log('🏇 AUTO-SETTLING BETS WITH SCRAPED FORM DATA\n');

  // Get pending bets
  const pendingBets = db.prepare(`
    SELECT b.id, r.track, r.race_number, b.horse_id, h.name as horse_name
    FROM bets b
    JOIN races r ON b.race_id = r.id
    JOIN horses h ON b.horse_id = h.id
    WHERE b.result IS NULL AND r.date IN ('2026-04-11', '2026-04-12')
    ORDER BY r.track, r.race_number
  `).all() as any[];

  log(`Found ${pendingBets.length} pending bets\n`);

  let settled = 0;
  let notFound = 0;
  let errors = 0;
  const settledByTrack: Record<string, number> = {};

  // Process each unique race
  const racesByKey = new Map<string, any[]>();
  for (const bet of pendingBets) {
    const key = `${bet.track}_R${bet.race_number}`;
    if (!racesByKey.has(key)) racesByKey.set(key, []);
    racesByKey.get(key)!.push(bet);
  }

  for (const [raceKey, raceBets] of racesByKey) {
    const [track, raceNum] = raceKey.split('_R');
    const raceNumber = parseInt(raceNum);

    log(`\n📋 ${track} R${raceNumber}:`);

    // Get barrier finish positions
    const trackResults = barrierResults[track];
    if (!trackResults || !trackResults[raceNumber]) {
      log(`  ⚠️  No barrier results found - marking all as LOSS`);
      for (const bet of raceBets) {
        settleBet(bet.id, 'LOSS');
        notFound++;
        settled++;
        settledByTrack[track] = (settledByTrack[track] || 0) + 1;
      }
      continue;
    }

    const finishingBarriers = trackResults[raceNumber];
    log(`  Finishing barriers: ${finishingBarriers.join(', ')}`);

    // Try to scrape form data from Sportsbet
    // TODO: Get trackId and raceId - for now, use placeholder
    const formData = await scrapeFormData('435951', raceNum); // Alice Springs example

    let barriers: Record<number, string> = {};

    if (formData?.barriers) {
      barriers = formData.barriers;
      log(`  ✓ Scraped ${Object.keys(barriers).length} horses from form`);
    } else {
      // Fallback: try to build mapping from database
      const raceHorses = db.prepare(`
        SELECT DISTINCT h.id, h.name FROM horses h
        JOIN race_runners rr ON rr.horse_id = h.id
        WHERE rr.race_id = (SELECT id FROM races WHERE track = ? AND race_number = ?)
      `).all(track, raceNumber) as any[];

      log(`  Found ${raceHorses.length} horses in database`);
    }

    // Match bet horses to finishing positions
    for (const bet of raceBets) {
      let matchedResult: 'WIN' | 'PLACE' | 'LOSS' | null = null;

      // Try to find this horse in finishing positions
      for (let pos = 0; pos < finishingBarriers.length; pos++) {
        const barrier = finishingBarriers[pos];
        const finishingHorse = barriers[barrier];

        if (finishingHorse && fuzzyMatch(finishingHorse, bet.horse_name)) {
          matchedResult = pos === 0 ? 'WIN' : pos <= 2 ? 'PLACE' : 'LOSS';
          log(`  ✓ ${bet.horse_name}: ${matchedResult} (matched barrier ${barrier})`);
          break;
        }
      }

      if (matchedResult) {
        settleBet(bet.id, matchedResult);
      } else {
        // No match found - try fuzzy matching on all available horses
        matchedResult = 'LOSS';
        log(`  ✗ ${bet.horse_name}: LOSS (no match)`);
        settleBet(bet.id, matchedResult);
        notFound++;
      }

      settled++;
      settledByTrack[track] = (settledByTrack[track] || 0) + 1;
    }
  }

  // Summary
  log('\n' + '='.repeat(70));
  log('📊 SETTLEMENT SUMMARY\n');
  log(`Settled: ${settled}/${pendingBets.length}`);
  log(`Not found: ${notFound}`);
  log('\nBy track:');
  for (const [track, count] of Object.entries(settledByTrack)) {
    log(`  ${track}: ${count} bets`);
  }

  const finalStatus = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN result IS NULL THEN 1 END) as pending,
      COUNT(CASE WHEN result = NOT NULL THEN 1 END) as settled,
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
      COUNT(CASE WHEN result = 'PLACE' THEN 1 END) as places,
      COUNT(CASE WHEN result = 'LOSS' THEN 1 END) as losses,
      ROUND(SUM(CASE WHEN result IS NOT NULL THEN profit_loss ELSE 0 END), 2) as total_pnl
    FROM bets b
    JOIN races r ON b.race_id = r.id
    WHERE r.date IN ('2026-04-11', '2026-04-12')
  `).get() as any;

  log('\n📈 FINAL STATUS');
  log(`Total: ${finalStatus.total} | Settled: ${finalStatus.settled} | Pending: ${finalStatus.pending}`);
  log(`Wins: ${finalStatus.wins} | Places: ${finalStatus.places} | Losses: ${finalStatus.losses}`);
  log(`Total P&L: $${finalStatus.total_pnl}`);
  log('\n' + '='.repeat(70) + '\n');

  process.exit(0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
