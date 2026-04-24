#!/usr/bin/env node
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function extractRaces() {
  console.log('🏇 Extracting race links from Sportsbet Form...\n');

  let browser;
  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    console.log('[scrape] Navigating to sportsbetform.com.au...');
    await page.goto('https://www.sportsbetform.com.au/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await new Promise(r => setTimeout(r, 3000));

    // Get page content to inspect
    const content = await page.content();
    
    // Look for all href attributes that contain form URLs
    const raceLinks: string[] = [];
    const matches = content.match(/href="([^"]*\/form\/[^"]+)"/g) || [];
    
    for (const match of matches) {
      const href = match.replace('href="', '').replace('"', '');
      const fullUrl = new URL(href, 'https://www.sportsbetform.com.au').href;
      if (!raceLinks.includes(fullUrl)) {
        raceLinks.push(fullUrl);
      }
    }

    await browser.close();

    if (raceLinks.length === 0) {
      console.error('❌ No race links found on page.');
      console.log('\nTrying manual extraction from table data...');
      
      // If dynamic scraping fails, use the table data provided
      const tracks = ['Alice Springs', 'Ascot', 'Ballina', 'Bowen', 'Caulfield', 'Doomben', 'Goulburn', 'Kilcoy', 'Morphettville', 'Narrogin', 'Newcastle', 'Randwick', 'Rockhampton', 'Toowoomba', 'Werribee'];
      const raceCount: {[key: string]: number} = {
        'Alice Springs': 8, 'Ascot': 11, 'Ballina': 6, 'Bowen': 5, 'Caulfield': 10,
        'Doomben': 8, 'Goulburn': 6, 'Kilcoy': 7, 'Morphettville': 10, 'Narrogin': 8,
        'Newcastle': 8, 'Randwick': 9, 'Rockhampton': 8, 'Toowoomba': 7, 'Werribee': 7
      };

      console.log('\n📋 ESTIMATED RACE LINKS (from race schedule):\n');
      console.log('⚠️  Please verify these on https://www.sportsbetform.com.au/\n');
      
      let count = 0;
      for (const track of tracks) {
        const races = raceCount[track] || 8;
        for (let race = 1; race <= races; race++) {
          console.log(`https://www.sportsbetform.com.au/ [${track} R${race}]`);
          count++;
        }
      }
      
      console.log(`\n⚠️  Found ${count} Australian races listed`);
      console.log('✓ Visit https://www.sportsbetform.com.au/ to get actual links');
      console.log('✓ Use your browser devtools to inspect race URLs\n');
    } else {
      console.log(`✅ Found ${raceLinks.length} race links\n`);
      console.log('='.repeat(80));
      raceLinks.forEach(link => console.log(link));
      console.log('='.repeat(80));
    }

  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

extractRaces();
