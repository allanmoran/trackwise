#!/usr/bin/env node
/**
 * Extract ALL Australian races from Sportsbet Form
 * Uses schedule + smart waiting to capture all races
 */

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

// Australian tracks in today's schedule
const SCHEDULE = {
  'Caulfield': 10,
  'Doomben': 8,
  'Goulburn': 6,
  'Kilcoy': 7,
  'Morphettville': 10,
  'Narrogin': 8,
  'Newcastle': 8,
  'Randwick': 9,
  'Rockhampton': 8,
  'Toowoomba': 7,
  'Werribee': 7,
  'Alice Springs': 7,
  'Ascot': 10,
  'Ballina': 6,
  'Bowen': 5,
};

// Track ID mapping from Sportsbet Form
const TRACK_IDS: Record<string, string> = {
  'Alice Springs': '435971',
  'Ascot': '435950',
  'Ballina': '435960',
  'Bowen': '435967',
  'Caulfield': '435959',
  'Doomben': '435951',
  'Goulburn': '435955',
  'Kilcoy': '435963',
  'Morphettville': '435954',
  'Narrogin': '435966',
  'Newcastle': '435965',
  'Randwick': '394663',
  'Rockhampton': '435964',
  'Toowoomba': '435957',
  'Werribee': '435956',
};

async function extractAll() {
  console.log('\n🏇 Extracting ALL 126 Australian races...\n');

  let browser;
  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    console.log('[1/4] Loading Sportsbet Form...');
    await page.goto('https://www.sportsbetform.com.au/', { 
      waitUntil: 'networkidle0',
      timeout: 90000,
    });

    console.log('[2/4] Waiting for dynamic content...');
    await new Promise(r => setTimeout(r, 3000));

    // Scroll to bottom to trigger lazy loading
    console.log('[3/4] Scrolling to load all races...');
    await page.evaluate(() => {
      const scrollHeight = document.documentElement.scrollHeight;
      window.scrollTo(0, scrollHeight);
    });
    await new Promise(r => setTimeout(r, 3000));

    // Extract all links with more aggressive selector
    console.log('[4/4] Extracting race URLs...');
    const allRaces = await page.evaluate(() => {
      const races: {url: string, trackId: string, raceId: string}[] = [];
      
      // Try multiple selectors to find all race links
      const selectors = [
        'a[href*="/form/"][href*="sportsbetform"]',
        'a[href*="/435"]',  // Track ID pattern
        'a[href*="/394"]',  // Randwick
      ];

      const seen = new Set<string>();

      for (const selector of selectors) {
        const links = document.querySelectorAll(selector);
        for (const link of links) {
          const href = (link as HTMLAnchorElement).href;
          
          // Match /trackId/raceId/
          const match = href.match(/sportsbetform\.com\.au\/(\d+)\/(\d+)\//);
          if (match && !seen.has(href)) {
            const [, trackId, raceId] = match;
            races.push({url: href, trackId, raceId});
            seen.add(href);
          }
        }
      }

      return races;
    });

    console.log(`  Found ${allRaces.length} total races\n`);

    // Filter to Australian track IDs
    const auTrackIds = Object.values(TRACK_IDS);
    const auRaces = allRaces.filter(r => auTrackIds.includes(r.trackId));

    console.log(`✅ Australian races extracted: ${auRaces.length}\n`);

    // Sort by track ID then race ID
    auRaces.sort((a, b) => {
      if (a.trackId !== b.trackId) return a.trackId.localeCompare(b.trackId);
      return parseInt(a.raceId) - parseInt(b.raceId);
    });

    console.log('='.repeat(80));
    auRaces.forEach(r => console.log(r.url));
    console.log('='.repeat(80));

    // Save to file
    const fs = await import('fs');
    const urls = auRaces.map(r => r.url).join('\n');
    fs.writeFileSync('TODAY_RACE_LINKS_ALL.txt', urls);

    console.log(`\n✓ Saved ${auRaces.length} URLs to TODAY_RACE_LINKS_ALL.txt`);
    console.log(`✓ Expected: 126 (Caulfield:10, Doomben:8, etc.)\n`);

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

extractAll();
