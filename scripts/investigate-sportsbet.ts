#!/usr/bin/env node
/**
 * Investigate Sportsbet Form page structure to find all 126 races
 */

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function investigate() {
  console.log('\n🔍 Investigating Sportsbet Form page structure...\n');

  let browser;
  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    
    // Capture network requests
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('sportsbetform') || req.url().includes('api')) {
        requests.push(req.url());
      }
    });

    console.log('[1] Loading page...');
    await page.goto('https://www.sportsbetform.com.au/', { 
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    console.log(`[2] Captured ${requests.length} network requests`);
    console.log('\nAPI/Data requests:');
    requests.filter(r => r.includes('api') || r.includes('data')).slice(0, 10).forEach(r => console.log(`  ${r}`));

    console.log('\n[3] Analyzing page structure...');
    
    const analysis = await page.evaluate(() => {
      const info: any = {
        totalLinks: 0,
        raceLinks: 0,
        trackSections: 0,
        tabs: 0,
        tables: 0,
        grids: 0,
        containers: 0,
      };

      // Count different element types
      info.totalLinks = document.querySelectorAll('a').length;
      info.raceLinks = Array.from(document.querySelectorAll('a')).filter((a: any) => 
        a.href.includes('sportsbetform') && a.href.includes('/form/')
      ).length;

      // Look for structural containers
      info.trackSections = document.querySelectorAll('[class*="track"], [class*="race"], [class*="card"]').length;
      info.tabs = document.querySelectorAll('[role="tab"], [class*="tab"]').length;
      info.tables = document.querySelectorAll('table').length;
      info.grids = document.querySelectorAll('[class*="grid"], [class*="flex"], [class*="row"]').length;
      info.containers = document.querySelectorAll('[class*="container"], [class*="section"]').length;

      return info;
    });

    console.log('\nPage structure:');
    Object.entries(analysis).forEach(([key, val]) => {
      console.log(`  ${key}: ${val}`);
    });

    console.log('\n[4] Checking for pagination or load-more buttons...');
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, a[role="button"]'))
        .map((b: any) => ({
          text: b.textContent?.trim().substring(0, 50),
          class: b.className,
        }))
        .filter(b => b.text && b.text.toLowerCase().includes(
          'load' || 'more' || 'next' || 'page' || 'show'
        ))
        .slice(0, 10);
    });

    if (buttons.length > 0) {
      console.log('Found potential load/pagination buttons:');
      buttons.forEach(b => console.log(`  "${b.text}" (class: ${b.class})`));
    } else {
      console.log('No load/pagination buttons found');
    }

    console.log('\n[5] Checking page height and content visibility...');
    const pageInfo = await page.evaluate(() => {
      return {
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        bodyHeight: document.body.scrollHeight,
        visibleRaces: Array.from(document.querySelectorAll('a'))
          .filter((a: any) => a.href.includes('sportsbetform') && a.href.includes('/form/'))
          .filter((a: any) => {
            const rect = a.getBoundingClientRect();
            return rect.height > 0 && rect.width > 0;
          }).length,
      };
    });

    console.log(`  Scroll height: ${pageInfo.scrollHeight}px`);
    console.log(`  Client height: ${pageInfo.clientHeight}px`);
    console.log(`  Visible race links: ${pageInfo.visibleRaces}`);

    // Try scrolling to bottom slowly and check if content loads
    console.log('\n[6] Testing slow scroll to load lazy content...');
    let lastCount = 0;
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, document.documentElement.scrollHeight / 10);
      });
      await new Promise(r => setTimeout(r, 500));

      const currentCount = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).filter((a: any) =>
          a.href.includes('sportsbetform') && a.href.includes('/form/')
        ).length;
      });

      if (currentCount !== lastCount) {
        console.log(`  Scroll ${i + 1}: Found ${currentCount} race links (new: +${currentCount - lastCount})`);
        lastCount = currentCount;
      }
    }

    await browser.close();

    console.log('\n' + '='.repeat(60));
    console.log('Next: Check if website requires login or has time-based filtering\n');

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

investigate();
