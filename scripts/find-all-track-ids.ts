#!/usr/bin/env node
/**
 * Extract ALL track IDs from Sportsbet Form
 * Then map them to track names
 */

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function findAllTracks() {
  console.log('\n🔍 Finding ALL track IDs on Sportsbet Form...\n');

  let browser;
  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://www.sportsbetform.com.au/', { 
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    // Aggressive scrolling to load all content
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, document.documentElement.scrollHeight);
      });
      await new Promise(r => setTimeout(r, 500));
    }

    // Extract ALL track IDs and their race counts
    const trackData = await page.evaluate(() => {
      const tracks: Record<string, {count: number, races: string[]}> = {};
      
      // Get all race URLs
      const links = Array.from(document.querySelectorAll('a'));
      
      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        const match = href.match(/sportsbetform\.com\.au\/(\d+)\/(\d+)\//);
        
        if (match) {
          const [, trackId, raceId] = match;
          
          if (!tracks[trackId]) {
            tracks[trackId] = {count: 0, races: []};
          }
          
          tracks[trackId].races.push(raceId);
          tracks[trackId].count++;
        }
      }

      return tracks;
    });

    await browser.close();

    // Sort by race count descending
    const sorted = Object.entries(trackData)
      .map(([id, data]) => ({id, ...data}))
      .sort((a, b) => b.count - a.count);

    console.log('ALL track IDs found:\n');
    sorted.forEach(track => {
      console.log(`ID: ${track.id.padEnd(8)} Races: ${track.count.toString().padEnd(3)}`);
    });

    console.log(`\n✅ Total unique tracks: ${sorted.length}`);
    console.log(`✅ Total races: ${sorted.reduce((sum, t) => sum + t.count, 0)}\n`);

    // Save all IDs for reference
    const fs = await import('fs');
    fs.writeFileSync('SPORTSBET_ALL_TRACK_IDS.json', JSON.stringify(trackData, null, 2));
    console.log('Saved to SPORTSBET_ALL_TRACK_IDS.json\n');

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

findAllTracks();
