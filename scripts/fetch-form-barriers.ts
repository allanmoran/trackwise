#!/usr/bin/env node
/**
 * Fetch Sportsbet Form data to extract barrier→horse mappings
 * Uses the barrier finish positions to determine results
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Race results: Track -> Race Number -> [1st barrier, 2nd barrier, 3rd barrier]
const barrierResults: Record<string, Record<number, number[]>> = {
  'Ascot': { 1: [11, 5, 4], 2: [3, 2, 1], 3: [1, 8, 5], 4: [5, 3, 4], 5: [5, 3, 2], 6: [10, 4, 1], 7: [1, 6, 9], 8: [5, 3, 2], 9: [2, 6, 8], 10: [5, 2, 7] },
  'Caulfield': { 1: [2, 13, 7], 2: [12, 10, 13], 3: [6, 4, 1], 4: [10, 1, 3], 5: [13, 1, 5], 6: [5, 8, 2], 7: [1, 6, 4], 8: [8, 12, 14], 9: [6, 11, 1], 10: [10, 9, 14] },
  'Alice Springs': { 1: [4, 6, 8], 2: [8, 7, 5], 3: [4, 5, 3], 4: [4, 1, 3], 5: [2, 5, 7], 6: [3, 7, 1], 7: [4, 1, 3] },
  'Ballina': { 1: [10, 7, 6], 2: [13, 7, 2], 3: [9, 3, 8], 4: [4, 8, 5], 5: [2, 4, 7], 6: [4, 12, 5] },
  'Bowen': { 1: [5, 1, 3], 2: [1, 2, 5], 3: [5, 2, 8], 4: [7, 3, 5], 5: [9, 3, 5] },
  'Geraldton': { 1: [1, 3, 2], 2: [2, 5, 1], 3: [3, 1, 4], 4: [4, 2, 1], 5: [1, 3, 5], 6: [5, 1, 2], 7: [2, 4, 3] }, // Placeholder - need actual data
};

interface RaceCard {
  track: string;
  raceNum: number;
  barriers: Record<number, string>; // barrier -> horse name
}

function log(msg: string) {
  console.log(msg);
}

async function extractFormData(url: string): Promise<RaceCard | null> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 1000));

    const raceCard = await page.evaluate(() => {
      // Extract race info from page
      const bodyText = document.body.innerText;

      // Try to find track name
      let track = 'Unknown';
      const trackMatch = bodyText.match(/([A-Za-z\s]+)\s+(?:Race|R)\s+(\d+)/i);
      if (trackMatch) {
        track = trackMatch[1].trim();
      }

      // Try to find race number
      let raceNum = 0;
      const raceMatch = bodyText.match(/(?:Race|R)\s+(\d+)/i);
      if (raceMatch) {
        raceNum = parseInt(raceMatch[1]);
      }

      // Extract horses and barriers from entries/form
      const barriers: Record<number, string> = {};

      // Look for rows with barrier + horse name pattern
      const rows = document.querySelectorAll('tr, li, div[class*="entry"], div[class*="horse"]');

      for (const row of rows) {
        const text = row.textContent || '';

        // Pattern: "Barrier Number. Horse Name"
        const match = text.match(/^\s*(\d+)\s*[\.\-\s]+([A-Za-z\s\-']+?)(?:\s*\(|\s*$)/);
        if (match) {
          const barrier = parseInt(match[1]);
          let horseName = match[2].trim()
            .replace(/\([^)]*\)/g, '') // Remove parentheses
            .replace(/\s+/g, ' ')
            .trim();

          if (horseName.length > 2 && barrier > 0 && barrier < 30) {
            barriers[barrier] = horseName;
          }
        }
      }

      return { track, raceNum, barriers };
    });

    await browser.close();
    return raceCard;
  } catch (err) {
    log(`⚠️  Failed to extract form data from URL: ${err}`);
    if (browser) await browser.close();
    return null;
  }
}

async function main() {
  log('\n' + '='.repeat(70));
  log('📋 FETCHING RACE FORM DATA FROM SPORTSBET\n');

  log('This script needs Sportsbet Form URLs for April 11-12 races.');
  log('Waiting for form data extraction...\n');

  // For now, we'll use the barrier results we have and match against database horses
  // In production, we'd fetch the actual form data from Sportsbet

  const tracks = ['Ascot', 'Caulfield', 'Alice Springs', 'Ballina', 'Bowen', 'Geraldton'];

  for (const track of tracks) {
    const results = barrierResults[track];
    if (!results) continue;

    log(`${track}:`);
    for (const [raceNum, barriers] of Object.entries(results)) {
      log(`  R${raceNum}: Barriers ${barriers.join(', ')} finished 1st, 2nd, 3rd`);
    }
  }

  log('\n' + '='.repeat(70));
  log('To proceed with settlement, provide Sportsbet Form URLs or horse names per race.');
  log('='.repeat(70) + '\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
