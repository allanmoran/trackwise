#!/usr/bin/env node
/**
 * Map track IDs to track names by visiting each track's page
 */

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function mapTracks() {
  console.log('\n🏇 Mapping track IDs to names...\n');

  // Get all unique track IDs from previous extraction
  const fs = await import('fs');
  const trackData = JSON.parse(fs.readFileSync('SPORTSBET_ALL_TRACK_IDS.json', 'utf-8'));
  const trackIds = Object.keys(trackData).sort();

  const trackMap: Record<string, string> = {};
  let browser;

  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    console.log(`Testing ${trackIds.slice(0, 20).length} track IDs to find names...\n`);

    // Test first 20 track IDs to find names
    for (const trackId of trackIds.slice(0, 20)) {
      const page = await browser.newPage();
      
      try {
        // Try to visit a race for this track
        const raceId = trackData[trackId].races[0];
        const url = `https://www.sportsbetform.com.au/${trackId}/${raceId}/`;
        
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 5000,
        });

        // Extract track name from page
        const trackName = await page.evaluate(() => {
          // Try multiple selectors to find track name
          const selectors = [
            'h1',
            'h2',
            '[class*="track"]',
            '[data-test*="track"]',
            'title',
          ];

          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el?.textContent) {
              const text = el.textContent.trim();
              if (text.length > 0 && text.length < 100) {
                return text;
              }
            }
          }

          return null;
        });

        if (trackName) {
          trackMap[trackId] = trackName;
          console.log(`  ${trackId}: ${trackName.split('\n')[0]}`);
        }
      } catch (err) {
        // Silently continue
      }

      await page.close();
    }

    await browser.close();

    console.log('\n✅ Track name mapping:');
    console.log(JSON.stringify(trackMap, null, 2));

  } catch (err) {
    console.error('Error:', err);
  }
}

mapTracks();
