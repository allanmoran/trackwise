#!/usr/bin/env node
/**
 * Sportsbet Form Parser - Extract detailed form data for better predictions
 * Parses form guides with:
 * - Form lines (recent 4-5 races)
 * - Weight, barrier, class
 * - Speed ratings
 * - Track conditions
 * - Finishing positions
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export interface FormRace {
  horseName: string;
  barrier?: number;
  weight?: number;
  formLine?: string; // e.g., "1-2-3-4" representing last 4 runs
  speedRating?: number;
  classRating?: number;
  recentForm?: Array<{
    position: number;
    track: string;
    distance: number;
    surface: string;
    rating: number;
  }>;
  jockey?: string;
  trainer?: string;
  odds?: number;
}

export interface RaceCard {
  date: string;
  track: string;
  raceNum: number;
  distance?: number;
  raceClass?: string;
  trackCondition?: string;
  weather?: string;
  runners: FormRace[];
}

export class SportsbetFormParser {
  private browser: puppeteer.Browser | null = null;

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  /**
   * Parse a Sportsbet form guide URL
   * URL format: https://www.sportsbetform.com.au/[meeting-id]/[race-id]/
   */
  async parseFormGuide(url: string): Promise<RaceCard | null> {
    if (!this.browser) await this.initialize();

    const page = await this.browser!.newPage();
    page.setDefaultNavigationTimeout(30000);

    try {
      console.log(`[Sportsbet] Loading: ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      }).catch(() => console.log('[Sportsbet] Navigation timeout, continuing...'));

      await new Promise(r => setTimeout(r, 2000));

      // Extract race details
      const raceInfo = await page.evaluate(() => {
        const pageText = document.body.innerText || '';

        // Extract track name
        const trackMatch = pageText.match(/(?:at|@)\s+([A-Z][A-Za-z\s]+?)(?:\s+Race|\s+R\d|$)/);
        const track = trackMatch ? trackMatch[1].trim() : 'Unknown';

        // Extract race number
        const raceMatch = pageText.match(/Race\s+(\d+)|R(\d+)/);
        const raceNum = raceMatch ? parseInt(raceMatch[1] || raceMatch[2]) : 0;

        // Extract distance
        const distMatch = pageText.match(/(\d+)m\s+(?:Handicap|Maiden|Class)/);
        const distance = distMatch ? parseInt(distMatch[1]) : 0;

        // Extract race class
        const classMatch = pageText.match(/(Maiden|Class [1-6]|Benchmark|Handicap)/);
        const raceClass = classMatch ? classMatch[1] : 'Unknown';

        // Extract track condition
        const condMatch = pageText.match(/(Firm|Good|Soft|Heavy|Yielding|Turf|Dirt)/);
        const trackCondition = condMatch ? condMatch[1] : 'Unknown';

        return { track, raceNum, distance, raceClass, trackCondition };
      });

      // Extract runner details
      const runners = await page.evaluate(() => {
        const results: FormRace[] = [];

        // Get all runner rows (varies by page structure)
        const rows = Array.from(document.querySelectorAll(
          'tr[data-horse], .runner, [class*="horse"], [class*="runner"]'
        ));

        if (rows.length === 0) {
          // Fallback: parse text content
          const pageText = document.body.innerText;
          const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Look for horse name (capital letters)
            if (/^[A-Z][A-Z\s]{2,}$/.test(line) && line.length < 50) {
              const runner: FormRace = {
                horseName: line,
              };

              // Look ahead for barrier, weight, form
              for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                const nextLine = lines[j];

                // Barrier (usually single digit)
                if (/^\d$/.test(nextLine) && !runner.barrier) {
                  runner.barrier = parseInt(nextLine);
                }

                // Weight (format: 55.0, 56.5, etc)
                if (/^\d+\.\d$/.test(nextLine)) {
                  runner.weight = parseFloat(nextLine);
                }

                // Form line (1-2-3-4 pattern)
                if (/^[\d\-]+$/.test(nextLine) && nextLine.length < 10) {
                  runner.formLine = nextLine;
                }

                // Speed rating
                if (/^\d{2,3}$/.test(nextLine) && parseInt(nextLine) > 50 && parseInt(nextLine) < 150) {
                  runner.speedRating = parseInt(nextLine);
                }

                // Odds (decimal format)
                if (/^\d+\.\d{2}$/.test(nextLine)) {
                  runner.odds = parseFloat(nextLine);
                }
              }

              if (runner.horseName) {
                results.push(runner);
              }
            }
          }

          return results;
        }

        // Parse table rows
        rows.forEach(row => {
          const text = (row.textContent || '').trim();
          const cells = Array.from(row.querySelectorAll('td, div[class*="cell"]')).map(c => (c.textContent || '').trim());

          if (cells.length > 0 && cells[0].length > 0) {
            const runner: FormRace = {
              horseName: cells[0],
              barrier: cells[1] ? parseInt(cells[1]) : undefined,
              weight: cells[2] ? parseFloat(cells[2]) : undefined,
              formLine: cells[3], // e.g., "1-2-3"
              speedRating: cells[4] ? parseInt(cells[4]) : undefined,
            };

            results.push(runner);
          }
        });

        return results;
      });

      const raceCard: RaceCard = {
        date: new Date().toISOString().split('T')[0],
        track: raceInfo.track,
        raceNum: raceInfo.raceNum,
        distance: raceInfo.distance,
        raceClass: raceInfo.raceClass,
        trackCondition: raceInfo.trackCondition,
        runners: runners.filter(r => r.horseName && r.horseName.length > 2),
      };

      if (raceCard.runners.length < 3) {
        console.log(`[Sportsbet] ⚠ Only ${raceCard.runners.length} runners found`);
        return null;
      }

      console.log(`[Sportsbet] ✓ Extracted ${raceCard.runners.length} runners from ${raceCard.track} R${raceCard.raceNum}`);
      return raceCard;
    } catch (err) {
      console.error(`[Sportsbet] Error parsing ${url}:`, err);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Calculate confidence score from form data
   * Factors:
   * - Recent form (weighted towards recent races)
   * - Speed rating (higher = better)
   * - Class rating
   * - Barrier (lower = better)
   */
  static calculateConfidence(runner: FormRace): number {
    let score = 50; // Base score

    // Form line analysis (e.g., "1-2-3-4" or "3-1-2-5")
    if (runner.formLine) {
      const positions = runner.formLine.split('-').map(Number);
      const recentForm = positions.slice(0, 3); // Last 3 runs
      const avgPosition = recentForm.reduce((a, b) => a + b, 0) / recentForm.length;

      // Convert to confidence (1st = +20, 2nd = +15, 3rd = +10, 4th+ = +5)
      const formScore = positions.length > 0 ? (6 - avgPosition) * 5 : 0;
      score += Math.min(formScore, 30);
    }

    // Speed rating (normalize 50-150 range to 0-30 bonus)
    if (runner.speedRating) {
      const speedBonus = ((runner.speedRating - 50) / 100) * 30;
      score += Math.max(0, Math.min(speedBonus, 30));
    }

    // Barrier (lower is better: 1-3 good, 4-6 ok, 7+ bad)
    if (runner.barrier) {
      const barrierScore = Math.max(0, 10 - runner.barrier / 2);
      score += barrierScore;
    }

    // Weight (lighter is better for form)
    if (runner.weight) {
      const weightBonus = Math.max(0, (60 - runner.weight) * 0.5);
      score += Math.min(weightBonus, 10);
    }

    return Math.min(Math.max(score, 10), 100); // Clamp 10-100
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Test
async function test() {
  const parser = new SportsbetFormParser();
  await parser.initialize();

  try {
    const url = 'https://www.sportsbetform.com.au/435638/3305869/';
    const raceCard = await parser.parseFormGuide(url);

    if (raceCard) {
      console.log(`\n✓ Parsed: ${raceCard.track} R${raceCard.raceNum}`);
      console.log(`  Distance: ${raceCard.distance}m`);
      console.log(`  Class: ${raceCard.raceClass}`);
      console.log(`  Track: ${raceCard.trackCondition}`);
      console.log(`  Runners: ${raceCard.runners.length}\n`);

      raceCard.runners.slice(0, 5).forEach((r, i) => {
        const confidence = SportsbetFormParser.calculateConfidence(r);
        console.log(
          `  ${i + 1}. ${r.horseName.padEnd(25)} Barrier:${r.barrier || '?'} Weight:${r.weight || '?'} Form:${r.formLine || '?'} Speed:${r.speedRating || '?'} Confidence:${confidence.toFixed(0)}%`
        );
      });
    }
  } finally {
    await parser.close();
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  test();
}
