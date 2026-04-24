#!/usr/bin/env node
/**
 * Scrape all race URLs to extract form card data (barriers + horses)
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load all URLs from file
const urlFile = path.join(__dirname, 'all-race-urls.txt');
const urlContent = fs.readFileSync(urlFile, 'utf-8');
const allUrls = urlContent.split('\n').filter(u => u.trim()).slice(0, 100); // First 100 for efficiency

interface RaceData {
  trackId: string;
  raceId: string;
  url: string;
  horses: Record<number, string>;
}

async function scrapeRace(url: string): Promise<RaceData | null> {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();

  try {
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

    const [trackId, raceId] = url.split('/').filter(x => x && x.match(/^\d+$/)).slice(-2);

    // Extract horse data from table - get first 2 columns only (Barrier, Name)
    const horses = await page.evaluate(() => {
      const result: Record<number, string> = {};
      const rows = document.querySelectorAll('table tbody tr');

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const barrierText = cells[0]?.textContent?.trim() || '';
          const nameText = cells[1]?.textContent?.trim() || '';

          // Parse barrier as 2-digit number
          const barrierMatch = barrierText.match(/(\d{1,2})/);
          if (barrierMatch) {
            const barrier = parseInt(barrierMatch[1]);

            // Valid barrier number and reasonable horse name length
            if (barrier > 0 && barrier < 30 && nameText.length > 2 && nameText.length < 50) {
              // Filter out headers and metadata
              const lowerName = nameText.toLowerCase();
              if (!lowerName.includes('day') &&
                  !lowerName.includes('start') &&
                  !lowerName.includes('trial') &&
                  !lowerName.includes('barrier') &&
                  !lowerName.includes('name') &&
                  !lowerName.includes('trainer') &&
                  !lowerName.includes('jockey') &&
                  nameText.match(/^[A-Za-z\s\-']/)) {  // Starts with letter
                result[barrier] = nameText;
              }
            }
          }
        }
      });

      return result;
    });

    await browser.close();

    if (Object.keys(horses).length > 0) {
      return { trackId, raceId, url, horses };
    }
  } catch (err) {
    console.error(`Error scraping ${url}:`, (err as Error).message);
  }

  try {
    await browser.close();
  } catch {}
  return null;
}

async function main() {
  console.log(`📋 Scraping ${allUrls.length} race URLs...\n`);

  const races: RaceData[] = [];
  let processed = 0;

  for (const url of allUrls) {
    if (races.length >= 30) break;

    const race = await scrapeRace(url);
    if (race) {
      console.log(`✓ Track ${race.trackId}, Race ${race.raceId}: ${Object.keys(race.horses).length} horses`);
      races.push(race);
    } else {
      console.log(`✗ Failed: ${url}`);
    }

    processed++;
    if (processed % 10 === 0) {
      console.log(`  [${processed}/${allUrls.length} processed, ${races.length} valid races]\n`);
    }
  }

  console.log(`\n✅ Extracted ${races.length} races\n`);

  // Build formData object
  const formData: Record<string, Record<number, Record<number, string>>> = {};

  races.forEach(race => {
    const trackId = race.trackId;
    if (!formData[trackId]) {
      formData[trackId] = {};
    }

    // Extract race number from raceId (heuristic: use modulo or count)
    const raceNum = Object.keys(formData[trackId]).length + 1;
    formData[trackId][raceNum] = race.horses;
  });

  // Write to file
  const output = `// Auto-generated form card data from ${races.length} races\n// Track ID => Race # => Barrier => Horse Name\n\nexport const formData = ${JSON.stringify(formData, null, 2)};`;

  fs.writeFileSync('form-data-output.ts', output);
  console.log('Saved to form-data-output.ts\n');

  // Also save full race data for reference
  fs.writeFileSync('races-full.json', JSON.stringify(races, null, 2));
  console.log('Full race data saved to races-full.json');

  console.log('\n=== FORM CARD SUMMARY ===');
  Object.entries(formData).forEach(([trackId, races]) => {
    console.log(`Track ${trackId}: ${Object.keys(races).length} races`);
    Object.entries(races).forEach(([raceNum, horses]) => {
      console.log(`  R${raceNum}: ${Object.keys(horses).length} runners`);
    });
  });
}

main().catch(console.error);
