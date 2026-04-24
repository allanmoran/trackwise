/**
 * Sportsbet form guide scraper + PDF extractor
 * Auto-extracts racing form data from Sportsbet form guides
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import fetch from 'node-fetch';

puppeteer.use(StealthPlugin());

export interface FormGuideRace {
  track: string;
  raceNum: number;
  time: string;
  distance: string;
  raceClass: string;
  runners: Array<{
    name: string;
    jockey?: string;
    trainer?: string;
    weight?: string;
    barrier?: string;
    odds?: number;
    form?: string;
  }>;
}

export class SportsbetFormScraper {
  private browser: puppeteer.Browser | null = null;

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  /**
   * Scrape a specific form guide page
   */
  async scrapeFormGuide(url: string): Promise<FormGuideRace | null> {
    if (!this.browser) await this.initialize();

    const page = await this.browser!.newPage();
    page.setDefaultNavigationTimeout(30000);

    try {
      console.log(`[Sportsbet] Loading form guide: ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      }).catch(() => console.log('Navigation timeout, continuing...'));

      // Wait for content and click "Full Form" if available
      await page.waitForTimeout(2000);

      try {
        await page.click('a:contains("Full Form"), button:contains("Full Form"), [href*="full"]');
        await page.waitForTimeout(2000);
      } catch {
        console.log('[Sportsbet] No "Full Form" button found, using current view');
      }

      // Extract race info from title
      const title = await page.title();
      const raceMatch = title.match(/(\w+)\s+Race\s+(\d+)/);
      const [track, raceNum] = raceMatch
        ? [raceMatch[1].toUpperCase(), parseInt(raceMatch[2])]
        : ['UNKNOWN', 0];

      // Extract horse form data
      const horses = await page.evaluate(() => {
        const runners: any[] = [];
        const allText = document.body.innerText;
        const lines = allText.split('\n').map(l => l.trim()).filter(l => l);

        // Look for horse name patterns followed by form/odds data
        // Typical pattern: HORSE NAME | BARRIER | WEIGHT | JOCKEY | TRAINER | FORM | ODDS
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Look for odds (decimal numbers 1.50 - 99.00)
          const oddsMatch = line.match(/(\d+\.\d+)/);
          if (oddsMatch) {
            const odds = parseFloat(oddsMatch[1]);
            if (odds > 1 && odds < 100) {
              // Extract horse name (usually before odds)
              const namePart = line.split(/\d+\.\d+/)[0].trim();

              if (namePart.length > 2 && namePart.length < 50 && /^[A-Z]/.test(namePart)) {
                // Try to extract jockey/trainer from nearby lines
                let jockey, trainer, form, barrier, weight;

                // Look backward and forward for related data
                for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 5); j++) {
                  const contextLine = lines[j];
                  if (contextLine.includes('Jockey') || contextLine.match(/^[A-Z\s]+$/) && contextLine.length < 30) {
                    jockey = contextLine.split(':')[1]?.trim() || contextLine;
                  }
                  if (contextLine.includes('Trainer')) {
                    trainer = contextLine.split(':')[1]?.trim() || contextLine;
                  }
                  if (contextLine.match(/^[0-9]+$/) && contextLine.length < 3) {
                    barrier = contextLine;
                  }
                  if (contextLine.includes('kg')) {
                    weight = contextLine;
                  }
                }

                runners.push({
                  name: namePart,
                  jockey,
                  trainer,
                  barrier,
                  weight,
                  odds,
                });
              }
            }
          }
        }

        return runners;
      });

      // Deduplicate runners
      const uniqueRunners = Array.from(
        new Map(horses.map(r => [r.name, r])).values()
      );

      if (uniqueRunners.length < 3) {
        console.log(`[Sportsbet] ⚠ Only ${uniqueRunners.length} runners found`);
        return null;
      }

      const result: FormGuideRace = {
        track,
        raceNum,
        time: 'TBD',
        distance: 'TBD',
        raceClass: 'TBD',
        runners: uniqueRunners,
      };

      console.log(`[Sportsbet] ✓ Extracted ${uniqueRunners.length} runners from ${track} R${raceNum}`);
      return result;
    } catch (err) {
      console.error(`[Sportsbet] Error scraping ${url}:`, err);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Find and download available PDFs from form guide page
   */
  async findAndDownloadPDFs(url: string, outputDir: string = '/tmp'): Promise<string[]> {
    if (!this.browser) await this.initialize();

    const page = await this.browser!.newPage();

    try {
      console.log(`[Sportsbet] Looking for PDFs on ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      }).catch(() => null);

      // Find all PDF links
      const pdfLinks = await page.evaluate(() => {
        const links: string[] = [];
        document.querySelectorAll('a[href*=".pdf"], a[href*="pdf"]').forEach(a => {
          const href = a.getAttribute('href');
          if (href) links.push(href);
        });
        return links;
      });

      const downloadedPDFs: string[] = [];

      for (const link of pdfLinks.slice(0, 5)) {
        // Limit to first 5 PDFs
        try {
          const fullUrl = link.startsWith('http') ? link : new URL(link, url).href;
          const filename = link.split('/').pop() || 'form-guide.pdf';
          const filepath = `${outputDir}/${filename}`;

          console.log(`[Sportsbet] Downloading: ${filename}`);

          const response = await fetch(fullUrl);
          const buffer = await response.buffer();
          fs.writeFileSync(filepath, buffer);

          downloadedPDFs.push(filepath);
          console.log(`[Sportsbet] ✓ Saved: ${filepath}`);
        } catch (err) {
          console.error(`[Sportsbet] Failed to download PDF:`, err);
        }
      }

      return downloadedPDFs;
    } catch (err) {
      console.error(`[Sportsbet] Error finding PDFs:`, err);
      return [];
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Test
async function test() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║    SPORTSBET FORM SCRAPER TEST         ║');
  console.log('╚════════════════════════════════════════╝\n');

  const scraper = new SportsbetFormScraper();
  await scraper.initialize();

  try {
    // Test scraping a form guide
    const url = 'https://www.sportsbetform.com.au/435605/3305564/';
    const race = await scraper.scrapeFormGuide(url);

    if (race) {
      console.log(`\n✓ Scraped: ${race.track} R${race.raceNum}`);
      console.log(`  Runners: ${race.runners.length}`);
      race.runners.slice(0, 3).forEach((r, i) => {
        console.log(
          `    ${i + 1}. ${r.name} @$${r.odds} (${r.jockey || 'N/A'})`
        );
      });
    }

    // Test finding PDFs
    const pdfs = await scraper.findAndDownloadPDFs('https://www.sportsbetform.com.au/');
    console.log(`\n✓ Found ${pdfs.length} PDFs`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await scraper.close();
  }
}

test();
