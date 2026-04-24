#!/usr/bin/env node
/**
 * Parse form card data - accepts Sportsbet Form HTML and extracts runner details
 * Better confidence calculation based on form analysis
 *
 * Usage: npx tsx scripts/parse-form-card.ts <url>
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export interface Runner {
  number: number;
  horseName: string;
  barrier?: number;
  weight?: number;
  formString?: string; // "1-2-3-4"
  speedRating?: number;
  jockey?: string;
  trainer?: string;
  odds?: number;
  confidence?: number;
}

export interface FormCard {
  track: string;
  raceNum: number;
  distance: string;
  raceType: string;
  trackCondition: string;
  runners: Runner[];
}

/**
 * Calculate confidence from form analysis
 * Factors: recent wins, form trend, barrier, weight
 */
function calculateFormConfidence(runner: Runner): number {
  let confidence = 50; // Base

  // Form line scoring
  if (runner.formString) {
    const positions = runner.formString.split('-').map(p => {
      // Handle letters (W=1, P=2, L=3)
      if (p.toUpperCase() === 'W') return 1;
      if (p.toUpperCase() === 'P') return 2;
      if (p.toUpperCase() === 'L') return 3;
      return parseInt(p) || 3;
    });

    // Recent form trend
    const last3 = positions.slice(0, 3);
    const avgRecent = last3.reduce((a, b) => a + b, 0) / last3.length;

    // Win = 35, Place = 25, 3rd = 15, 4th+ = 5
    const formScore = positions.length > 0 ? (6 - avgRecent) * 8 : 0;
    confidence += Math.min(formScore, 40);

    // Improvement trend (going backwards or forwards)
    if (positions.length >= 2) {
      const trend = positions[positions.length - 1] - positions[0];
      if (trend < -1) confidence += 10; // Improving trend
      else if (trend > 1) confidence -= 10; // Declining trend
    }
  }

  // Barrier (1-3 excellent, 4-6 good, 7+ average)
  if (runner.barrier) {
    if (runner.barrier <= 3) confidence += 15;
    else if (runner.barrier <= 6) confidence += 10;
    else confidence += 5;
  }

  // Weight (lighter preferred: < 54kg excellent, 54-58 good, 58+ average)
  if (runner.weight) {
    if (runner.weight < 54) confidence += 12;
    else if (runner.weight < 58) confidence += 8;
    else confidence += 3;
  }

  // Speed rating if available
  if (runner.speedRating && runner.speedRating > 70) {
    confidence += (runner.speedRating - 70) * 0.2; // +0.2 per point above 70
  }

  return Math.min(Math.max(confidence, 10), 100);
}

/**
 * Extract runners from Sportsbet form HTML
 */
async function extractRunnersFromSportsbet(url: string): Promise<FormCard | null> {
  let browser: puppeteer.Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    }).catch(() => null);

    await new Promise(r => setTimeout(r, 2000));

    // Extract all text and parse
    const pageData = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return { text, html: document.body.innerHTML };
    });

    const lines = pageData.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Extract race info
    let track = 'Unknown';
    let raceNum = 0;
    let distance = '';
    let raceType = '';
    let trackCondition = 'Good';

    for (const line of lines) {
      // Track name
      if (track === 'Unknown' && /^[A-Z][a-z\s]+$/.test(line) && line.length > 4 && line.length < 40) {
        track = line;
      }

      // Race number
      if (raceNum === 0 && /[Rr]ace\s+(\d+)|R(\d+)/.test(line)) {
        const match = line.match(/[Rr]ace\s+(\d+)|R(\d+)/);
        raceNum = match ? parseInt(match[1] || match[2]) : 0;
      }

      // Distance
      if (!distance && /(\d+)m(?:\s+|$)/.test(line)) {
        const match = line.match(/(\d+)m/);
        distance = match ? `${match[1]}m` : '';
      }

      // Track condition
      if (/(Firm|Good|Soft|Heavy|Yielding)/.test(line)) {
        const match = line.match(/(Firm|Good|Soft|Heavy|Yielding)/);
        trackCondition = match ? match[1] : 'Good';
      }

      // Race type
      if (/(Maiden|Class|Handicap|Benchmark)/.test(line)) {
        const match = line.match(/(Maiden|Class [0-9]|Handicap|Benchmark)/);
        raceType = match ? match[1] : '';
      }
    }

    // Parse runners - look for barrier numbers and horse names
    const runners: Runner[] = [];
    let runnerNum = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Look for barrier number (1-20 followed by horse name)
      const barrierMatch = line.match(/^(\d{1,2})\s+/);
      if (barrierMatch) {
        const barrier = parseInt(barrierMatch[1]);

        if (barrier > 0 && barrier <= 20) {
          runnerNum++;

          // Extract runner info from this and following lines
          const horseName = line.replace(/^\d{1,2}\s+/, '').trim();

          let weight: number | undefined;
          let formString: string | undefined;
          let jockey: string | undefined;
          let odds: number | undefined;

          // Look ahead for weight, form, odds
          for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
            const nextLine = lines[j];

            // Weight (xx.x kg format)
            if (!weight && /(\d{2})\.(5|0)/.test(nextLine)) {
              const m = nextLine.match(/(\d{2})\.([50])/);
              if (m) weight = parseFloat(`${m[1]}.${m[2]}`);
            }

            // Form string (W-P-L-3-1 or similar)
            if (!formString && /^[WPL\d\-]{3,}$/.test(nextLine.toUpperCase())) {
              formString = nextLine.toUpperCase();
            }

            // Odds (decimal)
            if (!odds && /^\d+\.\d{2}$/.test(nextLine)) {
              odds = parseFloat(nextLine);
            }

            // Jockey (capital letters only)
            if (!jockey && /^[A-Z][A-Z\s]{2,}$/.test(nextLine) && nextLine.length < 40) {
              jockey = nextLine;
            }
          }

          const runner: Runner = {
            number: runnerNum,
            horseName,
            barrier,
            weight,
            formString,
            jockey,
            odds,
          };

          runner.confidence = calculateFormConfidence(runner);
          runners.push(runner);
        }
      }
    }

    if (runners.length < 3) {
      console.log(`⚠ Only found ${runners.length} runners, parsing may be incomplete`);
    }

    const formCard: FormCard = {
      track,
      raceNum,
      distance,
      raceType,
      trackCondition,
      runners: runners.slice(0, 20), // Max 20 runners
    };

    return formCard;
  } catch (err) {
    console.error('Parse error:', err);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

// Test
async function test() {
  const url = process.argv[2] || 'https://www.sportsbetform.com.au/435638/3305869/';

  console.log(`[Form Parser] Parsing: ${url}\n`);

  const formCard = await extractRunnersFromSportsbet(url);

  if (formCard && formCard.runners.length > 0) {
    console.log(`✓ ${formCard.track} Race ${formCard.raceNum}`);
    console.log(`  Distance: ${formCard.distance}, Type: ${formCard.raceType}, Track: ${formCard.trackCondition}\n`);

    console.log('Top picks by confidence:\n');

    formCard.runners
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 5)
      .forEach((r, i) => {
        console.log(
          `  ${i + 1}. ${r.horseName.padEnd(25)} [${r.barrier || '?'}] Weight:${r.weight || '?'} Form:${r.formString || '?'} Conf:${r.confidence?.toFixed(0)}%`
        );
      });

    console.log(`\n✓ Parsed ${formCard.runners.length} total runners`);
  } else {
    console.log('✗ Failed to parse form card');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  test();
}
