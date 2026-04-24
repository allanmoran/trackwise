#!/usr/bin/env node
/**
 * Find the 30 races containing target horses - FIXED VERSION
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGET_HORSES = [
  'Jannik',
  'A Book Of Days',
  'Rubi Air',
  'Spirits Burn Deep',
  'Ace Of Lace'
];

// Load all URLs
const urlFile = path.join(__dirname, 'all-race-urls.txt');
const allUrls = fs.readFileSync(urlFile, 'utf-8').split('\n').filter(u => u.trim());

async function scrapeRaceQuick(url: string): Promise<{url: string, horses: string[], track: string, hasTarget: boolean}> {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();

  try {
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

    const pageTitle = await page.title();

    // Extract horse data - look at actual tbody rows with horse entries (first ~25 rows)
    const horses = await page.evaluate(() => {
      const result: string[] = [];
      const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 25); // Only first 25 rows (horse entries)

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const barrierText = cells[0]?.textContent?.trim() || '';
          const nameText = cells[1]?.textContent?.trim() || '';

          // Check if first cell is a valid barrier number (01-99)
          if (barrierText.match(/^\d{1,2}$/) && nameText.length > 2 && nameText.length < 50) {
            // Filter out obvious non-horse rows
            const lowerName = nameText.toLowerCase();
            // More specific filtering - exclude header-like text
            if (!lowerName.includes('foaled') &&
                !lowerName.includes('sire') &&
                !lowerName.includes('dam') &&
                !lowerName.includes('breeder') &&
                !lowerName.includes('trainer') &&
                !lowerName.includes('jockey') &&
                !lowerName.includes('colours') &&
                !lowerName.includes('barrier') &&
                nameText.match(/^[A-Za-z]/)) {
              result.push(nameText);
            }
          }
        }
      });

      return result;
    });

    await browser.close();

    // Check if ANY target horse is in this race
    const hasTarget = horses.some(h =>
      TARGET_HORSES.some(target =>
        h.toLowerCase().includes(target.toLowerCase())
      )
    );

    return { url, horses, track: pageTitle.split(' Race')[0] || 'Unknown', hasTarget };
  } catch (err) {
    try {
      await browser.close();
    } catch {}
    return { url, horses: [], track: 'Error', hasTarget: false };
  }
}

async function main() {
  console.log(`🔍 Searching ${allUrls.length} races for target horses (fixed)...\n`);

  const foundRaces: any[] = [];
  let checked = 0;
  let concurrency = 5; // Process 5 URLs at a time
  let i = 0;

  while (i < allUrls.length && foundRaces.length < 30) {
    // Process batch of concurrent requests
    const batch = allUrls.slice(i, i + concurrency).map(url => scrapeRaceQuick(url));
    const results = await Promise.all(batch);

    for (const result of results) {
      if (foundRaces.length >= 30) break;

      checked++;
      if (result.hasTarget) {
        console.log(`✓ ${result.track} - ${result.url}`);
        const matchedHorses = result.horses.filter(h =>
          TARGET_HORSES.some(t => h.toLowerCase().includes(t.toLowerCase()))
        );
        matchedHorses.forEach(h => console.log(`   → ${h}`));
        foundRaces.push(result);
      }

      if (checked % 20 === 0) {
        console.log(`  [${checked}/${allUrls.length} checked, ${foundRaces.length} found]\n`);
      }
    }

    i += concurrency;
  }

  console.log(`\n✅ Found ${foundRaces.length} races with target horses`);
  fs.writeFileSync('actual-races.json', JSON.stringify(foundRaces, null, 2));
  console.log('Saved to actual-races.json');

  // Also save URLs for reference
  const urls = foundRaces.map(r => r.url);
  fs.writeFileSync('actual-race-urls.txt', urls.join('\n'));
  console.log('Saved URLs to actual-race-urls.txt');
}

main().catch(console.error);
