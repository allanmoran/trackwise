#!/usr/bin/env node
/**
 * Find the 30 races containing the 5 bet horses
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const TARGET_HORSES = [
  'Jannik',
  'A Book Of Days',
  'Rubi Air',
  'Spirits Burn Deep',
  'Ace Of Lace'
];

// All URLs from conversation
const urls = [
  'https://www.sportsbetform.com.au/394663/2902299/',
  'https://www.sportsbetform.com.au/394663/2902303/',
  'https://www.sportsbetform.com.au/394663/3308692/',
  'https://www.sportsbetform.com.au/394663/3308693/',
  'https://www.sportsbetform.com.au/394663/3308694/',
  'https://www.sportsbetform.com.au/394663/3308695/',
  'https://www.sportsbetform.com.au/394663/3309803/',
  'https://www.sportsbetform.com.au/394663/3309804/',
  'https://www.sportsbetform.com.au/394663/3309805/',
  'https://www.sportsbetform.com.au/394663/3309806/',
  // ... add all other URLs here
];

async function scrapeRace(url: string): Promise<{url: string, track: string, race: string, horses: {barrier: number, name: string}[], hasTarget: boolean}> {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();

  try {
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

    // Get page title for track/race info
    const pageTitle = await page.title();

    // Extract horse data from page
    const horsesData = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const horses: {barrier: number, name: string}[] = [];

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const barrierText = cells[0]?.textContent?.trim() || '';
          const nameText = cells[1]?.textContent?.trim() || '';

          const barrier = parseInt(barrierText);
          if (!isNaN(barrier) && barrier > 0 && barrier < 30 && nameText.length > 0) {
            horses.push({barrier, name: nameText});
          }
        }
      });

      return horses;
    });

    // Check if any target horses are in this race
    const hasTarget = horsesData.some(h =>
      TARGET_HORSES.some(target =>
        h.name.toLowerCase().includes(target.toLowerCase())
      )
    );

    await browser.close();

    return {
      url,
      track: pageTitle.split('|')[0] || 'Unknown',
      race: pageTitle,
      horses: horsesData,
      hasTarget
    };
  } catch (err) {
    await browser.close();
    return {
      url,
      track: 'Error',
      race: 'Failed to scrape',
      horses: [],
      hasTarget: false
    };
  }
}

async function main() {
  console.log('🔍 Searching for races with target horses...\n');

  const results: any[] = [];
  let found = 0;

  for (let i = 0; i < urls.length && found < 30; i++) {
    const result = await scrapeRace(urls[i]);

    if (result.hasTarget) {
      console.log(`✓ Found: ${result.race}`);
      console.log(`  Horses: ${result.horses.map(h => `${h.barrier}:${h.name}`).join(', ')}`);
      results.push(result);
      found++;
    } else {
      process.stdout.write('.');
    }

    if ((i + 1) % 50 === 0) {
      console.log(`\n  [Checked ${i + 1}/${urls.length}]`);
    }
  }

  console.log(`\n\n📊 Found ${found} races with target horses:`);
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync('target-races.json', JSON.stringify(results, null, 2));
  console.log('\nSaved to target-races.json');
}

main().catch(console.error);
