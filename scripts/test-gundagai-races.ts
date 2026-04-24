#!/usr/bin/env node
/**
 * Test scraping Gundagai races to debug the issue
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const gundagaiUrls = [
  'https://www.sportsbetform.com.au/436044/3308955/',
  'https://www.sportsbetform.com.au/436044/3308956/',
  'https://www.sportsbetform.com.au/436044/3308958/',
  'https://www.sportsbetform.com.au/436044/3308960/',
  'https://www.sportsbetform.com.au/436044/3308962/',
  'https://www.sportsbetform.com.au/436044/3308964/',
  'https://www.sportsbetform.com.au/436044/3308966/',
  'https://www.sportsbetform.com.au/436044/3308967/'
];

const TARGET_HORSES = ['Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace'];

async function scrapeRace(url: string) {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();

  try {
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});
    const pageTitle = await page.title();

    // Proven extraction logic
    const result = await page.evaluate(() => {
      const horses: string[] = [];
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
              horses.push(nameText);
            }
          }
        }
      });

      return horses;
    });

    const hasTarget = result.some(h =>
      TARGET_HORSES.some(target => h.toLowerCase().includes(target.toLowerCase()))
    );

    await browser.close();

    return { url, pageTitle, horses: result, hasTarget };
  } catch (err) {
    try {
      await browser.close();
    } catch {}
    return { url, pageTitle: 'Error', horses: [], hasTarget: false };
  }
}

async function main() {
  console.log(`Testing ${gundagaiUrls.length} Gundagai URLs\n`);

  let found = 0;

  for (const url of gundagaiUrls) {
    const result = await scrapeRace(url);
    const symbol = result.hasTarget ? '✓' : '✗';

    console.log(`${symbol} ${result.pageTitle}`);
    if (result.hasTarget) {
      console.log(`  Horses: ${result.horses.join(', ')}`);
      const matched = result.horses.filter(h =>
        TARGET_HORSES.some(t => h.toLowerCase().includes(t.toLowerCase()))
      );
      console.log(`  Target horses: ${matched.join(', ')}`);
      found++;
    }
  }

  console.log(`\n✅ Found ${found}/${gundagaiUrls.length} Gundagai races with target horses`);
}

main().catch(console.error);
