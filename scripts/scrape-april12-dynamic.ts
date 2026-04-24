#!/usr/bin/env node
/**
 * Dynamically discover and scrape April 12 races from Sportsbet
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

const targetTracks = new Set(Object.keys(barrierResults));

async function findApril12Races(): Promise<{track: string; race: number; url: string}[]> {
  console.log('\n🔍 Finding April 12 races from Sportsbet...\n');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.sportsbetform.com.au/2026-04-12/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const races = await page.evaluate(() => {
      const results: any[] = [];
      const allLinks = Array.from(document.querySelectorAll('a'));

      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link as HTMLAnchorElement).textContent?.trim() || '';

        // Look for race links (format: Track Race N or similar)
        const raceMatch = text.match(/^([A-Z][A-Za-z\s]+?)\s+(?:Race\s+)?(\d+)$/);
        if (raceMatch && href.match(/sportsbetform\.com\.au\/\d+\/\d+/)) {
          results.push({
            track: raceMatch[1].trim(),
            race: parseInt(raceMatch[2]),
            url: href,
          });
        }
      }

      return results;
    });

    await browser.close();

    // Filter for target tracks
    const filtered = races.filter(r => targetTracks.has(r.track));

    console.log(`Found ${races.length} total races, ${filtered.length} matching target tracks`);

    return filtered;
  } catch (err) {
    console.error(`Error finding races: ${err}`);
    try {
      await browser.close();
    } catch {}
    return [];
  }
}

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
  console.log('\n🏇 APRIL 12 - DYNAMIC SCRAPING & SETTLEMENT\n');

  // Find races
  const races = await findApril12Races();

  if (races.length === 0) {
    console.log('❌ No races found for April 12 target tracks');
    process.exit(1);
  }

  console.log(`\n📍 Found ${races.length} races to scrape:\n`);
  races.forEach(r => console.log(`  ${r.track} R${r.race}`));

  // Scrape form cards
  const formCards: Record<string, Record<number, Record<number, string>>> = {};
  let scraped = 0;

  console.log(`\n📥 Scraping ${races.length} form cards...\n`);

  for (let i = 0; i < races.length; i++) {
    const data = await scrapeFormCard(races[i].url);
    if (data && Object.keys(data.horses).length > 0) {
      if (!formCards[data.track]) formCards[data.track] = {};
      formCards[data.track][data.race] = data.horses;
      console.log(`[${i + 1}/${races.length}] ✓ ${data.track} R${data.race}: ${Object.keys(data.horses).length} horses`);
      scraped++;
    } else {
      console.log(`[${i + 1}/${races.length}] ✗ Failed`);
    }
  }

  console.log(`\n✅ Scraped ${scraped} races\n`);

  // Generate mixed bets
  const generatedBets: {track: string; race: number; horse: string; barrier: number; betType: 'WIN' | 'PLACE'; stake: number; odds: number}[] = [];

  console.log('🎲 GENERATING MIXED BETS\n');

  for (const [track, races] of Object.entries(formCards)) {
    for (const [raceStr, formCard] of Object.entries(races)) {
      const race = parseInt(raceStr);
      const barriers = Object.keys(formCard).map(b => parseInt(b)).sort(() => Math.random() - 0.5);

      // Select 2-4 random horses per race
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
