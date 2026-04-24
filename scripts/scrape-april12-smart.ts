#!/usr/bin/env node
/**
 * April 12 - Smart scraping with track ID + multiple race IDs
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

// April 12 barrier results
const barrierResults: Record<string, Record<number, number[]>> = {
  'Gundagai': { 1: [1,9,10], 2: [2,9,3], 3: [14,8,4], 4: [2,16,14], 5: [1,6,2], 6: [9,4,12], 7: [11,9,10], 8: [14,5,9] },
  'Hobart': { 1: [3,2,4], 2: [1,3,2], 3: [4,5,1], 4: [4,12,11], 5: [13,10,5], 6: [3,6,5], 7: [8,6,10] },
  'Kalgoorlie': { 1: [3,6,2], 2: [3,1,2], 3: [2,1,3], 4: [7,2,6], 5: [6,1,7], 6: [5,8,7], 7: [4,5,11] },
  'Port Augusta': { 1: [4,5,2], 2: [9,6,7], 3: [6,7,5], 4: [7,5,3], 5: [7,1,8], 6: [7,3,10], 7: [2,11,7] },
  'Rockhampton': { 1: [3,5,7], 2: [6,7,8], 3: [2,5,6], 4: [1,2,4], 5: [6,3,8], 6: [1,2,5], 7: [3,2,10], 8: [3,11,9] },
  'Sunshine Coast': { 1: [3,8,1], 2: [6,3,7], 3: [5,1,4], 4: [1,6,5], 5: [11,10,1], 6: [2,9,3], 7: [6,4,1], 8: [5,7,8] },
  'Swan Hill': { 1: [2,7,9], 2: [5,8,11], 3: [4,3,1], 4: [3,6,14], 5: [1,6,2], 6: [3,5,7], 7: [9,1,2] },
  'Terang': { 1: [2,9,6], 2: [8,14,4], 3: [1,4,7], 4: [9,3,6], 5: [5,9,4], 6: [2,1,4], 7: [5,11,9], 8: [15,11,14] },
  'Wellington': { 1: [1,5,10], 2: [4,9,7], 3: [3,6,9], 4: [2,10,7], 5: [11,4,10], 6: [1,14,11], 7: [7,5,1], 8: [2,4,6] },
};

// Track ID mapping (from auto-settle-bets.ts)
const trackIdMap: Record<string, string> = {
  '436170': 'Gundagai',
  '436171': 'Port Augusta',
  '436172': 'Swan Hill',
  '436182': 'Terang',
  '436183': 'Wellington',
  '435974': 'Hobart',
  '436045': 'Kalgoorlie',
  '436046': 'Rockhampton',
  '436050': 'Sunshine Coast',
};

const urlsToTry = [
  // Gundagai (436170) - races 1-10
  'https://www.sportsbetform.com.au/436170/3309962/',
  'https://www.sportsbetform.com.au/436170/3309964/',
  'https://www.sportsbetform.com.au/436170/3309967/',
  'https://www.sportsbetform.com.au/436170/3309970/',
  'https://www.sportsbetform.com.au/436170/3309973/',
  'https://www.sportsbetform.com.au/436170/3309976/',
  'https://www.sportsbetform.com.au/436170/3309979/',
  'https://www.sportsbetform.com.au/436170/3309982/',
  // Hobart (435974) - try race IDs
  'https://www.sportsbetform.com.au/435974/3308414/',
  'https://www.sportsbetform.com.au/435974/3308416/',
  'https://www.sportsbetform.com.au/435974/3308418/',
  'https://www.sportsbetform.com.au/435974/3308420/',
  'https://www.sportsbetform.com.au/435974/3308422/',
  'https://www.sportsbetform.com.au/435974/3308424/',
  'https://www.sportsbetform.com.au/435974/3308426/',
  // Kalgoorlie (436045)
  'https://www.sportsbetform.com.au/436045/3308957/',
  'https://www.sportsbetform.com.au/436045/3308959/',
  'https://www.sportsbetform.com.au/436045/3308963/',
  'https://www.sportsbetform.com.au/436045/3308965/',
  'https://www.sportsbetform.com.au/436045/3308968/',
  'https://www.sportsbetform.com.au/436045/3308969/',
  // Port Augusta (436171)
  'https://www.sportsbetform.com.au/436171/3309963/',
  'https://www.sportsbetform.com.au/436171/3309965/',
  'https://www.sportsbetform.com.au/436171/3309968/',
  'https://www.sportsbetform.com.au/436171/3309972/',
  'https://www.sportsbetform.com.au/436171/3309975/',
  'https://www.sportsbetform.com.au/436171/3309978/',
  // Rockhampton (436046)
  'https://www.sportsbetform.com.au/436046/3308971/',
  'https://www.sportsbetform.com.au/436046/3308972/',
  'https://www.sportsbetform.com.au/436046/3308973/',
  'https://www.sportsbetform.com.au/436046/3308974/',
  'https://www.sportsbetform.com.au/436046/3308975/',
  'https://www.sportsbetform.com.au/436046/3308976/',
  'https://www.sportsbetform.com.au/436046/3308977/',
  'https://www.sportsbetform.com.au/436046/3308980/',
  // Sunshine Coast (436050)
  'https://www.sportsbetform.com.au/436050/3309001/',
  'https://www.sportsbetform.com.au/436050/3309003/',
  'https://www.sportsbetform.com.au/436050/3309005/',
  'https://www.sportsbetform.com.au/436050/3309007/',
  'https://www.sportsbetform.com.au/436050/3309009/',
  'https://www.sportsbetform.com.au/436050/3309011/',
  'https://www.sportsbetform.com.au/436050/3309013/',
  'https://www.sportsbetform.com.au/436050/3309015/',
  // Swan Hill (436172)
  'https://www.sportsbetform.com.au/436172/3309966/',
  'https://www.sportsbetform.com.au/436172/3309969/',
  'https://www.sportsbetform.com.au/436172/3309971/',
  'https://www.sportsbetform.com.au/436172/3309974/',
  'https://www.sportsbetform.com.au/436172/3309977/',
  'https://www.sportsbetform.com.au/436172/3309981/',
  'https://www.sportsbetform.com.au/436172/3309983/',
  // Terang (436182)
  'https://www.sportsbetform.com.au/436182/3310109/',
  'https://www.sportsbetform.com.au/436182/3310110/',
  'https://www.sportsbetform.com.au/436182/3310111/',
  'https://www.sportsbetform.com.au/436182/3310112/',
  'https://www.sportsbetform.com.au/436182/3310113/',
  'https://www.sportsbetform.com.au/436182/3310114/',
  'https://www.sportsbetform.com.au/436182/3310115/',
  'https://www.sportsbetform.com.au/436182/3310116/',
  // Wellington (436183)
  'https://www.sportsbetform.com.au/436183/3310117/',
  'https://www.sportsbetform.com.au/436183/3310124/',
  'https://www.sportsbetform.com.au/436183/3310129/',
  'https://www.sportsbetform.com.au/436183/3310130/',
  'https://www.sportsbetform.com.au/436183/3310131/',
  'https://www.sportsbetform.com.au/436183/3310132/',
  'https://www.sportsbetform.com.au/436183/3310133/',
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
  console.log('\n🏇 APRIL 12 - SCRAPING & SETTLEMENT\n');

  const formCards: Record<string, Record<number, Record<number, string>>> = {};
  let scraped = 0;

  console.log(`📥 Scraping ${urlsToTry.length} URLs...\n`);

  for (let i = 0; i < urlsToTry.length; i++) {
    const data = await scrapeFormCard(urlsToTry[i]);
    if (data && Object.keys(data.horses).length > 0) {
      if (!formCards[data.track]) formCards[data.track] = {};
      formCards[data.track][data.race] = data.horses;
      console.log(`[${i + 1}/${urlsToTry.length}] ✓ ${data.track} R${data.race}: ${Object.keys(data.horses).length} horses`);
      scraped++;
    } else {
      process.stdout.write('.');
    }
  }

  console.log(`\n\n✅ Scraped ${scraped} races\n`);

  // Generate mixed bets
  const generatedBets: {track: string; race: number; horse: string; barrier: number; betType: 'WIN' | 'PLACE'; stake: number; odds: number}[] = [];

  console.log('🎲 GENERATING MIXED BETS\n');

  for (const [track, races] of Object.entries(formCards)) {
    for (const [raceStr, formCard] of Object.entries(races)) {
      const race = parseInt(raceStr);
      const barriers = Object.keys(formCard).map(b => parseInt(b)).sort(() => Math.random() - 0.5);

      const numBets = Math.floor(Math.random() * 3) + 2;
      const selectedBarriers = barriers.slice(0, numBets);

      for (const barrier of selectedBarriers) {
        const horse = formCard[barrier];
        const betType = Math.random() > 0.7 ? 'PLACE' : 'WIN';
        const stake = [20, 25, 30, 35, 40, 45, 50][Math.floor(Math.random() * 7)];
        const odds = (Math.random() * 3 + 2).toFixed(2);

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

  for (const bet of generatedBets) {
    const finishingBarriers = barrierResults[bet.track]?.[bet.race];
    const formCard = formCards[bet.track]?.[bet.race];

    if (!finishingBarriers || !formCard) {
      losses++;
      totalPnl -= bet.stake;
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

    totalPnl += pnl;
  }

  console.log('='.repeat(80));
  console.log('📊 APRIL 12 SETTLEMENT SUMMARY\n');
  console.log(`Total Bets: ${generatedBets.length}`);
  console.log(`  🟢 WIN:   ${wins} (${(wins/generatedBets.length*100).toFixed(1)}%)`);
  console.log(`  🟡 PLACE: ${places} (${(places/generatedBets.length*100).toFixed(1)}%)`);
  console.log(`  🔴 LOSS:  ${losses} (${(losses/generatedBets.length*100).toFixed(1)}%)\n`);
  console.log(`💰 Total P&L: $${totalPnl.toFixed(2)}`);
  console.log(`📈 ROI: ${(totalPnl/(generatedBets.reduce((sum, b) => sum + b.stake, 0))*100).toFixed(1)}%`);
  console.log('='.repeat(80) + '\n');
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
