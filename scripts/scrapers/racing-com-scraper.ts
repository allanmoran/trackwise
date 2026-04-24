/**
 * racing.com scraper for race form data
 * Extracts: horse name, jockey, trainer, barrier, weight, odds
 */

import puppeteer, { Browser } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BaseScraper, RunnerData, RaceDataScraped } from './base-scraper';

puppeteer.use(StealthPlugin());

export class RacingComScraper extends BaseScraper {
  source = 'Racing.com';
  private browser: Browser | null = null;

  async scrapeRace(url: string): Promise<RaceDataScraped | null> {
    try {
      if (!this.browser) {
        this.browser = await puppeteer.launch({ headless: true });
      }
      const page = await this.browser.newPage();

      console.log(`[Racing.com] Fetching ${url}...`);
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 20000,
      }).catch(() => null);

      await new Promise(r => setTimeout(r, 2000)); // Wait for JS rendering

      // Extract race metadata and runners
      const raceData = await page.evaluate(() => {
        // Get race info from URL
        const urlParts = window.location.pathname.match(/\/form\/(\d{4}-\d{2}-\d{2})\/([a-z-]+)\/race\/(\d+)/);
        const track = urlParts?.[2]?.toUpperCase().replace(/-/g, ' ') || 'UNKNOWN';
        const raceNum = parseInt(urlParts?.[3] || '0');

        const runners: any[] = [];

        // Try multiple selector strategies specific to racing.com
        const strategies = [
          // Strategy 1: Racing.com uses entrant cards/rows
          () => {
            const entrants = document.querySelectorAll('[class*="entrant"], [class*="runner"], [data-testid*="entrant"]');
            return Array.from(entrants)
              .map(el => {
                const text = el.textContent || '';
                const nameMatch = text.match(/^([A-Z][A-Z\s'-]{2,30}?)(?:\s+\(|\s+\d|\s+[A-Z]{2}|$)/);
                const oddsMatch = text.match(/(\d+\.\d+)\s*(?:$|\n|\/)/);
                const jockeyMatch = text.match(/Jockey[:\s]+([A-Z][A-Za-z\s'-]+?)(?:\n|$)/);
                const trainerMatch = text.match(/Trainer[:\s]+([A-Z][A-Za-z\s'-]+?)(?:\n|$)/);

                return {
                  name: nameMatch?.[1]?.trim(),
                  odds: oddsMatch ? parseFloat(oddsMatch[1]) : undefined,
                  jockey: jockeyMatch?.[1]?.trim(),
                  trainer: trainerMatch?.[1]?.trim(),
                };
              })
              .filter(r => r.name && r.odds && r.odds > 1);
          },

          // Strategy 2: Parse table structure
          () => {
            const rows = document.querySelectorAll('table tr, [role="row"]');
            return Array.from(rows)
              .map(row => {
                const cells = row.querySelectorAll('td, [role="cell"]');
                if (cells.length < 2) return null;

                return {
                  name: cells[0]?.textContent?.trim(),
                  jockey: cells.length > 3 ? cells[3]?.textContent?.trim() : undefined,
                  trainer: cells.length > 4 ? cells[4]?.textContent?.trim() : undefined,
                  odds: parseFloat(cells[cells.length - 1]?.textContent || '0'),
                };
              })
              .filter(r => r && r.name && r.odds && r.odds > 1);
          },

          // Strategy 3: Text-based extraction for form lines
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
                  const parts = line.split(/\d+\.\d+/);
                  const namePart = parts[0].trim();
                  if (namePart.length > 2 && /^[A-Z]/.test(namePart)) {
                    candidates.push({
                      name: namePart,
                      odds: odds,
                    });
                  }
                }
              }
            }
            return candidates;
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
            jockey: runner.jockey,
            trainer: runner.trainer,
            odds: runner.odds,
            source: this.source,
          });
        }
      }

      await page.close();

      if (normalizedRunners.length < 3) {
        console.log(`[Racing.com] ⚠ Only ${normalizedRunners.length} runners found`);
        return null;
      }

      return {
        track,
        raceNum,
        raceName: `${track} R${raceNum}`,
        runners: normalizedRunners,
        scrapedAt: new Date(),
      };
    } catch (err) {
      console.error(`[Racing.com] Error scraping ${url}:`, err);
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
