/**
 * Sportsbet.com.au scraper for race form data
 * Extracts: horse name, odds from meeting pages
 */

import puppeteer, { Browser } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BaseScraper, RunnerData, RaceDataScraped } from './base-scraper';

puppeteer.use(StealthPlugin());

export class SportsbetScraper extends BaseScraper {
  source = 'Sportsbet';
  private browser: Browser | null = null;

  async scrapeRace(url: string): Promise<RaceDataScraped | null> {
    try {
      if (!this.browser) {
        this.browser = await puppeteer.launch({ headless: true });
      }
      const page = await this.browser.newPage();

      console.log(`[Sportsbet] Fetching ${url}...`);
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 20000,
      }).catch(() => null);

      await new Promise(r => setTimeout(r, 2000)); // Wait for JS rendering

      // Extract race metadata and runners from Sportsbet meeting page
      const raceData = await page.evaluate(() => {
        // Get track from URL or page title
        const urlParts = window.location.pathname.match(/\/horse-racing\/australia-nz\/([\w-]+)/);
        const trackSlug = urlParts?.[1] || '';
        const track = trackSlug.toUpperCase().replace(/-/g, ' ');

        const runners: any[] = [];

        // Sportsbet structure: usually market cards with horse odds
        const strategies = [
          // Strategy 1: Look for market/race cards
          () => {
            const cards = document.querySelectorAll('[class*="market"], [class*="race"], [class*="card"]');
            const results: any[] = [];

            for (const card of cards) {
              const text = card.textContent || '';

              // Look for horse name + odds pattern
              const lines = text.split('\n').map(l => l.trim()).filter(l => l);

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const oddsMatch = line.match(/(\d+\.\d+)/);

                if (oddsMatch) {
                  const odds = parseFloat(oddsMatch[1]);
                  // Horse name is usually before the odds
                  const namePart = line.split(/\d+\.\d+/)[0].trim();

                  if (namePart.length > 2 && namePart.length < 50 && odds > 1 && odds < 50) {
                    results.push({
                      name: namePart,
                      odds: odds,
                    });
                  }
                }
              }
            }
            return results;
          },

          // Strategy 2: Text-based parsing for all odds on page
          () => {
            const allText = document.body.innerText;
            const lines = allText.split('\n');
            const results: any[] = [];
            const seen = new Set<string>();

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              const oddsMatch = line.match(/(\d+\.\d+)/);

              if (oddsMatch && line.length > 5 && line.length < 100) {
                const odds = parseFloat(oddsMatch[1]);
                if (odds > 1 && odds < 50) {
                  const namePart = line.split(/\d+\.\d+/)[0].trim();

                  if (
                    namePart.length > 2 &&
                    namePart.length < 50 &&
                    /^[A-Z]/.test(namePart) &&
                    !seen.has(namePart)
                  ) {
                    seen.add(namePart);
                    results.push({
                      name: namePart,
                      odds: odds,
                    });
                  }
                }
              }
            }
            return results;
          },

          // Strategy 3: Look for table-like structures
          () => {
            const rows = document.querySelectorAll('[role="row"], tr');
            return Array.from(rows)
              .map(row => {
                const text = row.textContent || '';
                const oddsMatch = text.match(/(\d+\.\d+)/);
                if (!oddsMatch) return null;

                const namePart = text.split(/\d+\.\d+/)[0].trim();
                return {
                  name: namePart,
                  odds: parseFloat(oddsMatch[1]),
                };
              })
              .filter(r => r && r.name && r.name.length > 2 && r.odds && r.odds > 1);
          },
        ];

        // Try all strategies
        for (const strategy of strategies) {
          try {
            const results = strategy();
            if (results && results.length > 3) {
              return results;
            }
          } catch (e) {
            // Continue to next strategy
          }
        }

        return [];
      });

      const normalizedRunners: RunnerData[] = [];
      const seen = new Set<string>();

      for (const runner of raceData) {
        if (!runner.name) continue;
        const normalized = await this.normalizeHorseName(runner.name);
        if (!seen.has(normalized) && normalized.length > 2) {
          seen.add(normalized);
          normalizedRunners.push({
            name: normalized,
            odds: runner.odds,
            source: this.source,
          });
        }
      }

      await page.close();

      if (normalizedRunners.length < 3) {
        console.log(`[Sportsbet] ⚠ Only ${normalizedRunners.length} runners found`);
        return null;
      }

      return {
        track,
        raceNum: 0, // Sportsbet meeting page doesn't have race numbers, we'll need to filter
        raceName: `${track}`,
        runners: normalizedRunners,
        scrapedAt: new Date(),
      };
    } catch (err) {
      console.error(`[Sportsbet] Error scraping ${url}:`, err);
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
