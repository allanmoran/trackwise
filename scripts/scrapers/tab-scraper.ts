/**
 * TAB.com.au scraper for race form data
 * Extracts: horse name, jockey, trainer, barrier, weight, odds
 */

import puppeteer, { Browser } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BaseScraper, RunnerData, RaceDataScraped } from './base-scraper';

puppeteer.use(StealthPlugin());

export class TabScraper extends BaseScraper {
  source = 'TAB';
  private browser: Browser | null = null;

  async scrapeRace(url: string): Promise<RaceDataScraped | null> {
    try {
      if (!this.browser) {
        this.browser = await puppeteer.launch({ headless: true });
      }
      const page = await this.browser.newPage();

      console.log(`[TAB] Fetching ${url}...`);
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 20000,
      }).catch(() => null);

      await new Promise(r => setTimeout(r, 2000)); // Wait for JS rendering

      // Extract race metadata and runners
      const raceData = await page.evaluate(() => {
        // Get race info from URL or page
        const urlParts = window.location.pathname.match(/\/(\d{4}-\d{2}-\d{2})\/([A-Z\s\-]+)\/([A-Z]+)\/R\/(\d+)/);
        let track = 'UNKNOWN';
        let raceNum = 0;

        if (urlParts) {
          track = urlParts[2]?.trim() || 'UNKNOWN';
          raceNum = parseInt(urlParts[4] || '0');
        }

        const runners: any[] = [];

        // Try multiple selector strategies
        const strategies = [
          // Strategy 1: Look for runner rows with data attributes
          () => {
            const rows = document.querySelectorAll('[data-testid*="runner"], [class*="runner"], tr[data-tab]');
            return Array.from(rows)
              .map(row => {
                const nameEl = row.querySelector('[class*="name"]') || row.querySelector('td:nth-child(1)');
                const jockeyEl = row.querySelector('[class*="jockey"]') || row.querySelector('td:nth-child(3)');
                const trainerEl = row.querySelector('[class*="trainer"]') || row.querySelector('td:nth-child(4)');
                const oddsEl = row.querySelector('[class*="odds"], [class*="price"]') || row.querySelector('td:last-child');

                return {
                  name: nameEl?.textContent?.trim(),
                  jockey: jockeyEl?.textContent?.trim(),
                  trainer: trainerEl?.textContent?.trim(),
                  odds: parseFloat(oddsEl?.textContent || '0'),
                };
              })
              .filter(r => r.name && r.name.length > 2 && r.odds > 0);
          },

          // Strategy 2: Look for any text containing horse info patterns
          () => {
            const allText = document.body.innerText;
            const lines = allText.split('\n');
            const candidates: any[] = [];

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              const oddsMatch = line.match(/\d+\.\d+/);
              if (oddsMatch && line.length > 10 && line.length < 200) {
                const odds = parseFloat(oddsMatch[0]);
                if (odds > 1 && odds < 50) {
                  // This might be a runner line
                  const namePart = line.split(/\d+\.\d+/)[0].trim();
                  if (namePart.length > 2) {
                    candidates.push({
                      name: namePart,
                      odds: odds,
                      rawLine: line,
                    });
                  }
                }
              }
            }
            return candidates;
          },

          // Strategy 3: Table-based extraction
          () => {
            const rows = document.querySelectorAll('table tr');
            return Array.from(rows)
              .slice(1) // Skip header
              .map(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return null;
                return {
                  name: cells[0]?.textContent?.trim(),
                  jockey: cells.length > 2 ? cells[2]?.textContent?.trim() : undefined,
                  trainer: cells.length > 3 ? cells[3]?.textContent?.trim() : undefined,
                  odds: parseFloat(cells[cells.length - 1]?.textContent || '0'),
                };
              })
              .filter(r => r && r.name && r.name.length > 2);
          },
        ];

        // Try all strategies and combine results
        let extractedRunners: any[] = [];
        for (const strategy of strategies) {
          try {
            const results = strategy();
            if (results && results.length > 3) {
              extractedRunners = results.filter(r => r.odds > 0 && r.odds < 50);
              break; // Use first successful strategy
            }
          } catch (e) {
            // Continue to next strategy
          }
        }

        return { track, raceNum, runners: extractedRunners };
      });

      const normalizedRunners: RunnerData[] = [];
      const seen = new Set<string>();

      for (const runner of raceData.runners || []) {
        if (!runner.name) continue;
        const normalized = await this.normalizeHorseName(runner.name);
        if (!seen.has(normalized) && normalized.length > 2) {
          seen.add(normalized);
          normalizedRunners.push({
            name: normalized,
            jockey: runner.jockey,
            trainer: runner.trainer,
            odds: runner.odds,
            source: this.source,
          });
        }
      }

      await page.close();

      if (normalizedRunners.length < 3) {
        console.log(`[TAB] ⚠ Only ${normalizedRunners.length} runners found`);
        return null;
      }

      return {
        track: raceData.track,
        raceNum: raceData.raceNum,
        raceName: `${raceData.track} R${raceData.raceNum}`,
        runners: normalizedRunners,
        scrapedAt: new Date(),
      };
    } catch (err) {
      console.error(`[TAB] Error scraping ${url}:`, err);
      return null;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => null);
      this.browser = null;
    }
  }
}
