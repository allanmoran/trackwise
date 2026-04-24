#!/usr/bin/env node
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

const TRACK_MAP: Record<string, string> = {
  '435971': 'Cranbourne',    // Alice Springs
  '435950': 'Darwin',        // Ascot
  '435960': 'Gatton',        // Ballina
  '435967': 'Geelong',       // Bowen
  '435959': 'Caulfield',     // Caulfield
  '435951': 'Launceston',    // Doomben
  '435955': 'Murray Bridge', // Goulburn
  '435963': 'Kilcoy',        // Kilcoy
  '435954': 'Gold Coast',    // Morphettville
  '435966': 'Rockhampton',   // Narrogin
  '435965': 'Newcastle',     // Newcastle
  '394663': 'Randwick',      // Randwick
  '435964': 'Toowoomba',     // Rockhampton
  '435957': 'Wellington',    // Toowoomba
  '435956': 'Tamworth',      // Werribee
};

async function getAUOnly() {
  console.log('\n🏇 Extracting Australian races only...\n');

  let browser;
  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://www.sportsbetform.com.au/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));

    const races = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a'));
      const races: any[] = [];

      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link as HTMLAnchorElement).textContent?.trim() || '';

        if (/\d{2}:\d{2}/.test(text)) {
          const match = href.match(/sportsbetform\.com\.au\/(\d+)\/(\d+)/);
          if (match) {
            const [, trackId, raceId] = match;
            races.push({ trackId, raceId, url: href });
          }
        }
      }
      return races;
    });

    await browser.close();

    // Filter to Australian tracks only
    const auRaces = races.filter(r => TRACK_MAP[r.trackId]);
    
    console.log(`Total races found: ${races.length}`);
    console.log(`Australian only: ${auRaces.length}\n`);
    console.log('='.repeat(60));

    auRaces.forEach(r => console.log(r.url));

    console.log('='.repeat(60));
    console.log(`\n✓ ${auRaces.length} Australian races ready to paste\n`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

getAUOnly();
