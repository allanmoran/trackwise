#!/usr/bin/env node
/**
 * Scrape Punters.com.au Odds Comparison
 * Extracts odds from multiple bookmakers (Sportsbet, Ladbrokes, TAB, etc)
 * More reliable than individual bookie scraping
 */

import puppeteer from 'puppeteer';

interface OddsData {
  horse: string;
  track: string;
  raceNum: number;
  bookmakers: {
    [bookie: string]: number; // odds
  };
  best: number; // best odds across all bookies
  average: number;
}

async function scrapePuntersOdds(): Promise<OddsData[]> {
  console.log('Scraping Punters.com.au odds comparison...\n');

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
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await new Promise(r => setTimeout(r, 3000));

    const oddsData = await page.evaluate(() => {
      const results: OddsData[] = [];

      // Strategy: Parse the page structure to find race containers and odds tables
      const pageText = document.body.innerText;
      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);

      // Look for "Next to Jump" or race identifiers
      let currentTrack = '';
      let currentRace = 0;

      const raceContainers = document.querySelectorAll(
        '[class*="race"], [class*="event"], [class*="market"]'
      );

      console.log(`Found ${raceContainers.length} potential race containers`);

      // Try a different approach: extract from visible text
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Track detection
        if (
          /^(Albury|Ararat|Ascot|Adelaide|Ballarat|Belmont|Bendigo|Brisbane|Cairns|Caulfield|Cessnock|Doomben|Eagle Farm|Flemington|Geelong|Gosford|Goulburn|Grafton|Hamilton|Hawkesbury|Hobart|Ipswich|Kyneton|Launceston|Longreach|Mackay|Melbourne|Mildura|Morphettville|Newcastle|Nowra|Orange|Perth|Port Macquarie|Randwick|Rockhampton|Rosehill|Sale|Sandown|Scone|Shepparton|Stawell|Sydney|Tamworth|Taree|Toowoomba|Townsville|Warrnambool|Werribee)/i.test(
            line
          )
        ) {
          currentTrack = line;
        }

        // Race number
        const raceMatch = line.match(/R(\d+)|Race\s+(\d+)/i);
        if (raceMatch) {
          currentRace = parseInt(raceMatch[1] || raceMatch[2]);
        }

        // Bookmaker odds - look for patterns like "Sportsbet 2.50" or "Ladbrokes 2.60"
        const bookieOdds = line.match(
          /(Sportsbet|Ladbrokes|TAB|Neds|BlueBet|Betfair|PointsBet|Unibet|TopSport|Crownbet)\s+([\d.]+)/i
        );
        if (bookieOdds && currentTrack && currentRace > 0) {
          const bookie = bookieOdds[1];
          const odds = parseFloat(bookieOdds[2]);

          // Look backwards for horse name
          let horse = '';
          for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
            const prevLine = lines[j];
            // Horse name is usually a capitalized name
            if (
              /^[A-Z][a-z\-']+(?:\s+[A-Z][a-z\-']+)*$/.test(prevLine) &&
              !prevLine.match(/^(Sportsbet|Ladbrokes|TAB|Neds|Best|Average)/)
            ) {
              horse = prevLine;
              break;
            }
          }

          if (horse && odds > 0) {
            // Find or create entry for this horse
            let entry = results.find(
              r =>
                r.horse === horse &&
                r.track === currentTrack &&
                r.raceNum === currentRace
            );

            if (!entry) {
              entry = {
                horse,
                track: currentTrack,
                raceNum: currentRace,
                bookmakers: {},
                best: odds,
                average: odds,
              };
              results.push(entry);
            }

            entry.bookmakers[bookie] = odds;
            entry.best = Math.min(entry.best, odds);
            const prices = Object.values(entry.bookmakers);
            entry.average =
              prices.reduce((a, b) => a + b, 0) / prices.length;
          }
        }
      }

      return results;
    });

    console.log(`\n✅ Extracted odds for ${oddsData.length} horse combinations`);

    // Group by track/race
    const byRace: { [key: string]: OddsData[] } = {};
    oddsData.forEach(od => {
      const key = `${od.track} R${od.raceNum}`;
      if (!byRace[key]) byRace[key] = [];
      byRace[key].push(od);
    });

    console.log(`\nOrganized into ${Object.keys(byRace).length} races`);
    console.log('\nSample races:');
    Object.entries(byRace)
      .slice(0, 3)
      .forEach(([race, horses]) => {
        console.log(`\n  ${race}:`);
        horses.slice(0, 3).forEach(h => {
          const bookies = Object.keys(h.bookmakers).join(', ');
          console.log(
            `    ${h.horse}: ${Object.keys(h.bookmakers).length} bookies (${bookies})`
          );
          console.log(
            `      Best: ${h.best.toFixed(2)} | Avg: ${h.average.toFixed(2)}`
          );
        });
      });

    return oddsData;
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    return [];
  } finally {
    await browser.close();
  }
}

async function main() {
  const oddsData = await scrapePuntersOdds();

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  if (oddsData.length > 0) {
    console.log(`\n✅ Successfully scraped odds data`);
    console.log(`   Total horses: ${oddsData.length}`);
    console.log(
      `   Avg bookmakers per horse: ${
        (
          oddsData.reduce(
            (sum, od) => sum + Object.keys(od.bookmakers).length,
            0
          ) / oddsData.length
        ).toFixed(1)
      }`
    );

    // Find bookmakers
    const allBookies = new Set<string>();
    oddsData.forEach(od => {
      Object.keys(od.bookmakers).forEach(b => allBookies.add(b));
    });
    console.log(`   Bookmakers found: ${Array.from(allBookies).join(', ')}`);

    console.log('\n💡 USE CASE:');
    console.log('   - Better market odds than Racing API (aggregated from multiple sources)');
    console.log('   - Can use average odds across bookmakers for CLV calculation');
    console.log('   - Can detect line movements (Sportsbet vs others)');
    console.log('   - More reliable than single-source betting odds');
  } else {
    console.log('❌ No odds data extracted');
    console.log('   Note: Punters odds comparison may have JavaScript rendering');
    console.log('   Alternative: Implement individual bookmaker scrapers (Sportsbet, Ladbrokes)');
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
