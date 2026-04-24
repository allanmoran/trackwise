#!/usr/bin/env node
/**
 * Debug Racing.com page structure
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function debug() {
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    const url = 'https://www.racing.com/form/2026-04-09/gosford/race/1';
    console.log(`\n📍 Debugging: ${url}\n`);

    await page.goto(url, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    const bodyText = await page.evaluate(() => document.body.innerText);
    const lines = bodyText.split('\n').slice(0, 150);

    console.log('📄 First 150 lines of page:\n');
    for (let i = 0; i < lines.length; i++) {
      console.log(`${String(i + 1).padStart(3)}: ${lines[i]}`);
    }

    console.log('\n🔍 DOM element counts:');
    const counts = await page.evaluate(() => {
      return {
        tables: document.querySelectorAll('table').length,
        rows: document.querySelectorAll('tr').length,
        results: document.querySelectorAll('[class*="result"]').length,
        finish: document.querySelectorAll('[class*="finish"]').length,
        position: document.querySelectorAll('[class*="position"]').length,
      };
    });
    console.log(JSON.stringify(counts, null, 2));

  } finally {
    await browser.close();
  }
}

debug().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
