#!/usr/bin/env node
/**
 * Debug Sportsbet results page structure
 */

import puppeteer from 'puppeteer';

async function debugPage() {
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    // Test Taree R1 (first race)
    const url = 'https://www.sportsbetform.com.au/435958/3308276/';
    console.log(`\n📍 Debugging: ${url}\n`);

    await page.goto(url, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Get full page HTML
    const html = await page.content();
    const bodyText = await page.evaluate(() => document.body.innerText);

    // Look for result indicators
    const resultPatterns = [
      /winning|result|winner|1st|2nd|3rd|place/gi,
      /[0-9]\s*\-\s*[a-z]/gi,
      /position|finishing/gi
    ];

    console.log('📄 Page Title:', await page.title());
    console.log('\n📝 Searching for result keywords in body text...\n');

    const lines = bodyText.split('\n').slice(0, 100);
    let foundResults = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of resultPatterns) {
        if (pattern.test(line)) {
          console.log(`Line ${i}: ${line}`);
          foundResults = true;
        }
      }
    }

    if (!foundResults) {
      console.log('❌ No result-like content found in first 100 lines');
      console.log('\n🔍 Showing first 50 lines of page text:\n');
      console.log(lines.slice(0, 50).join('\n'));
    }

    // Check for specific DOM structures
    const resultElements = await page.evaluate(() => {
      return {
        tables: document.querySelectorAll('table').length,
        resultDivs: document.querySelectorAll('[class*="result"]').length,
        finishingDivs: document.querySelectorAll('[class*="finish"]').length,
        allDivs: document.querySelectorAll('div').length
      };
    });

    console.log('\n📊 DOM Structure:');
    console.log(JSON.stringify(resultElements, null, 2));

  } finally {
    await browser.close();
  }
}

debugPage().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
