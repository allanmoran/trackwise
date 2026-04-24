#!/usr/bin/env node
/**
 * Scrape Today's Sportsbet Results
 * Fetches today's races, scrapes results, and compares with KB picks
 *
 * Usage: npx tsx scripts/scrape-today-results.ts
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

interface TrackRace {
  track: string;
  trackId: string;
  raceNum: number;
  time: string;
  url: string;
}

interface RaceResult {
  position: number;
  horseName: string;
  placing: 'WIN' | 'PLACE' | 'LOSS';
}

interface RaceAnalysis {
  track: string;
  raceNum: number;
  time: string;
  finished: boolean;
  results: RaceResult[];
  kbPick?: { horse: string; strikeRate: number; tier: string };
  accuracy?: boolean;
  confidence?: number;
}

async function getTodayRaces(): Promise<TrackRace[]> {
  console.log('\n🏇 Fetching today\'s Sportsbet races...\n');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://www.sportsbetform.com.au/', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null);

    await new Promise(r => setTimeout(r, 1500));

    const races = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a'));
      const races = new Map<string, any[]>();

      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link as HTMLAnchorElement).textContent?.trim() || '';

        if (/\d{2}:\d{2}/.test(text)) {
          const match = href.match(/sportsbetform\.com\.au\/(\d+)\/(\d+)/);
          if (match) {
            const [, trackId, raceId] = match;

            if (!races.has(trackId)) {
              races.set(trackId, []);
            }

            races.get(trackId)!.push({
              trackId,
              raceId,
              time: text,
              url: href,
            });
          }
        }
      }

      return Array.from(races.values()).flat();
    });

    await browser.close();

    if (races.length === 0) {
      console.log('❌ No races found\n');
      return [];
    }

    const trackMap: Record<string, string> = {
      '435971': 'Cranbourne',
      '435950': 'Darwin',
      '435960': 'Gatton',
      '435967': 'Geelong',
      '435954': 'Gold Coast',
      '435951': 'Launceston',
      '435955': 'Murray Bridge',
      '435956': 'Tamworth',
      '435957': 'Wellington',
      '435973': 'Sandown',
      '435968': 'Moonee Valley',
      '435969': 'Caulfield',
      '435970': 'Flemington',
      '435974': 'Bendigo',
    };

    const enhancedRaces: TrackRace[] = races.map((r: any) => ({
      track: trackMap[r.trackId] || `Track ${r.trackId}`,
      trackId: r.trackId,
      raceNum: parseInt(r.raceId) || 1,
      time: r.time,
      url: r.url,
    }));

    console.log(`✅ Found ${enhancedRaces.length} races today\n`);

    // Group and display by track
    const byTrack = new Map<string, TrackRace[]>();
    for (const race of enhancedRaces) {
      if (!byTrack.has(race.track)) {
        byTrack.set(race.track, []);
      }
      byTrack.get(race.track)!.push(race);
    }

    for (const [track, races] of Array.from(byTrack.entries()).sort()) {
      console.log(`  📍 ${track}: ${races.map(r => `R${r.raceNum} (${r.time})`).join(', ')}`);
    }
    console.log();

    return enhancedRaces;
  } catch (err) {
    console.error(`❌ Failed to fetch races: ${err}`);
    if (browser) await browser.close();
    return [];
  }
}

async function scrapeRaceResults(url: string): Promise<{ finished: boolean; results: RaceResult[] }> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);

    await new Promise(r => setTimeout(r, 1500));

    const { finished, results } = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const isFinished = bodyText.includes('Result') || bodyText.includes('RESULT') || bodyText.includes('Finished') || bodyText.includes('WIN');

      const horses: RaceResult[] = [];

      // Strategy 1: Look for result rows in tables and lists
      const rows = document.querySelectorAll('tr, li, div[class*="result"], div[class*="finishing"], div[class*="position"]');

      for (const row of rows) {
        const text = row.textContent || '';
        if (text.length < 5) continue; // Skip short text

        // Match various position formats: "1st", "1.", "1 -", etc.
        const posMatch = text.match(/^[\s]*(1st|2nd|3rd|4th|5th|\d+(?:st|nd|rd|th)|[1-5][\s\.\-])/i);
        if (posMatch) {
          const posStr = posMatch[1];
          let position = 1;

          if (posStr.match(/1/)) position = 1;
          else if (posStr.match(/2/)) position = 2;
          else if (posStr.match(/3/)) position = 3;
          else if (posStr.match(/4/)) position = 4;
          else if (posStr.match(/5/)) position = 5;

          // Extract horse name more flexibly
          let horseName = '';
          const cleanText = text.replace(/^[\s\d\.st\-ndrd]*/, '').trim();

          // Try to find horse name until we hit a number (form, odds, etc)
          const nameMatch = cleanText.match(/^([A-Za-z\s]+?)(?:[\s\d]|$)/);
          if (nameMatch) {
            horseName = nameMatch[1].trim();

            // Validate horse name (should have at least 3 chars, mostly letters)
            if (horseName.length >= 3 && /[a-zA-Z]/.test(horseName)) {
              const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';

              // Avoid duplicates
              if (!horses.some(h => h.horseName.toLowerCase() === horseName.toLowerCase())) {
                horses.push({
                  position,
                  horseName,
                  placing,
                });
              }
            }
          }
        }
      }

      return { finished: isFinished, results: horses };
    });

    await browser.close();
    return { finished, results };
  } catch (err) {
    if (browser) await browser.close();
    return { finished: false, results: [] };
  }
}

function getKBPick(track: string, raceNum: number): any | null {
  try {
    const pick = db.prepare(`
      SELECT h.name, h.strike_rate, COALESCE(
        CASE
          WHEN h.strike_rate > 0.20 THEN 'A'
          WHEN h.strike_rate > 0.15 THEN 'B'
          ELSE 'C'
        END, 'C'
      ) as tier
      FROM horses h
      WHERE h.strike_rate IS NOT NULL AND h.strike_rate > 0.10
      ORDER BY h.strike_rate DESC, h.name ASC
      LIMIT 1
    `).get();

    return pick || null;
  } catch (err) {
    return null;
  }
}

async function analyzeResults(races: TrackRace[]) {
  console.log('\n' + '='.repeat(70));
  console.log('🏁 SCRAPING TODAY\'S RESULTS\n');
  console.log('='.repeat(70) + '\n');

  let finished = 0;
  let unfinished = 0;
  let correctPicks = 0;
  const analysisResults: RaceAnalysis[] = [];

  for (const race of races) {
    process.stdout.write(`  ⏳ ${race.track} R${race.raceNum}... `);

    const { finished: isFinished, results } = await scrapeRaceResults(race.url);

    if (!isFinished) {
      console.log('⏳ NOT FINISHED');
      unfinished++;
      continue;
    }

    if (results.length === 0) {
      console.log('⚠️  NO RESULTS EXTRACTED');
      continue;
    }

    const winner = results.find(r => r.placing === 'WIN');
    const kbPick = getKBPick(race.track, race.raceNum);

    let accuracy = false;
    if (kbPick && winner) {
      const normalized1 = kbPick.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalized2 = winner.horseName.toLowerCase().replace(/[^a-z0-9]/g, '');
      accuracy = normalized1 === normalized2 ||
                 normalized1.includes(normalized2) ||
                 normalized2.includes(normalized1);
    }

    console.log(`✅ ${winner?.horseName || 'UNKNOWN'} won${accuracy ? ' ✓ CORRECT' : ''}`);

    if (accuracy) correctPicks++;
    finished++;

    analysisResults.push({
      track: race.track,
      raceNum: race.raceNum,
      time: race.time,
      finished: true,
      results,
      kbPick,
      accuracy,
    });

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 TODAY\'S RESULTS SUMMARY\n');
  console.log(`  🏁 Finished races: ${finished}/${races.length}`);
  console.log(`  ⏳ Unfinished races: ${unfinished}`);
  console.log(`  ✓ Correct KB picks: ${correctPicks}/${finished} (${finished > 0 ? ((correctPicks / finished) * 100).toFixed(1) : 0}%)`);

  if (analysisResults.length > 0) {
    console.log('\n📋 Race Results:\n');
    for (const result of analysisResults) {
      const winner = result.results.find(r => r.placing === 'WIN');
      console.log(`  ${result.track} R${result.raceNum} (${result.time})`);
      console.log(`    Winner: ${winner?.horseName || 'Unknown'}`);
      if (result.kbPick) {
        console.log(`    KB Pick: ${result.kbPick.name} (${(result.kbPick.strike_rate * 100).toFixed(1)}% SR, Tier ${result.kbPick.tier})`);
        console.log(`    Result: ${result.accuracy ? '✓ CORRECT' : '✗ MISS'}`);
      }
      console.log();
    }
  }

  console.log('='.repeat(70) + '\n');
}

async function main() {
  try {
    const races = await getTodayRaces();

    if (races.length === 0) {
      console.log('❌ No races found for today\n');
      process.exit(1);
    }

    await analyzeResults(races);

    console.log('✅ Results scraping complete\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
