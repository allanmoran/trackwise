/**
 * Parallel Sportsbet Form Scraper
 * Optimized for speed: 5 concurrent browsers, batch conditions, optimized timeouts
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import db from '../db.js';
import { RacePredictor } from '../ml/predictor.js';
import fetch from 'node-fetch';

puppeteer.use(StealthPlugin());

export class ParallelSportsbetScraper {
  static browserPool = [];
  static maxConcurrent = 4;
  static trackConditionsCache = null;
  static conditionsCacheTime = 0;

  static async initBrowserPool() {
    console.log(`🚀 Initializing ${this.maxConcurrent} browser instances...`);
    for (let i = 0; i < this.maxConcurrent; i++) {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage', // Disable /dev/shm for faster startup
          '--disable-gpu'
        ],
      });
      this.browserPool.push({ browser, inUse: false });
    }
    console.log(`✅ Browser pool ready\n`);
  }

  static async getBrowser() {
    // Find available browser
    let available = this.browserPool.find(b => !b.inUse);
    
    // Wait for one to become available
    while (!available) {
      await new Promise(r => setTimeout(r, 100));
      available = this.browserPool.find(b => !b.inUse);
    }

    available.inUse = true;
    return available.browser;
  }

  static releaseBrowser(browser) {
    const entry = this.browserPool.find(b => b.browser === browser);
    if (entry) entry.inUse = false;
  }

  static async cacheTrackConditions() {
    const now = Date.now();
    if (this.trackConditionsCache && (now - this.conditionsCacheTime) < 600000) {
      return this.trackConditionsCache;
    }

    console.log('📡 Caching track conditions from Sportsbet...');
    
    let browser;
    try {
      browser = await this.getBrowser();
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(10000);

      await page.goto('https://www.sportsbetform.com.au/track-conditions/', 
        { waitUntil: 'networkidle1', timeout: 10000 }).catch(() => null);
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));

      const conditions = await page.evaluate(() => {
        const result = {};
        const pageText = document.body.innerText;
        const lines = pageText.split('\n').filter(l => l.trim().length > 0);

        for (const line of lines) {
          const parts = line.split('\t').map(p => p.trim());
          if (parts.length >= 3 && parts[0] && parts[2]) {
            const track = parts[0];
            const condMatch = parts[2].match(/(FIRM|GOOD|SOFT|HEAVY|MUDDY|FAST|WET|YIELDING|DEAD)/i);
            if (condMatch && track.length > 2) {
              result[track] = condMatch[1].toUpperCase();
            }
          }
        }
        return result;
      });

      await page.close();
      this.trackConditionsCache = conditions;
      this.conditionsCacheTime = now;
      console.log(`✅ Cached ${Object.keys(conditions).length} track conditions\n`);
      return conditions;
    } catch (err) {
      console.warn(`⚠️ Track conditions cache failed: ${err.message}`);
      return {};
    } finally {
      if (browser) this.releaseBrowser(browser);
    }
  }

  static async scrapeRace(url, trackConditions) {
    const browser = await this.getBrowser();
    try {
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(8000);

      // Reduced waits for speed
      await page.goto(url, { waitUntil: 'networkidle1', timeout: 8000 }).catch(() => null);
      await page.evaluate(() => new Promise(r => setTimeout(r, 800))); // Reduced from 3000

      const pageData = await page.evaluate(() => {
        // Runner extraction (same logic, optimized)
        const results = { runners: [], strategy: 'table', pageTitle: document.title };
        const pageText = document.body.innerText;

        // Fast table extraction
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td, th');
            if (cells.length >= 2) {
              const firstCell = cells[0]?.textContent?.trim();
              const secondCell = cells[1]?.textContent?.trim();
              const barrier = parseInt(firstCell);

              if (barrier > 0 && barrier < 30 && secondCell && secondCell.length > 2) {
                let odds = null;
                for (let i = cells.length - 1; i >= Math.max(0, cells.length - 3); i--) {
                  const parsed = parseFloat(cells[i]?.textContent?.trim());
                  if (!isNaN(parsed) && parsed >= 1.0 && parsed <= 999) {
                    odds = parsed;
                    break;
                  }
                }

                results.runners.push({
                  barrier,
                  horse: secondCell,
                  odds
                });
              }
            }
          }
        }

        // Extract race info
        const header = pageText.match(/([A-Za-z\s]+)\s+\d{1,2}:\d{2}\s+\d+m/);
        const distance = pageText.match(/(\d+)\s*[mM]etres?/);
        const raceClass = pageText.match(/(HANDICAP|3YO|2YO|MAIDEN|CLASS|STAKE)/i);

        return {
          runners: results.runners,
          distance: distance ? parseInt(distance[1]) : null,
          raceClass: raceClass ? raceClass[1] : 'Unknown'
        };
      });

      await page.close();

      // Use cached conditions
      const track = url.split('/')[4]; // Would need proper extraction
      const condition = trackConditions[this.extractTrackName(url)] || null;

      return { success: true, data: pageData, condition };
    } catch (err) {
      console.warn(`⚠️ Race scrape error: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      this.releaseBrowser(browser);
    }
  }

  static extractTrackName(url) {
    // Parse from URL - would need meeting ID to track mapping
    return 'Unknown';
  }

  static async scrapeMultipleRaces(urls) {
    await this.initBrowserPool();
    const conditions = await this.cacheTrackConditions();

    console.log(`🚀 Processing ${urls.length} races with ${this.maxConcurrent} browsers\n`);
    const startTime = Date.now();

    // Process in concurrent batches
    const results = [];
    for (let i = 0; i < urls.length; i += this.maxConcurrent) {
      const batch = urls.slice(i, i + this.maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(url => this.scrapeRace(url, conditions))
      );
      results.push(...batchResults);

      const processed = Math.min(i + this.maxConcurrent, urls.length);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ ${processed}/${urls.length} races processed (${elapsed}s)`);
    }

    // Close all browsers
    for (const { browser } of this.browserPool) {
      await browser.close();
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgTime = (totalTime / urls.length).toFixed(1);
    console.log(`\n📊 Completed: ${results.filter(r => r.success).length}/${urls.length} in ${totalTime}s (${avgTime}s/race avg)\n`);

    return results;
  }

  static async closeBrowserPool() {
    for (const { browser } of this.browserPool) {
      await browser.close();
    }
    this.browserPool = [];
  }
}

export default ParallelSportsbetScraper;
