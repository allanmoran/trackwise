#!/usr/bin/env node
/**
 * Extract all race links from Sportsbet Form for today
 * Scrapes sportsbetform.com.au and returns URLs ready for TrackWise
 */

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

const TRACK_NAMES = [
  'Alice Springs', 'Ascot', 'Ballina', 'Bowen', 'Caulfield',
  'Doomben', 'Goulburn', 'Kilcoy', 'Morphettville', 'Narrogin',
  'Newcastle', 'Randwick', 'Rockhampton', 'Toowoomba', 'Werribee'
];

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
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await new Promise(r => setTimeout(r, 2000));

    // Extract all race links
    console.log('[scrape] Extracting race links...');
    const raceLinks = await page.evaluate(() => {
      const links: string[] = [];
      
      // Find all race links on the page
      const anchors = document.querySelectorAll('a[href*="/form/"]');
      for (const a of anchors) {
        const href = a.getAttribute('href');
        if (href && href.includes('/form/') && href.includes('/')) {
          const fullUrl = new URL(href, window.location.origin).href;
          if (!links.includes(fullUrl)) {
            links.push(fullUrl);
          }
        }
      }

      return links;
    });

    await browser.close();

    if (raceLinks.length === 0) {
      console.error('❌ No race links found. Website structure may have changed.');
      process.exit(1);
    }

    console.log(`\n✅ Found ${raceLinks.length} race links\n`);
    console.log('='.repeat(80));
    console.log('\n📋 RACE LINKS (paste into TrackWise):\n');

    // Output links
    raceLinks.forEach(link => console.log(link));

    console.log('\n' + '='.repeat(80));
    console.log(`\n✓ Total links: ${raceLinks.length}`);
    console.log('✓ Copy all links above and paste into TrackWise');
    console.log('✓ Click "Generate & Place Bets" to start Phase 1 test\n');

  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

extractRaces();
