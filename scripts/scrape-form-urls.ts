#!/usr/bin/env node
/**
 * Scrape Sportsbet Form URLs to extract barrier positions
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

// URLs provided by user
const urls = [
  'https://www.sportsbetform.com.au/435951/3308201/',  // Alice Springs
  'https://www.sportsbetform.com.au/435964/3308323/',  // Ballina
  'https://www.sportsbetform.com.au/436054/3309020/',  // Bowen
  'https://www.sportsbetform.com.au/435974/3308409/',  // Caulfield
  'https://www.sportsbetform.com.au/435639/3305862/',  // Geraldton
];

const TARGET_HORSES = ['Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace'];

async function scrapeRace(url: string) {
  console.log(`\n🔍 Scraping: ${url}`);

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const pageTitle = await page.title();
    console.log(`   Title: ${pageTitle}`);

    const raceData = await page.evaluate(() => {
      const pageTitle = document.title;
      const trackMatch = pageTitle.match(/([A-Za-z\s]+?)\s+Race\s+(\d+)/i);

      if (!trackMatch) return null;

      const track = trackMatch[1].trim();
      const raceNum = parseInt(trackMatch[2]);
      const formCard: Record<number, string> = {};

      // Extract from table rows
      const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 25);
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const barrierText = cells[0]?.textContent?.trim() || '';
          const nameText = cells[1]?.textContent?.trim() || '';

          const isValidBarrier = !!barrierText.match(/^\d{1,2}$/);
          const isValidLength = nameText.length > 2 && nameText.length < 50;

          if (isValidBarrier && isValidLength) {
            const lowerName = nameText.toLowerCase();
            const isNotHeader = !(
              lowerName.includes('foaled') || lowerName.includes('sire') ||
              lowerName.includes('dam') || lowerName.includes('breeder') ||
              lowerName.includes('trainer') || lowerName.includes('jockey') ||
              lowerName.includes('colours') || lowerName.includes('barrier')
            );

            if (isNotHeader && nameText.match(/^[A-Za-z]/)) {
              formCard[parseInt(barrierText)] = nameText;
            }
          }
        }
      });

      return { track, raceNum, formCard };
    });

    if (raceData) {
      console.log(`   ✓ ${raceData.track} R${raceData.raceNum}`);
      console.log(`   Horses: ${Object.keys(raceData.formCard).length}`);

      // Check for target horses
      const formCardStr = JSON.stringify(raceData.formCard).toLowerCase();
      for (const horse of TARGET_HORSES) {
        if (formCardStr.includes(horse.toLowerCase())) {
          console.log(`     ✓ Found: ${horse}`);
          // Find barrier
          for (const [barrier, name] of Object.entries(raceData.formCard)) {
            if (name.toLowerCase().includes(horse.toLowerCase())) {
              console.log(`       Barrier: ${barrier}`);
            }
          }
        }
      }

      // Print all horses
      console.log(`   All horses:`);
      for (const [barrier, name] of Object.entries(raceData.formCard).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
        console.log(`     ${barrier}: ${name}`);
      }
    }

    await browser.close();
    return raceData;
  } catch (err) {
    console.error(`   Error: ${err}`);
    try {
      await browser.close();
    } catch {}
    return null;
  }
}

async function main() {
  console.log('🐴 SCRAPING SPORTSBET FORM URLs\n');
  console.log(`Target horses: ${TARGET_HORSES.join(', ')}`);

  for (const url of urls) {
    await scrapeRace(url);
  }

  console.log('\n✅ Scraping complete\n');
}

main().catch(console.error);
