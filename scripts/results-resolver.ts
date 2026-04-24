#!/usr/bin/env node
/**
 * scripts/results-resolver.ts
 * Polls Racing.com for race results and auto-resolves paper bets
 * Usage: npm run results (runs continuously, polls every 60 seconds)
 */

import 'dotenv/config';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '', {
  idle_timeout: 30,
  max_lifetime: 60 * 30,
});

// ── Types ──────────────────────────────────────────────────────────────────
interface RaceResult {
  position: number;
  horseName: string;
  result: 'WIN' | 'PLACE' | 'LOSS'; // 1=WIN, 2-3=PLACE, 4+=LOSS
}

// ── Utilities ──────────────────────────────────────────────────────────────
function log(level: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [RESULTS-RESOLVER] ${level.padEnd(5)} ${msg}`);
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function fuzzyMatch(a: string, b: string): boolean {
  const aNorm = normaliseName(a);
  const bNorm = normaliseName(b);

  // Exact match
  if (aNorm === bNorm) return true;

  // Substring match (handles truncation)
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;

  // Levenshtein-ish: count matching characters
  const matches = Array.from(aNorm).filter(c => bNorm.includes(c)).length;
  return matches >= Math.min(aNorm.length, bNorm.length) * 0.7;
}

// ── Scrape Race Results ────────────────────────────────────────────────────
async function scrapeRaceResults(
  track: string,
  raceNum: number,
  date: string
): Promise<RaceResult[]> {
  let browser;
  try {
    const trackSlug = track.toLowerCase().replace(/\s+/g, '-');
    const url = `https://www.racing.com/form/${date}/${trackSlug}/race/${raceNum}`;

    log('INFO', `Checking results: ${url}`);

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1200 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);

    await new Promise(r => setTimeout(r, 1000));

    const results = await page.evaluate(() => {
      const results: RaceResult[] = [];

      // Look for finished race indicator (text "Result" or green checkmark, etc)
      const bodyText = document.body.innerText;
      const isFinished = bodyText.includes('Result') || bodyText.includes('RESULT') || bodyText.includes('Finished');

      if (!isFinished) {
        return results; // Race not finished yet
      }

      // Extract finishing positions from page
      // Look for elements with position and horse name
      const elements = Array.from(document.querySelectorAll('*'));

      elements.forEach(el => {
        const text = el.textContent || '';

        // Match pattern: "1. Horse Name" (first position)
        const posMatch = text.match(/^(\d+)\.\s+([^(]+)/);
        if (posMatch) {
          const position = parseInt(posMatch[1]);
          const name = posMatch[2].trim();

          if (position <= 20 && name.length > 1) {
            results.push({
              position,
              horseName: name,
              result: position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS',
            });
          }
        }
      });

      return results;
    });

    await browser.close();
    return results;
  } catch (err) {
    log('WARN', `Failed to scrape results for ${track} R${raceNum}: ${err}`);
    if (browser) await browser.close();
    return [];
  }
}

// ── Resolve Bets Against Results ───────────────────────────────────────────
async function resolveBets() {
  try {
    // Get unresolved bets for today
    const today = new Date().toISOString().split('T')[0];
    const unresolved = await sql`
      SELECT id, track, race_num, horse, win_stake, place_stake, stake
      FROM paper_bets
      WHERE date = ${today} AND result IS NULL
      LIMIT 50;
    `;

    if (unresolved.length === 0) {
      return; // No bets to resolve
    }

    log('INFO', `Resolving ${unresolved.length} pending bets`);

    let resolved = 0;
    for (const bet of unresolved) {
      // Scrape race results
      const results = await scrapeRaceResults(bet.track, bet.race_num, today);

      if (results.length === 0) {
        continue; // Race not finished yet
      }

      // Find matching horse in results
      const horseResult = results.find(r => fuzzyMatch(r.horseName, bet.horse));

      if (horseResult) {
        // Calculate P&L
        let pl = 0;
        const odds = (await sql`SELECT odds FROM paper_bets WHERE id = ${bet.id}`)[0]?.odds || 2;

        if (horseResult.result === 'WIN') {
          pl = parseFloat(String(bet.win_stake)) * (parseFloat(String(odds)) - 1);
        } else if (horseResult.result === 'PLACE') {
          pl = parseFloat(String(bet.place_stake)) * ((parseFloat(String(odds)) - 1) / 4);
        } else {
          pl = -parseFloat(String(bet.stake));
        }

        // Update bet with result
        await sql`
          UPDATE paper_bets
          SET result = ${horseResult.result}, pl = ${pl.toFixed(2)}, result_time = now()
          WHERE id = ${bet.id}
        `;

        log('INFO', `✓ ${bet.track} R${bet.race_num} - ${bet.horse}: ${horseResult.result} (${horseResult.position}/${results.length}) → $${pl.toFixed(2)}`);
        resolved++;
      }
    }

    if (resolved > 0) {
      log('INFO', `Resolved ${resolved} bets`);
    }
  } catch (err) {
    log('ERROR', `Resolution loop failed: ${err}`);
  }
}

// ── Main Loop ──────────────────────────────────────────────────────────────
async function main() {
  log('INFO', 'Results Resolver starting...');
  log('INFO', 'Polling for race results every 60 seconds');
  log('INFO', 'Press Ctrl+C to stop');

  // Initial check
  await resolveBets();

  // Poll every 60 seconds
  setInterval(resolveBets, 60000);
}

main().catch(e => {
  log('ERROR', `Fatal error: ${e}`);
  process.exit(1);
});

process.on('SIGINT', async () => {
  log('INFO', 'Shutting down...');
  await sql.end();
  process.exit(0);
});
