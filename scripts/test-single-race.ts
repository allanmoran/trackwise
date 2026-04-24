#!/usr/bin/env node
/**
 * Test scraping a single URL to debug extraction
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function testRace(url: string) {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();

  try {
    console.log(`Testing URL: ${url}\n`);
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

    // Get page title and headers
    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`Page Title: ${pageTitle}`);
    console.log(`Final URL: ${pageUrl}\n`);

    // Get raw HTML snippet of table
    const tableHtml = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      return {
        rowCount: rows.length,
        firstRows: Array.from(rows).slice(0, 5).map((row, i) => ({
          index: i,
          cells: Array.from(row.querySelectorAll('td')).map(c => c.textContent?.trim() || '')
        }))
      };
    });

    console.log('Table Structure:');
    console.log(JSON.stringify(tableHtml, null, 2));

    // Get all horse names found
    const horses = await page.evaluate(() => {
      const result: string[] = [];
      const rows = document.querySelectorAll('table tbody tr');

      rows.forEach((row, idx) => {
        const cells = row.querySelectorAll('td');
        const fullText = Array.from(cells).map(c => c.textContent?.trim()).join(' | ');
        result.push(`Row ${idx}: ${fullText}`);
      });

      return result;
    });

    console.log('\nAll rows:');
    horses.slice(0, 20).forEach(h => console.log(h));
    if (horses.length > 20) {
      console.log(`... and ${horses.length - 20} more rows`);
    }

    // Search for target horses directly
    const pageText = await page.evaluate(() => document.body.innerText);
    const targets = ['Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace'];

    console.log('\nTarget horse search:');
    targets.forEach(target => {
      if (pageText.includes(target)) {
        console.log(`✓ FOUND: "${target}"`);
      } else {
        console.log(`✗ NOT FOUND: "${target}"`);
      }
    });

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
    try {
      await browser.close();
    } catch {}
  }
}

// Test Gundagai URL from user (should contain all 5 horses)
testRace('https://www.sportsbetform.com.au/436044/3308967/');
