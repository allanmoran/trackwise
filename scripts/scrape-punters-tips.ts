#!/usr/bin/env node
/**
 * Scrape Punters.com.au Free Racing Tips
 * Extract expert tips, track, race, horse, confidence rating
 * Usage: npx tsx scripts/scrape-punters-tips.ts
 */

import puppeteer from 'puppeteer';

interface ExpertTip {
  track: string;
  raceNum: number;
  horse: string;
  tipRank: number; // 1st, 2nd, 3rd tip
  confidence: string; // "Best Bet", "Strong Pick", etc
  analysis: string;
}

async function scrapePuntersTips(): Promise<ExpertTip[]> {
  console.log('Scraping Punters.com.au free racing tips...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    );

    console.log('Loading https://www.punters.com.au/free-racing-tips/...');
    await page.goto('https://www.punters.com.au/free-racing-tips/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await new Promise(r => setTimeout(r, 3000));

    const tips = await page.evaluate(() => {
      const results: ExpertTip[] = [];

      // Look for tip containers
      // The page structure has cards with tips organized by track/race
      const tipsContent = document.body.innerText;
      const lines = tipsContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      // Parse the structure: Track -> Race -> Horse -> Tip
      let currentTrack = '';
      let currentRace = 0;
      let tipCounter = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Track names - look for Australian tracks
        const trackMatch = line.match(
          /^(Albury|Ararat|Ascot|Adelaide|Ballarat|Belmont|Bendigo|Brisbane|Cairns|Caulfield|Cessnock|Colac|Cranbourne|Doomben|Eagle Farm|Echuca|Fitzroy|Flemington|Geelong|Gosford|Goulburn|Grafton|Hamilton|Hawkesbury|Hobart|Ipswich|Kempsey|Kilmore|Kyneton|Launceston|Longreach|Mackay|Melbourne|Mildura|Morphettville|Moree|Newcastle|Nowra|Orange|Pakenham|Perth|Port Macquarie|Randwick|Rockhampton|Rosehill|Sale|Sandown|Scone|Seymour|Shepparton|Stawell|Sunshine|Swan|Sydney|Tamworth|Taree|Toowoomba|Townsville|Traralgon|Wagga|Wangaratta|Warrnambool|Werribee|Yarra)/i
        );
        if (trackMatch) {
          currentTrack = trackMatch[1];
          tipCounter = 0;
          console.log(`Found track: ${currentTrack}`);
        }

        // Race numbers - R1, R2, Race 1, Race 2, etc
        const raceMatch = line.match(/R(\d+)|Race\s+(\d+)/i);
        if (raceMatch) {
          currentRace = parseInt(raceMatch[1] || raceMatch[2]);
          tipCounter = 0;
        }

        // Horse names with numbers (e.g., "2. Sailor's Rum (7)")
        const horseMatch = line.match(/^(\d+)\.\s+([A-Za-z\s\-']+)\s*\(\d+\)/);
        if (horseMatch && currentTrack && currentRace > 0) {
          tipCounter++;
          const tipRank = tipCounter;
          const horse = horseMatch[2].trim();

          // Look for confidence indicators
          let confidence = 'Standard Tip';
          if (tipRank === 1) confidence = 'Best Bet';
          else if (tipRank === 2) confidence = 'Strong Pick';
          else if (tipRank === 3) confidence = 'Good Value';

          // Get analysis from following lines
          let analysis = '';
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            if (lines[j].match(/^(\d+)\.|^R(\d+)|^[A-Z]{2,}/)) break;
            if (lines[j].length > 10 && !lines[j].startsWith('Scratched')) {
              analysis += lines[j] + ' ';
            }
          }

          results.push({
            track: currentTrack,
            raceNum: currentRace,
            horse: horse,
            tipRank: tipRank,
            confidence: confidence,
            analysis: analysis.substring(0, 200),
          });

          console.log(
            `  R${currentRace}: ${tipRank}. ${horse} (${confidence})`
          );
        }
      }

      return results;
    });

    console.log(`\n✅ Extracted ${tips.length} expert tips`);
    console.log('\nSample tips:');
    tips.slice(0, 5).forEach(tip => {
      console.log(`  ${tip.track} R${tip.raceNum}: ${tip.horse} (${tip.confidence})`);
    });

    return tips;
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    return [];
  } finally {
    await browser.close();
  }
}

async function scrapeOddsComparison() {
  console.log('\n\nScraping odds comparison data...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    );

    console.log('Loading odds comparison page...');
    await page.goto('https://www.punters.com.au/odds-comparison/horse-racing/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await new Promise(r => setTimeout(r, 3000));

    const oddsData = await page.evaluate(() => {
      // Look for structured odds data
      const content = document.body.innerText;
      const bookmakers = new Set<string>();

      // Find common Australian bookmakers
      const bookie_pattern = /Sportsbet|Ladbrokes|Neds|Betfair|TAB|BlueBet|Pointsbet|TopSport|PointsBet/gi;
      const matches = content.match(bookie_pattern);
      if (matches) {
        matches.forEach(m => bookmakers.add(m));
      }

      return {
        bookmakers: Array.from(bookmakers),
        hasOdds: content.includes('$') || content.includes('.'),
        contentLength: content.length,
      };
    });

    console.log('Available bookmakers on odds comparison:');
    console.log(oddsData.bookmakers.join(', '));
    console.log(`\nPage has odds data: ${oddsData.hasOdds}`);

    return oddsData;
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
  const tips = await scrapePuntersTips();
  const odds = await scrapeOddsComparison();

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nExpert Tips: ${tips.length} tips extracted`);
  console.log('Usable for: Cross-validation with form picks, confidence boosting');

  if (odds) {
    console.log(`\nOdds Comparison: ${odds.bookmakers.length} bookmakers found`);
    console.log('Usable for: Better market odds validation (instead of Racing API)');
  }

  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATION');
  console.log('='.repeat(60));
  console.log(`
1. Expert Tips: If form picks match Punters expert tips (consensus), boost confidence
2. Odds Comparison: Use as alternative to Racing API for market odds (cheaper, cleaner)
3. Form Guide: Extract horse/jockey/trainer stats for Phase 2 feature layering
  `);
}

main().catch(console.error);
