#!/usr/bin/env node
/**
 * Scrape all Sportsbet URLs and settle bets with complete form cards
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

// Barrier results from racenet
const barrierResults: Record<string, Record<number, number[]>> = {
  'Alice Springs': { 1: [4,6,8], 2: [8,7,5], 3: [4,5,3], 4: [4,1,3], 5: [2,5,7], 6: [3,7,1], 7: [4,1,3] },
  'Ascot': { 1: [11,5,4], 2: [3,2,1], 3: [1,8,5], 4: [5,3,4], 5: [5,3,2], 6: [10,4,1], 7: [1,6,9], 8: [5,3,2], 9: [2,6,8], 10: [5,2,7] },
  'Ballina': { 1: [10,7,6], 2: [13,7,2], 3: [9,3,8], 4: [4,8,5], 5: [2,4,7], 6: [4,12,5] },
  'Bowen': { 1: [5,1,3], 2: [1,2,5], 3: [5,2,8], 4: [7,3,5], 5: [9,3,5] },
  'Caulfield': { 1: [2,13,7], 2: [12,10,13], 3: [6,4,1], 4: [10,1,3], 5: [13,1,5], 6: [5,8,2], 7: [1,6,4], 8: [8,12,14], 9: [6,11,1], 10: [10,9,14] },
  'Geraldton': { 1: [6,7,8] },
};

// Track ID mapping
const trackMap: Record<string, string> = {
  '435951': 'Alice Springs',
  '435964': 'Ballina',
  '436054': 'Bowen',
  '435974': 'Caulfield',
  '435639': 'Geraldton',
  '435950': 'Ascot',
  '435617': 'Ascot',
};

async function scrapeFormCard(url: string): Promise<{track: string; race: number; horses: Record<number, string>} | null> {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    const data = await page.evaluate(() => {
      const pageTitle = document.title;
      const trackMatch = pageTitle.match(/([A-Za-z\s]+?)\s+Race\s+(\d+)/i);

      if (!trackMatch) return null;

      const horses: Record<number, string> = {};
      const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 25);

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const barrierText = cells[0]?.textContent?.trim() || '';
          const nameText = cells[1]?.textContent?.trim() || '';

          if (barrierText.match(/^\d{1,2}$/) && nameText.length > 2 && nameText.length < 50) {
            const lowerName = nameText.toLowerCase();
            const isNotHeader = !(
              lowerName.includes('foaled') || lowerName.includes('sire') ||
              lowerName.includes('dam') || lowerName.includes('breeder') ||
              lowerName.includes('trainer') || lowerName.includes('jockey') ||
              lowerName.includes('colours') || lowerName.includes('barrier')
            );

            if (isNotHeader && nameText.match(/^[A-Za-z]/)) {
              horses[parseInt(barrierText)] = nameText;
            }
          }
        }
      });

      return {
        track: trackMatch[1].trim(),
        race: parseInt(trackMatch[2]),
        horses,
      };
    });

    await browser.close();
    return data;
  } catch (err) {
    try {
      await browser.close();
    } catch {}
    return null;
  }
}

function fuzzyMatch(a: string, b: string, threshold: number = 0.85): boolean {
  const aNorm = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const bNorm = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  if (aNorm === bNorm) return true;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;

  const matrix: number[][] = [];
  for (let i = 0; i <= bNorm.length; i++) matrix[i] = [i];
  for (let j = 0; j <= aNorm.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= bNorm.length; i++) {
    for (let j = 1; j <= aNorm.length; j++) {
      const cost = aNorm[j - 1] === bNorm[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  const distance = matrix[bNorm.length][aNorm.length];
  const similarity = 1 - (distance / Math.max(aNorm.length, bNorm.length));
  return similarity >= threshold;
}

async function main() {
  console.log('\n🏇 SCRAPING SPORTSBET URLs & SETTLING BETS\n');

  // URLs to scrape (filtered for bet tracks)
  const urls = [
    'https://www.sportsbetform.com.au/435951/3308201/',
    'https://www.sportsbetform.com.au/435951/3308203/',
    'https://www.sportsbetform.com.au/435951/3308206/',
    'https://www.sportsbetform.com.au/435951/3308207/',
    'https://www.sportsbetform.com.au/435951/3308208/',
    'https://www.sportsbetform.com.au/435951/3308209/',
    'https://www.sportsbetform.com.au/435951/3308210/',
    'https://www.sportsbetform.com.au/435964/3308323/',
    'https://www.sportsbetform.com.au/435964/3308326/',
    'https://www.sportsbetform.com.au/435964/3308329/',
    'https://www.sportsbetform.com.au/435964/3308333/',
    'https://www.sportsbetform.com.au/435964/3308337/',
    'https://www.sportsbetform.com.au/435964/3308341/',
    'https://www.sportsbetform.com.au/436054/3309020/',
    'https://www.sportsbetform.com.au/436054/3309021/',
    'https://www.sportsbetform.com.au/436054/3309022/',
    'https://www.sportsbetform.com.au/436054/3309023/',
    'https://www.sportsbetform.com.au/436054/3309024/',
    'https://www.sportsbetform.com.au/435974/3308409/',
    'https://www.sportsbetform.com.au/435974/3308412/',
    'https://www.sportsbetform.com.au/435639/3305862/',
  ];

  const formCards: Record<string, Record<number, Record<number, string>>> = {};
  let scraped = 0;

  console.log(`📥 Scraping ${urls.length} form URLs...\n`);

  for (const url of urls) {
    const data = await scrapeFormCard(url);
    if (data && Object.keys(data.horses).length > 0) {
      if (!formCards[data.track]) formCards[data.track] = {};
      formCards[data.track][data.race] = data.horses;
      console.log(`✓ ${data.track} R${data.race}: ${Object.keys(data.horses).length} horses`);
      scraped++;
    }
  }

  console.log(`\n✅ Scraped ${scraped} races\n`);

  // Reset bets
  db.prepare(`UPDATE bets SET result = NULL, profit_loss = NULL, status = 'ACTIVE', settled_at = NULL`).run();

  // Get pending bets
  const pendingBets = db.prepare(`
    SELECT b.id, r.track, r.race_number, h.name as horse_name, b.bet_type, b.stake, b.closing_odds, b.opening_odds
    FROM bets b
    JOIN races r ON b.race_id = r.id
    JOIN horses h ON b.horse_id = h.id
    WHERE b.result IS NULL
    ORDER BY r.track, r.race_number
  `).all() as any[];

  console.log(`🏇 Settling ${pendingBets.length} bets\n`);

  let settled = 0;
  let wins = 0, places = 0, losses = 0;
  const raceMap = new Map<string, any[]>();

  for (const bet of pendingBets) {
    const key = `${bet.track}_R${bet.race_number}`;
    if (!raceMap.has(key)) raceMap.set(key, []);
    raceMap.get(key)!.push(bet);
  }

  for (const [raceKey, raceBets] of raceMap) {
    const [track, raceNum] = raceKey.split('_R');
    const raceNumber = parseInt(raceNum);

    const finishingBarriers = barrierResults[track]?.[raceNumber];
    const raceForm = formCards[track]?.[raceNumber];

    if (!finishingBarriers || !raceForm) {
      for (const bet of raceBets) {
        db.prepare(`UPDATE bets SET result = 'LOSS', profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(-bet.stake, bet.id);
        losses++;
        settled++;
      }
      continue;
    }

    console.log(`${track} R${raceNumber}: Barriers [${finishingBarriers.join(',')}]`);

    for (const bet of raceBets) {
      let result: 'WIN' | 'PLACE' | 'LOSS' = 'LOSS';

      for (let pos = 0; pos < finishingBarriers.length; pos++) {
        const finishingHorse = raceForm[finishingBarriers[pos]];
        if (finishingHorse && fuzzyMatch(finishingHorse, bet.horse_name)) {
          result = pos === 0 ? 'WIN' : pos <= 2 ? 'PLACE' : 'LOSS';
          console.log(`  ${bet.horse_name}: ${result}`);
          break;
        }
      }

      const odds = bet.closing_odds || bet.opening_odds || 0;
      let profitLoss = 0;
      if (result === 'WIN') profitLoss = bet.stake * (odds - 1);
      else if (result === 'PLACE') profitLoss = bet.stake * ((odds - 1) / 4);
      else profitLoss = -bet.stake;

      db.prepare(`UPDATE bets SET result = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(result, Math.round(profitLoss * 100) / 100, bet.id);

      if (result === 'WIN') wins++;
      else if (result === 'PLACE') places++;
      else losses++;

      settled++;
    }
  }

  const finalStatus = db.prepare(`
    SELECT COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
           COUNT(CASE WHEN result = 'PLACE' THEN 1 END) as places,
           COUNT(CASE WHEN result = 'LOSS' THEN 1 END) as losses,
           ROUND(SUM(profit_loss), 2) as total_pnl
    FROM bets WHERE result IS NOT NULL
  `).get() as any;

  console.log(`\n${'='.repeat(70)}`);
  console.log('📊 FINAL SETTLEMENT\n');
  console.log(`WIN: ${finalStatus.wins} | PLACE: ${finalStatus.places} | LOSS: ${finalStatus.losses}`);
  console.log(`Total P&L: $${finalStatus.total_pnl}`);
  console.log('='.repeat(70) + '\n');

  process.exit(0);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
