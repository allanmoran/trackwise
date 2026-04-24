#!/usr/bin/env node
/**
 * Find the actual 30 races containing Jannik, A Book Of Days, Rubi Air, Spirits Burn Deep, Ace Of Lace
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

async function scrapeRaceQuick(url: string): Promise<{url: string, horses: string[], hasTarget: boolean}> {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();

  try {
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

    const horses = await page.evaluate(() => {
      const result: string[] = [];
      const rows = document.querySelectorAll('table tbody tr');

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const nameText = cells[1]?.textContent?.trim() || '';

          if (nameText.length > 2 && nameText.length < 50) {
            const lowerName = nameText.toLowerCase();
            if (!lowerName.includes('day') &&
                !lowerName.includes('start') &&
                !lowerName.includes('trial') &&
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

    const hasTarget = horses.some(h =>
      TARGET_HORSES.some(target =>
        h.toLowerCase().includes(target.toLowerCase())
      )
    );

    return { url, horses, hasTarget };
  } catch (err) {
    try {
      await browser.close();
    } catch {}
    return { url, horses: [], hasTarget: false };
  }
}

async function main() {
  console.log(`🔍 Searching ${allUrls.length} races for target horses...\n`);

  const foundRaces: any[] = [];
  let checked = 0;

  for (const url of allUrls) {
    if (foundRaces.length >= 30) break;

    const result = await scrapeRaceQuick(url);
    checked++;

    if (result.hasTarget) {
      console.log(`✓ ${url}`);
      result.horses.forEach(h => {
        if (TARGET_HORSES.some(t => h.toLowerCase().includes(t.toLowerCase()))) {
          console.log(`   → ${h}`);
        }
      });
      foundRaces.push(result);
    }

    if (checked % 50 === 0) {
      console.log(`  [${checked}/${allUrls.length} checked, ${foundRaces.length} found]\n`);
    }
  }

  console.log(`\n✅ Found ${foundRaces.length} races with target horses`);
  fs.writeFileSync('actual-races.json', JSON.stringify(foundRaces, null, 2));
  console.log('Saved to actual-races.json');
}

main().catch(console.error);
