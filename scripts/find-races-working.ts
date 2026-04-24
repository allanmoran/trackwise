#!/usr/bin/env node
/**
 * Find the 30 races containing target horses - WORKING VERSION using proven extraction
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

    // Use the proven extraction logic from debug script
    const extractedData = await page.evaluate(() => {
      const result: {name: string, barrier: string, passed: boolean}[] = [];
      const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 25);

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const barrierText = cells[0]?.textContent?.trim() || '';
          const nameText = cells[1]?.textContent?.trim() || '';

          const passBarrier = !!barrierText.match(/^\d{1,2}$/);
          const passLength = nameText.length > 2 && nameText.length < 50;

          if (passBarrier && passLength) {
            const lowerName = nameText.toLowerCase();
            const passBadWords = !(
              lowerName.includes('foaled') ||
              lowerName.includes('sire') ||
              lowerName.includes('dam') ||
              lowerName.includes('breeder') ||
              lowerName.includes('trainer') ||
              lowerName.includes('jockey') ||
              lowerName.includes('colours') ||
              lowerName.includes('barrier')
            );
            const passLetter = !!nameText.match(/^[A-Za-z]/);

            if (passBarrier && passLength && passBadWords && passLetter) {
              result.push({
                name: nameText,
                barrier: barrierText,
                passed: true
              });
            }
          }
        }
      });

      return result;
    });

    const horses = extractedData.filter(d => d.passed).map(d => d.name);
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
  console.log(`🔍 Searching ${allUrls.length} races for target horses (working version)...\n`);

  const foundRaces: any[] = [];
  let checked = 0;
  let concurrency = 3; // Reduced concurrency for stability
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
