#!/usr/bin/env node
/**
 * Extract today's Australian races from Sportsbet Form
 * Outputs URLs to file for pasting into TrackWise
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AUSTRALIAN_TRACK_IDS = {
  '435951': 'Alice Springs',
  '435956': 'Doomben',
  '435963': 'Benalla',
  '435964': 'Ballina',
  '435965': 'Warrnambool',
  '435966': 'Rockhampton',
  '435967': 'Toowoomba',
  '435975': 'Werribee',
  '435979': 'Morphettville',
  '435955': 'Goulburn',
  '435974': 'Caulfield',
  '436054': 'Bowen',
  '436088': 'Ascot',
  '436089': 'Narrogin',
  '436344': 'Newcastle'
};

async function extractDailyRaces() {
  console.log('Extracting today\'s Australian races...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  });

  console.log('Loading Sportsbet Form homepage...');
  await page.goto('https://www.sportsbetform.com.au/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  const races = await page.evaluate((trackIds) => {
    const raceLinks = [];
    document.querySelectorAll('a').forEach(link => {
      const href = link.href;
      const match = href.match(/sportsbetform\.com\.au\/(\d+)\/(\d+)\//);
      if (match && trackIds[match[1]]) {
        raceLinks.push({
          href,
          trackId: match[1],
          trackName: trackIds[match[1]]
        });
      }
    });
    return raceLinks.filter((r, i, arr) => arr.findIndex(x => x.href === r.href) === i);
  }, AUSTRALIAN_TRACK_IDS);

  await browser.close();

  if (races.length === 0) {
    console.log('❌ No races found');
    process.exit(1);
  }

  // Group by track for summary
  const byTrack = {};
  races.forEach(r => {
    if (!byTrack[r.trackName]) {
      byTrack[r.trackName] = 0;
    }
    byTrack[r.trackName]++;
  });

  // Extract just URLs
  const urls = races.map(r => r.href);

  // Save to file
  const outputPath = path.resolve(__dirname, '../RACE_URLS.txt');
  fs.writeFileSync(outputPath, urls.join('\n') + '\n');

  console.log(`\n✅ Extracted ${races.length} races from ${Object.keys(byTrack).length} tracks\n`);
  console.log('Tracks:');
  Object.entries(byTrack).forEach(([track, count]) => {
    console.log(`  ${track}: ${count} races`);
  });

  console.log(`\n📋 URLs saved to: RACE_URLS.txt`);
  console.log('Ready to paste into TrackWise\n');
}

extractDailyRaces().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
