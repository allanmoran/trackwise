#!/usr/bin/env node
/**
 * Batch import race results from racing.com URLs
 * Usage: npx tsx scripts/batch-import-results.ts
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

interface RaceResult {
  track: string;
  raceNum: number;
  horse: string;
  result: 'WIN' | 'PLACE' | 'LOSS';
}

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomDelay() {
  return Math.floor(Math.random() * 4000) + 3000;
}

function parseTrackFromUrl(url: string): { track: string; raceNum: number } | null {
  // Extract from: https://www.racing.com/form/2026-04-10/southside-cranbourne/race/1
  const match = url.match(/\/form\/\d{4}-\d{2}-\d{2}\/(.+?)\/race\/(\d+)/);
  if (!match) return null;

  const trackSlug = match[1];
  const raceNum = parseInt(match[2]);

  // Convert slug to track name
  const trackMap: Record<string, string> = {
    'southside-cranbourne': 'Cranbourne',
    'darwin': 'Darwin',
    'gatton': 'Gatton',
    'geelong': 'Geelong',
    'gold-coast': 'Gold Coast',
    'launceston': 'Launceston',
    'murray-bridge': 'Murray Bridge',
    'tamworth': 'Tamworth',
    'wellington': 'Wellington',
  };

  const track = trackMap[trackSlug] || trackSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return { track, raceNum };
}

async function scrapeRaceResults(url: string): Promise<RaceResult[] | null> {
  let browser;
  try {
    console.log(`  🔍 Fetching: ${url}`);
    
    const parsed = parseTrackFromUrl(url);
    if (!parsed) {
      console.log(`  ❌ Could not parse track/race from URL`);
      return null;
    }

    const { track, raceNum } = parsed;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent: getRandomUserAgent(),
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (err) {
      console.log(`  ⏳ Navigation timeout or blocked`);
      return null;
    }

    await page.waitForTimeout(getRandomDelay());

    // Extract results from page
    const results = await page.evaluate(() => {
      const horses: Array<{ position: number; horseName: string }> = [];
      const text = document.body.innerText;
      const lines = text.split('\n');

      let position = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect position: "1st", "2nd", etc.
        const posMatch = line.match(/^(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b/i);
        if (posMatch) {
          const posStr = posMatch[1].toLowerCase();
          if (posStr === '1st') position = 1;
          else if (posStr === '2nd') position = 2;
          else if (posStr === '3rd') position = 3;
          else position = parseInt(posStr) || position + 1;

          // Next line or subsequent lines should have horse name
          // Look for pattern: "N. Horse Name (weight)"
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nextLine = lines[j].trim();
            const nameMatch = nextLine.match(/^\d+\.\s+([A-Za-z\s\-']+?)(?:\s*\(|$)/);
            if (nameMatch) {
              let horseName = nameMatch[1].trim();
              if (horseName && horseName.length > 2) {
                horses.push({ position, horseName });
                break;
              }
            }
          }
        }
      }

      return horses;
    });

    if (results.length === 0) {
      console.log(`  ⏳ No results found on page`);
      return null;
    }

    console.log(`  ✓ Found ${results.length} horses`);

    // Convert to RaceResult format
    const raceResults: RaceResult[] = results.map(r => ({
      track,
      raceNum,
      horse: r.horseName,
      result: r.position === 1 ? 'WIN' : r.position <= 3 ? 'PLACE' : 'LOSS',
    }));

    return raceResults;

  } catch (err) {
    console.log(`  ❌ Error: ${String(err).split('\n')[0]}`);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

async function submitResults(allResults: RaceResult[]) {
  try {
    const res = await fetch('http://localhost:3001/api/results/mark-kelly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: allResults }),
    });

    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Submission error:', err);
    return null;
  }
}

async function runBatchImport(urls: string[]) {
  console.log('\n🏇 BATCH IMPORT RACING.COM RESULTS\n');
  console.log(`Processing ${urls.length} URLs...\n`);

  const allResults: RaceResult[] = [];
  let successCount = 0;

  for (const url of urls) {
    const results = await scrapeRaceResults(url);
    if (results && results.length > 0) {
      allResults.push(...results);
      successCount++;
    }
    // Rate limit between requests
    await new Promise(r => setTimeout(r, getRandomDelay()));
  }

  console.log(`\n📊 Scraped ${successCount}/${urls.length} races\n`);

  if (allResults.length === 0) {
    console.log('❌ No results scraped. Exiting.\n');
    return;
  }

  console.log(`📤 Submitting ${allResults.length} results...\n`);
  const submitted = await submitResults(allResults);

  if (submitted && submitted.success) {
    console.log(`✅ SUCCESS\n`);
    console.log(`  Marked: ${submitted.marked} bets`);
    if (submitted.marked_bets) {
      submitted.marked_bets.forEach((b: string) => console.log(`    ${b}`));
    }
  } else {
    console.log(`❌ Submission failed\n`);
  }

  console.log();
}

// Test URLs
const testUrls = [
  'https://www.racing.com/form/2026-04-10/southside-cranbourne/race/1',
  'https://www.racing.com/form/2026-04-10/darwin/race/1',
  'https://www.racing.com/form/2026-04-10/gatton/race/5',
];

runBatchImport(testUrls).finally(() => sql.end());
