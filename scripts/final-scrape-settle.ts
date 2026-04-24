#!/usr/bin/env node
/**
 * Final scrape of all 30 races and settlement
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Barrier results
const barriers: Record<string, Record<number, number[]>> = {
  'Alice Springs': { 1: [4,6,8], 2: [8,7,5], 3: [4,5,3], 4: [4,1,3], 5: [2,5,7], 6: [3,7,1], 7: [4,1,3] },
  'Ascot': { 1: [11,5,4], 2: [3,2,1], 3: [1,8,5], 4: [5,3,4], 5: [5,3,2], 6: [10,4,1], 7: [1,6,9], 8: [5,3,2], 9: [2,6,8], 10: [5,2,7] },
  'Ballina': { 1: [10,7,6], 2: [13,7,2], 3: [9,3,8], 4: [4,8,5], 5: [2,4,7], 6: [4,12,5] },
  'Bowen': { 1: [5,1,3], 2: [1,2,5], 3: [5,2,8], 4: [7,3,5], 5: [9,3,5] },
  'Caulfield': { 1: [2,13,7], 2: [12,10,13] },
  'Geraldton': { 1: [6,7,8] },
};

// All 30 URLs
const urls = [
  'https://www.sportsbetform.com.au/435951/3308201/',
  'https://www.sportsbetform.com.au/435951/3308203/',
  'https://www.sportsbetform.com.au/435951/3308206/',
  'https://www.sportsbetform.com.au/435951/3308207/',
  'https://www.sportsbetform.com.au/435951/3308208/',
  'https://www.sportsbetform.com.au/435951/3308209/',
  'https://www.sportsbetform.com.au/435951/3308210/',
  'https://www.sportsbetform.com.au/436088/3309360/',
  'https://www.sportsbetform.com.au/436088/3309361/',
  'https://www.sportsbetform.com.au/436088/3309363/',
  'https://www.sportsbetform.com.au/436088/3309364/',
  'https://www.sportsbetform.com.au/436088/3309367/',
  'https://www.sportsbetform.com.au/436088/3309372/',
  'https://www.sportsbetform.com.au/436088/3309375/',
  'https://www.sportsbetform.com.au/436088/3309378/',
  'https://www.sportsbetform.com.au/436088/3309381/',
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

async function scrapeForm(url: string) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    const data = await page.evaluate(() => {
      const title = document.title;
      const match = title.match(/([A-Za-z\s]+?)\s+Race\s+(\d+)/i);
      if (!match) return null;

      const horses: Record<number, string> = {};
      const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 25);

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const b = (cells[0]?.textContent || '').trim();
          const n = (cells[1]?.textContent || '').trim();

          if (b.match(/^\d{1,2}$/) && n.length > 2 && n.length < 50 && n.match(/^[A-Za-z]/)) {
            const ln = n.toLowerCase();
            if (!ln.includes('foaled') && !ln.includes('sire') && !ln.includes('dam') && !ln.includes('barrier')) {
              horses[parseInt(b)] = n;
            }
          }
        }
      });

      return { track: match[1].trim(), race: parseInt(match[2]), horses };
    });

    await browser.close();
    return data;
  } catch (e) {
    await browser.close();
    return null;
  }
}

function fuzzyMatch(a: string, b: string): boolean {
  const aN = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const bN = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (aN === bN || aN.includes(bN) || bN.includes(aN)) return true;

  const m: number[][] = [];
  for (let i = 0; i <= bN.length; i++) m[i] = [i];
  for (let j = 0; j <= aN.length; j++) m[0][j] = j;
  for (let i = 1; i <= bN.length; i++) {
    for (let j = 1; j <= aN.length; j++) {
      const c = aN[j - 1] === bN[i - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i][j - 1] + 1, m[i - 1][j] + 1, m[i - 1][j - 1] + c);
    }
  }
  const d = m[bN.length][aN.length];
  return 1 - (d / Math.max(aN.length, bN.length)) >= 0.85;
}

async function main() {
  console.log('\n🏇 SCRAPING ALL 30 RACES & SETTLING BETS\n');

  const formCards: Record<string, Record<number, Record<number, string>>> = {};
  let scraped = 0;

  for (let i = 0; i < urls.length; i++) {
    const data = await scrapeForm(urls[i]);
    if (data && Object.keys(data.horses).length > 0) {
      if (!formCards[data.track]) formCards[data.track] = {};
      formCards[data.track][data.race] = data.horses;
      console.log(`[${i + 1}/${urls.length}] ✓ ${data.track} R${data.race}: ${Object.keys(data.horses).length} horses`);
      scraped++;
    } else {
      console.log(`[${i + 1}/${urls.length}] ✗ Failed`);
    }
  }

  console.log(`\n✅ Scraped ${scraped} races\n`);

  // Reset and settle
  db.prepare(`UPDATE bets SET result = NULL, profit_loss = NULL, status = 'ACTIVE', settled_at = NULL`).run();

  const bets = db.prepare(`
    SELECT b.id, r.track, r.race_number, h.name, b.stake, b.closing_odds, b.opening_odds
    FROM bets b
    JOIN races r ON b.race_id = r.id
    JOIN horses h ON b.horse_id = h.id
    ORDER BY r.track, r.race_number
  `).all() as any[];

  let wins = 0, places = 0, losses = 0;

  for (const bet of bets) {
    const finishingBarriers = barriers[bet.track]?.[bet.race_number];
    const formCard = formCards[bet.track]?.[bet.race_number];

    if (!finishingBarriers || !formCard) {
      db.prepare(`UPDATE bets SET result = 'LOSS', profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(-bet.stake, bet.id);
      losses++;
      continue;
    }

    let result: 'WIN' | 'PLACE' | 'LOSS' = 'LOSS';

    for (let pos = 0; pos < finishingBarriers.length; pos++) {
      const finishingHorse = formCard[finishingBarriers[pos]];
      if (finishingHorse && fuzzyMatch(finishingHorse, bet.name)) {
        result = pos === 0 ? 'WIN' : pos <= 2 ? 'PLACE' : 'LOSS';
        break;
      }
    }

    const odds = bet.closing_odds || bet.opening_odds || 0;
    let pnl = 0;
    if (result === 'WIN') pnl = bet.stake * (odds - 1);
    else if (result === 'PLACE') pnl = bet.stake * ((odds - 1) / 4);
    else pnl = -bet.stake;

    db.prepare(`UPDATE bets SET result = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(result, Math.round(pnl * 100) / 100, bet.id);

    if (result === 'WIN') wins++;
    else if (result === 'PLACE') places++;
    else losses++;
  }

  const summary = db.prepare(`
    SELECT
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
      COUNT(CASE WHEN result = 'PLACE' THEN 1 END) as places,
      COUNT(CASE WHEN result = 'LOSS' THEN 1 END) as losses,
      ROUND(SUM(profit_loss), 2) as pnl
    FROM bets WHERE result IS NOT NULL
  `).get() as any;

  console.log('='.repeat(70));
  console.log('\n📊 FINAL SETTLEMENT RESULTS\n');
  console.log(`Total Bets Settled: ${bets.length}`);
  console.log(`  🟢 WIN:   ${summary.wins}`);
  console.log(`  🟡 PLACE: ${summary.places}`);
  console.log(`  🔴 LOSS:  ${summary.losses}\n`);
  console.log(`💰 Total P&L: $${summary.pnl}\n`);
  console.log('='.repeat(70) + '\n');
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
