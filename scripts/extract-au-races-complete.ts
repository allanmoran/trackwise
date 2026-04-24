#!/usr/bin/env node
/**
 * Extract ALL Australian races from Sportsbet Form
 * Maps actual track names from schedule to Sportsbet IDs
 */

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function extractAUComplete() {
  console.log('\n🏇 Extracting ALL Australian races...\n');

  let browser;
  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 60000,
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    
    await page.goto('https://www.sportsbetform.com.au/', { 
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for content to fully load
    await new Promise(r => setTimeout(r, 3000));

    // Scroll to load lazy-loaded content
    console.log('[scrape] Scrolling to load all races...');
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await new Promise(r => setTimeout(r, 2000));

    // Extract ALL race links
    const allRaces = await page.evaluate(() => {
      const races: any[] = [];
      const links = Array.from(document.querySelectorAll('a'));

      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link as HTMLAnchorElement).textContent?.trim() || '';

        // Match any race link with time format HH:MM
        if (/\d{2}:\d{2}/.test(text) && href.includes('/form/')) {
          races.push({
            url: href,
            time: text,
          });
        }
      }

      // Remove duplicates
      const seen = new Set<string>();
      return races.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
    });

    await browser.close();

    console.log(`[scrape] Found ${allRaces.length} total race links\n`);

    // Australian track IDs (based on Sportsbet Form)
    const auTrackIds = [
      '435971', '435950', '435960', '435967', '435959',
      '435951', '435955', '435963', '435954', '435966',
      '435965', '394663', '435964', '435957', '435956',
    ];

    // Filter to Australian races only
    const auRaces = allRaces.filter(r => {
      return auTrackIds.some(id => r.url.includes(`/${id}/`));
    });

    console.log(`✓ Australian races: ${auRaces.length}\n`);
    console.log('='.repeat(80));
    
    auRaces.forEach(r => console.log(r.url));

    console.log('='.repeat(80));
    console.log(`\n✅ ${auRaces.length} Australian race URLs ready\n`);

    // Save to file
    const fs = await import('fs');
    const urls = auRaces.map(r => r.url).join('\n');
    fs.writeFileSync('TODAY_AU_RACES_EXTRACTED.txt', urls);
    console.log('✓ Saved to TODAY_AU_RACES_EXTRACTED.txt\n');

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

extractAUComplete();
