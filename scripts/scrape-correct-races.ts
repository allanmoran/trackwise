#!/usr/bin/env node
/**
 * Scrape the correct 31 races for settlement
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

// Exact URLs for the 31 races we need
const racesByTrack = {
  'Alice Springs': {
    trackId: '435951',
    races: [1,2,3,4,5,6,7],
    baseUrl: 'https://www.sportsbetform.com.au/435951/'
  },
  'Ascot': {
    trackId: '436088',
    races: [1,2,3,4,5,6,7,8,9,10],
    baseUrl: 'https://www.sportsbetform.com.au/436088/'
  },
  'Ballina': {
    trackId: '435964',
    races: [1,2,3,4,5,6],
    baseUrl: 'https://www.sportsbetform.com.au/435964/'
  },
  'Bowen': {
    trackId: '436054',
    races: [1,2,3,4,5],
    baseUrl: 'https://www.sportsbetform.com.au/436054/'
  },
  'Caulfield': {
    trackId: '435974',
    races: [1,2],
    baseUrl: 'https://www.sportsbetform.com.au/435974/'
  },
  'Geraldton': {
    trackId: '435639',
    races: [1],
    baseUrl: 'https://www.sportsbetform.com.au/435639/'
  }
};

// Race IDs for each race (from the URLs)
const raceIds: Record<string, Record<number, string>> = {
  'Alice Springs': {1:'2902299', 2:'2902303', 3:'3308692', 4:'3308693', 5:'3308694', 6:'3308695', 7:'3309803'},
  'Ascot': {1:'3309804', 2:'3309805', 3:'3309806', 4:'3308201', 5:'3308203', 6:'3308206', 7:'3308207', 8:'3308208', 9:'3308209', 10:'3308210'},
  'Ballina': {1:'3308250', 2:'3308253', 3:'3308256', 4:'3308259', 5:'3308262', 6:'3308265'},
  'Bowen': {1:'3309020', 2:'3309027', 3:'3309031', 4:'3309033', 5:'3309035'},
  'Caulfield': {1:'3308409', 2:'3308412'},
  'Geraldton': {1:'3305862'}
};

interface RaceData {
  track: string;
  raceNum: number;
  trackId: string;
  raceId: string;
  url: string;
  horses: Record<number, string>;
}

async function scrapeRace(track: string, raceNum: number, url: string): Promise<RaceData | null> {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();

  try {
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

    const trackId = racesByTrack[track].trackId;
    const raceId = raceIds[track][raceNum];

    // Extract horse data from table
    const horses = await page.evaluate(() => {
      const result: Record<number, string> = {};
      const rows = document.querySelectorAll('table tbody tr');

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const barrierText = cells[0]?.textContent?.trim() || '';
          const nameText = cells[1]?.textContent?.trim() || '';

          const barrierMatch = barrierText.match(/(\d{1,2})/);
          if (barrierMatch) {
            const barrier = parseInt(barrierMatch[1]);

            if (barrier > 0 && barrier < 30 && nameText.length > 2 && nameText.length < 50) {
              const lowerName = nameText.toLowerCase();
              if (!lowerName.includes('day') &&
                  !lowerName.includes('start') &&
                  !lowerName.includes('trial') &&
                  !lowerName.includes('barrier') &&
                  !lowerName.includes('name') &&
                  !lowerName.includes('trainer') &&
                  !lowerName.includes('jockey') &&
                  nameText.match(/^[A-Za-z\s\-']/)) {
                result[barrier] = nameText;
              }
            }
          }
        }
      });

      return result;
    });

    await browser.close();

    if (Object.keys(horses).length > 0) {
      return { track, raceNum, trackId, raceId, url, horses };
    }
  } catch (err) {
    console.error(`Error scraping ${url}:`, (err as Error).message);
  }

  try {
    await browser.close();
  } catch {}
  return null;
}

async function main() {
  console.log(`📋 Scraping 31 correct races...\n`);

  const allRaces: RaceData[] = [];

  for (const [track, config] of Object.entries(racesByTrack)) {
    console.log(`\n🏇 ${track}:`);
    for (const raceNum of config.races) {
      const raceId = raceIds[track][raceNum];
      const url = `${config.baseUrl}${raceId}/`;

      const race = await scrapeRace(track, raceNum, url);
      if (race) {
        console.log(`  ✓ R${raceNum}: ${Object.keys(race.horses).length} horses`);
        allRaces.push(race);
      } else {
        console.log(`  ✗ R${raceNum}: Failed`);
      }
    }
  }

  console.log(`\n✅ Extracted ${allRaces.length} races\n`);

  // Save full data
  fs.writeFileSync('correct-races.json', JSON.stringify(allRaces, null, 2));
  console.log('Saved to correct-races.json');

  // Build formData by track name
  const formData: Record<string, Record<number, Record<number, string>>> = {};

  allRaces.forEach(race => {
    if (!formData[race.track]) {
      formData[race.track] = {};
    }
    formData[race.track][race.raceNum] = race.horses;
  });

  // Write formData
  const output = `// Auto-generated form card data for 31 races\nexport const formData = ${JSON.stringify(formData, null, 2)};`;
  fs.writeFileSync('correct-form-data.ts', output);
  console.log('Saved to correct-form-data.ts');
}

main().catch(console.error);
