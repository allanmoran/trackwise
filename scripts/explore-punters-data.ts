#!/usr/bin/env node
/**
 * Explore Punters.com.au data sources
 * Tests what data is available from:
 * - Free racing tips (expert picks)
 * - Form guide (horse/track stats)
 * - Odds comparison (multi-bookmaker odds)
 * - Forum (community consensus)
 */

import puppeteer from 'puppeteer';
import fs from 'fs';

const URLS = {
  tips: 'https://www.punters.com.au/free-racing-tips/',
  formGuide: 'https://www.punters.com.au/form-guide/',
  oddsComparison: 'https://www.punters.com.au/odds-comparison/horse-racing/',
  forum: 'https://www.punters.com.au/forum/horse-racing/',
};

async function explorePage(name: string, url: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    );

    console.log(`[${name}] Loading page...`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await new Promise(r => setTimeout(r, 2000));

    // Get page structure
    const pageData = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        headings: Array.from(document.querySelectorAll('h1, h2, h3'))
          .map(h => h.textContent?.trim())
          .slice(0, 10),
        tables: document.querySelectorAll('table').length,
        cards: document.querySelectorAll('[class*="card"], [class*="Card"]').length,
        lists: document.querySelectorAll('ul, ol').length,
        textSample: document.body.innerText.slice(0, 2000),
      };
    });

    console.log(`[${name}] Page Title: ${pageData.title}`);
    console.log(`[${name}] Tables found: ${pageData.tables}`);
    console.log(`[${name}] Card elements: ${pageData.cards}`);
    console.log(`[${name}] Lists found: ${pageData.lists}`);
    console.log(`[${name}] Headings (first 10):`);
    pageData.headings.forEach(h => console.log(`  - ${h}`));

    // Try to extract specific data based on page type
    const extractedData = await page.evaluate(() => {
      const data: any = {};

      // Try to find races/horses
      const horseNames = Array.from(document.querySelectorAll('[class*="horse"], [class*="runner"]'))
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .slice(0, 5);

      if (horseNames.length > 0) {
        data.horseNames = horseNames;
      }

      // Try to find odds
      const odds = Array.from(document.querySelectorAll('[class*="odds"], [class*="price"]'))
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .slice(0, 5);

      if (odds.length > 0) {
        data.odds = odds;
      }

      // Try to find tips/ratings
      const tips = Array.from(document.querySelectorAll('[class*="tip"], [class*="rating"], [class*="confidence"]'))
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .slice(0, 5);

      if (tips.length > 0) {
        data.tips = tips;
      }

      // Get all text content with structure
      const mainContent = document.body.innerText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 5 && line.length < 100)
        .slice(0, 20);

      data.mainContent = mainContent;

      return data;
    });

    console.log(`[${name}] Extracted Data:`);
    console.log(JSON.stringify(extractedData, null, 2));

    // Save raw HTML for inspection
    const html = await page.content();
    fs.writeFileSync(
      `/tmp/punters-${name}.html`,
      html
    );
    console.log(`[${name}] HTML saved to /tmp/punters-${name}.html (${html.length} bytes)`);

  } catch (err) {
    console.error(`[${name}] Error:`, err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('Exploring Punters.com.au Data Sources...\n');

  for (const [name, url] of Object.entries(URLS)) {
    await explorePage(name, url);
    await new Promise(r => setTimeout(r, 3000)); // Rate limit
  }

  console.log('\n' + '='.repeat(60));
  console.log('Exploration complete. HTML files saved to /tmp/punters-*.html');
  console.log('='.repeat(60));
}

main().catch(console.error);
