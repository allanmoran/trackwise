#!/usr/bin/env node
/**
 * Debug script to inspect Racing.com DOM structure
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function debugDOM() {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    const url = 'https://www.racing.com/todays-racing';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait a bit for JS to render
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get page HTML
    const html = await page.content();

    // Save to file for inspection
    const fs = await import('fs');
    fs.writeFileSync('/tmp/racing-dom.html', html);
    console.log('✓ HTML saved to /tmp/racing-dom.html');

    // Check for common race indicators
    const indicators = await page.evaluate(() => {
      const data: Record<string, any> = {};

      // Check for specific text patterns
      const bodyText = document.body.innerText;
      data.hasRaces = bodyText.includes('Race') || bodyText.includes('race');
      data.hasTrack = bodyText.includes('Track') || bodyText.includes('track');
      data.hasTime = /\d{1,2}:\d{2}/.test(bodyText);

      // Count elements
      data.totalElements = document.querySelectorAll('*').length;
      data.divCount = document.querySelectorAll('div').length;
      data.tableCount = document.querySelectorAll('table').length;
      data.sectionCount = document.querySelectorAll('section').length;
      data.articleCount = document.querySelectorAll('article').length;

      // Look for specific class patterns
      const classPatterns = new Set<string>();
      document.querySelectorAll('[class*="race"], [class*="meeting"], [class*="card"]').forEach(el => {
        const classes = el.className || '';
        if (classes) classPatterns.add(classes.split(' ')[0]);
      });

      data.classPatterns = Array.from(classPatterns).slice(0, 10);

      // Get first few divs with specific classes
      data.sampleDivClasses = Array.from(document.querySelectorAll('div[class]'))
        .slice(0, 5)
        .map(el => ({ tag: el.tagName, class: el.className.substring(0, 50), text: el.innerText.substring(0, 50) }));

      // Check for data attributes
      const dataAttrs = new Set<string>();
      document.querySelectorAll('[data-*]').forEach(el => {
        Object.keys(el.attributes).forEach(key => {
          const attr = el.attributes[key];
          if (attr.name.startsWith('data-')) {
            dataAttrs.add(attr.name);
          }
        });
      });
      data.dataAttributes = Array.from(dataAttrs).slice(0, 10);

      return data;
    });

    console.log('\n=== Page Indicators ===');
    console.log(JSON.stringify(indicators, null, 2));

    // Try to find any text that looks like race info
    const raceText = await page.evaluate(() => {
      const results: string[] = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent?.trim() || '';
        if (text.match(/race\s*\d+|r\d+|race time|starting price|field|horse/i)) {
          results.push(text.substring(0, 100));
        }
      }
      return results.slice(0, 10);
    });

    console.log('\n=== Race-Related Text Found ===');
    raceText.forEach(text => console.log(`  "${text}"`));

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
    if (browser) await browser.close();
  }
}

debugDOM();
