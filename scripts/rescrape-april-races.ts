#!/usr/bin/env node
/**
 * Rescrape April 11-12 races from Sportsbet Form
 * Get form cards for all races with pending bets
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

// April 11-12 races with bets in database
const APRIL_12_TRACKS_WITH_BETS = ['Alice Springs', 'Ascot', 'Ballina', 'Bowen', 'Caulfield', 'Geraldton'];

// Date URLs for bulk scraping
const APRIL_11_URL = 'https://www.sportsbetform.com.au/2026-04-11/';
const APRIL_12_URL = 'https://www.sportsbetform.com.au/2026-04-12/';

const TARGET_HORSES = ['Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace'];

async function scrapeFormCardsFromDate(dateUrl: string, dateStr: string): Promise<Record<string, Record<number, Record<number, string>>>> {
  console.log(`\n🔍 Scraping ${dateStr} races from ${dateUrl}`);

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const formCards: Record<string, Record<number, Record<number, string>>> = {};

  try {
    await page.goto(dateUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Get all race links for this date
    const raceLinks = await page.evaluate(() => {
      const links: string[] = [];
      const anchors = document.querySelectorAll('a[href]');

      anchors.forEach(a => {
        const href = a.getAttribute('href') || '';
        if (href.includes('sportsbetform.com.au') && href.match(/\/\d{7}\/$/)) {
          if (!links.includes(href)) links.push(href);
        }
      });

      return links;
    });

    console.log(`Found ${raceLinks.length} race links\n`);

    let racesFound = 0;

    for (const raceUrl of raceLinks.slice(0, 100)) {
      try {
        const racePage = await browser.newPage();
        await racePage.goto(raceUrl, { waitUntil: 'networkidle2', timeout: 20000 });

        const raceData = await racePage.evaluate(() => {
          const pageTitle = document.title;
          const trackMatch = pageTitle.match(/([A-Za-z\s]+?)\s+Race\s+(\d+)/i);

          if (!trackMatch) return null;

          const track = trackMatch[1].trim();
          const raceNum = parseInt(trackMatch[2]);
          const formCard: Record<number, string> = {};

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

          return { track, raceNum, formCard, pageTitle };
        });

        if (raceData && Object.keys(raceData.formCard).length > 0) {
          if (!formCards[raceData.track]) formCards[raceData.track] = {};
          formCards[raceData.track][raceData.raceNum] = raceData.formCard;

          // Check for target horses
          const formCardStr = JSON.stringify(raceData.formCard).toLowerCase();
          const hasTarget = TARGET_HORSES.some(h => formCardStr.includes(h.toLowerCase()));
          const symbol = hasTarget ? '✓' : ' ';

          console.log(`${symbol} ${raceData.pageTitle}`);
          racesFound++;
        }

        await racePage.close();
      } catch (err) {
        // Silently skip failed races
      }
    }

    console.log(`\n✅ Scraped ${racesFound} races for ${dateStr}`);

    await browser.close();
  } catch (err) {
    console.error(`Error scraping ${dateStr}:`, err);
    await browser.close();
  }

  return formCards;
}

async function main() {
  console.log('🐴 RESCRAPING APRIL 11-12 RACES\n');
  console.log(`Target horses: ${TARGET_HORSES.join(', ')}`);

  const allFormCards: Record<string, Record<string, Record<number, Record<number, string>>>> = {};

  // Scrape both dates
  allFormCards['2026-04-11'] = await scrapeFormCardsFromDate(APRIL_11_URL, 'April 11');
  allFormCards['2026-04-12'] = await scrapeFormCardsFromDate(APRIL_12_URL, 'April 12');

  // Save combined
  fs.writeFileSync('/tmp/all-form-cards.json', JSON.stringify(allFormCards, null, 2));
  console.log('\n📁 Saved to /tmp/all-form-cards.json');

  // Count results
  let totalTracks = 0, totalRaces = 0;
  for (const dateData of Object.values(allFormCards)) {
    for (const trackRaces of Object.values(dateData)) {
      totalTracks++;
      totalRaces += Object.keys(trackRaces).length;
    }
  }

  console.log(`\n📊 Summary: ${totalTracks} tracks, ${totalRaces} races scraped`);
}

main().catch(console.error);
