#!/usr/bin/env node
/**
 * Scrape form cards and generate mixed bets with realistic settlement
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

// April 11 barrier results (from user data)
const barrierResults: Record<string, Record<number, number[]>> = {
  'Alice Springs': { 1: [4,6,8], 2: [8,7,5], 3: [4,5,3], 4: [4,1,3], 5: [2,5,7], 6: [3,7,1], 7: [4,1,3] },
  'Ascot': { 1: [11,5,4], 2: [3,2,1], 3: [1,8,5], 4: [5,3,4], 5: [5,3,2], 6: [10,4,1], 7: [1,6,9], 8: [5,3,2], 9: [2,6,8], 10: [5,2,7] },
  'Bowen': { 1: [5,1,3], 2: [1,2,5], 3: [5,2,8], 4: [7,3,5], 5: [9,3,5] },
  'Caulfield': { 1: [2,13,7], 2: [12,10,13], 3: [6,4,1], 4: [10,1,3], 5: [13,1,5], 6: [5,8,2], 7: [1,6,4], 8: [8,12,14], 9: [6,11,1], 10: [10,9,14] },
  'Doomben': { 1: [9,7,1], 2: [4,6,8], 3: [7,1,8], 4: [3,9,2], 5: [3,1,5], 6: [18,8,2], 7: [2,7,3], 8: [1,2,6] },
  'Goulburn': { 1: [6,7,3], 2: [8,9,6], 3: [2,10,6], 4: [12,2,6], 5: [11,4,2], 6: [14,4,11] },
  'Kilcoy': { 1: [2,7,13], 2: [5,7,10], 3: [7,5,12], 4: [9,4,5], 5: [4,1,12], 6: [7,3,11], 7: [10,7,8] },
  'Morphettville': { 1: [4,9,2], 2: [7,2,11], 3: [14,11,15], 4: [8,1,2], 5: [5,2,6], 6: [1,14,3], 7: [5,1,8], 8: [8,2,9], 9: [6,4,9], 10: [8,1,15] },
  'Narrogin': { 1: [5,1,3], 2: [5,1,5], 3: [5,4,1], 4: [3,9,1], 5: [8,6,2], 6: [5,4,6], 7: [2,4,6], 8: [3,8,6] },
  'Newcastle': { 1: [2,6,3], 2: [1,14,9], 3: [9,10,12], 4: [7,6,3], 5: [4,8,7], 6: [4,9,15], 7: [15,3,5], 8: [1,6,4] },
  'Randwick': { 1: [3,6,4], 2: [1,8,4], 3: [6,1,5], 4: [1,9,5], 5: [1,3,2], 6: [9,2,3], 7: [3,4,15], 8: [8,2,3], 9: [2,4,7], 10: [5,2,3] },
  'Toowoomba': { 1: [7,3,1], 2: [1,2,3], 3: [4,6,5], 4: [1,5,10], 5: [1,4,3], 6: [3,6,5], 7: [5,1,7] },
  'Werribee': { 1: [1,7,10], 2: [4,8,2], 3: [11,7,9], 4: [1,5,7], 5: [8,10,2], 6: [3,8,4], 7: [6,9,4] },
};

const urlsToScrape = [
  'https://www.sportsbetform.com.au/435951/3308201/',  // Alice Springs R1
  'https://www.sportsbetform.com.au/435951/3308203/',  // Alice Springs R2
  'https://www.sportsbetform.com.au/435951/3308206/',  // Alice Springs R3
  'https://www.sportsbetform.com.au/435951/3308207/',  // Alice Springs R4
  'https://www.sportsbetform.com.au/435951/3308208/',  // Alice Springs R5
  'https://www.sportsbetform.com.au/435951/3308209/',  // Alice Springs R6
  'https://www.sportsbetform.com.au/435951/3308210/',  // Alice Springs R7
  'https://www.sportsbetform.com.au/435964/3308323/',  // Ballina R1
  'https://www.sportsbetform.com.au/436054/3309020/',  // Bowen R1
  'https://www.sportsbetform.com.au/435974/3308409/',  // Caulfield R1
  'https://www.sportsbetform.com.au/435974/3308412/',  // Caulfield R2
  'https://www.sportsbetform.com.au/435639/3305862/',  // Geraldton R1
];

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
  console.log('\n🏇 SCRAPING FORM CARDS & GENERATING MIXED BETS\n');

  const formCards: Record<string, Record<number, Record<number, string>>> = {};
  let scraped = 0;

  console.log(`📥 Scraping ${urlsToScrape.length} form URLs...\n`);

  for (let i = 0; i < urlsToScrape.length; i++) {
    const data = await scrapeFormCard(urlsToScrape[i]);
    if (data && Object.keys(data.horses).length > 0) {
      if (!formCards[data.track]) formCards[data.track] = {};
      formCards[data.track][data.race] = data.horses;
      console.log(`[${i + 1}/${urlsToScrape.length}] ✓ ${data.track} R${data.race}: ${Object.keys(data.horses).length} horses`);
      scraped++;
    } else {
      console.log(`[${i + 1}/${urlsToScrape.length}] ✗ Failed to scrape`);
    }
  }

  console.log(`\n✅ Scraped ${scraped} races\n`);

  // Generate mixed bets from form cards
  const generatedBets: {track: string; race: number; horse: string; barrier: number; betType: 'WIN' | 'PLACE'; stake: number; odds: number}[] = [];

  console.log('🎲 GENERATING MIXED BETS\n');

  for (const [track, races] of Object.entries(formCards)) {
    for (const [raceStr, formCard] of Object.entries(races)) {
      const race = parseInt(raceStr);
      const barriers = Object.keys(formCard).map(b => parseInt(b)).sort(() => Math.random() - 0.5);

      // Select 2-4 random horses per race
      const numBets = Math.floor(Math.random() * 3) + 2; // 2-4
      const selectedBarriers = barriers.slice(0, numBets);

      for (const barrier of selectedBarriers) {
        const horse = formCard[barrier];
        const betType = Math.random() > 0.7 ? 'PLACE' : 'WIN'; // 70% WIN, 30% PLACE
        const stake = [20, 25, 30, 35, 40, 45, 50][Math.floor(Math.random() * 7)];
        const odds = (Math.random() * 3 + 2).toFixed(2); // 2.0 - 5.0

        generatedBets.push({
          track,
          race,
          horse,
          barrier,
          betType,
          stake,
          odds: parseFloat(odds),
        });

        console.log(`  ${track} R${race}: ${horse} (B${barrier}) → ${betType} @ ${odds} × $${stake}`);
      }
    }
  }

  console.log(`\n✅ Generated ${generatedBets.length} bets\n`);

  // Settle bets
  console.log('⚡ SETTLING BETS\n');

  let wins = 0, places = 0, losses = 0;
  let totalPnl = 0;
  const settlementResults: {horse: string; track: string; race: number; betType: string; result: string; pnl: number}[] = [];

  for (const bet of generatedBets) {
    const finishingBarriers = barrierResults[bet.track]?.[bet.race];
    const formCard = formCards[bet.track]?.[bet.race];

    if (!finishingBarriers || !formCard) {
      losses++;
      const pnl = -bet.stake;
      totalPnl += pnl;
      settlementResults.push({horse: bet.horse, track: bet.track, race: bet.race, betType: bet.betType, result: 'LOSS', pnl});
      continue;
    }

    let result: 'WIN' | 'PLACE' | 'LOSS' = 'LOSS';

    for (let pos = 0; pos < finishingBarriers.length; pos++) {
      const finishingHorse = formCard[finishingBarriers[pos]];
      if (finishingHorse && fuzzyMatch(finishingHorse, bet.horse)) {
        result = pos === 0 ? 'WIN' : pos <= 2 ? 'PLACE' : 'LOSS';
        break;
      }
    }

    let pnl = 0;
    if (result === 'WIN') {
      pnl = bet.stake * (bet.odds - 1);
      wins++;
    } else if (result === 'PLACE') {
      pnl = bet.stake * ((bet.odds - 1) / 4);
      places++;
    } else {
      pnl = -bet.stake;
      losses++;
    }

    pnl = Math.round(pnl * 100) / 100;
    totalPnl += pnl;

    settlementResults.push({
      horse: bet.horse,
      track: bet.track,
      race: bet.race,
      betType: bet.betType,
      result,
      pnl,
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 SETTLEMENT SUMMARY\n');
  console.log(`Total Bets: ${generatedBets.length}`);
  console.log(`  🟢 WIN:   ${wins} (${(wins/generatedBets.length*100).toFixed(1)}%)`);
  console.log(`  🟡 PLACE: ${places} (${(places/generatedBets.length*100).toFixed(1)}%)`);
  console.log(`  🔴 LOSS:  ${losses} (${(losses/generatedBets.length*100).toFixed(1)}%)\n`);
  console.log(`💰 Total P&L: $${totalPnl.toFixed(2)}`);
  console.log(`📈 ROI: ${(totalPnl/(generatedBets.reduce((sum, b) => sum + b.stake, 0))*100).toFixed(1)}%`);
  console.log('='.repeat(80) + '\n');

  // Show detailed results
  console.log('📋 DETAILED RESULTS\n');
  for (const result of settlementResults) {
    const sign = result.pnl > 0 ? '+' : '';
    console.log(`${result.track} R${result.race}: ${result.horse} (${result.betType}) → ${result.result} ${sign}$${result.pnl}`);
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
