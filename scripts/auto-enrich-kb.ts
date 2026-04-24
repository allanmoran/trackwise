#!/usr/bin/env node
/**
 * Auto-enrich KB with jockey/trainer data from RaceNet
 *
 * Workflow:
 * 1. Get all "Unknown" jockey/trainer races from KB (from Betfair import)
 * 2. For each race, scrape RaceNet for the same track/date/race_num
 * 3. Match horses and extract jockey/trainer data
 * 4. Update KB with enriched data
 *
 * Usage: npx tsx scripts/auto-enrich-kb.ts [--days=7]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

import postgres from 'postgres';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const sql = postgres(process.env.DATABASE_URL || '');

interface RaceNetRunner {
  name: string;
  jockey?: string;
  trainer?: string;
  barrier?: string;
  weight?: string;
  odds?: number;
}

interface BetfairRace {
  date: string;
  track: string;
  race_num: number;
  runners: Array<{ horseName: string; jockey: string; trainer: string }>;
}

const RACENET_BASE = 'https://www.racenet.com.au/form-guide/horse-racing';

// Track name mapping (Betfair → RaceNet format)
const TRACK_MAPPING: Record<string, string> = {
  'Albion Park': 'albion-park',
  'Menangle': 'menangle',
  'Mildura': 'mildura',
  'Sale': 'sale',
  'Ascot': 'ascot',
  'Hawkesbury': 'hawkesbury',
  'Pinjarra Park': 'pinjarra',
};

async function scrapeRaceNetRace(
  track: string,
  date: string,
  raceNum: number,
  browser: puppeteer.Browser
): Promise<RaceNetRunner[] | null> {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30000);

  try {
    // Format: YYYY-MM-DD → DD-MM-YYYY for RaceNet
    const [year, month, day] = date.split('-');
    const formattedDate = `${day}-${month}-${year}`;

    const racenetTrack = TRACK_MAPPING[track] || track.toLowerCase().replace(/\s+/g, '-');
    const url = `${RACENET_BASE}/${racenetTrack}/${formattedDate}/race-${raceNum}`;

    console.log(`  🔍 Scraping: ${url}`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch(() => null);

    // Wait for content to load
    await new Promise(r => setTimeout(r, 2000));

    // Extract runner data from RaceNet page
    const runners = await page.evaluate(() => {
      const results: RaceNetRunner[] = [];

      // RaceNet typically has runner rows with horse name, jockey, trainer
      // Try multiple selectors to handle different page layouts
      const selectors = [
        'tr[data-horse-id]', // Modern RaceNet
        'div[class*="runner"]', // Alternative layout
        'div[class*="horse"]', // Generic
      ];

      for (const selector of selectors) {
        const rows = document.querySelectorAll(selector);
        if (rows.length > 0) {
          rows.forEach(row => {
            const text = row.innerText || row.textContent || '';
            const horseName = text.match(/^([A-Z\s]+)/)?.[1]?.trim();

            if (horseName && horseName.length > 2 && horseName.length < 50) {
              // Extract jockey (usually after horse name)
              const jockeyMatch = text.match(/Jockey[:\s]+([A-Za-z\s]+)/i) ||
                                 text.split('\n')[1]?.match(/^[A-Za-z\s]+$/);
              const jockey = jockeyMatch ? (jockeyMatch[1] || jockeyMatch[0]).trim() : undefined;

              // Extract trainer
              const trainerMatch = text.match(/Trainer[:\s]+([A-Za-z&\s]+)/i);
              const trainer = trainerMatch ? trainerMatch[1].trim() : undefined;

              if (jockey || trainer) {
                results.push({
                  name: horseName,
                  jockey,
                  trainer,
                });
              }
            }
          });

          if (results.length > 0) break;
        }
      }

      return results;
    });

    if (runners.length > 0) {
      console.log(`    ✓ Found ${runners.length} runners on RaceNet`);
      return runners;
    }

    // Fallback: Extract from page HTML as plain text
    const html = await page.content();
    const textContent = html
      .replace(/<[^>]*>/g, '\n')
      .split('\n')
      .filter(l => l.trim().length > 0);

    const altRunners: RaceNetRunner[] = [];
    for (let i = 0; i < textContent.length; i++) {
      const line = textContent[i].trim();

      // Look for jockey/trainer patterns
      if (line.match(/^[A-Z][a-z\s&]+$/) && line.length < 50) {
        const nextLines = textContent.slice(i + 1, i + 4).map(l => l.trim());
        const jockey = nextLines[0];
        const trainer = nextLines[1];

        if (jockey && trainer && jockey.length > 2 && trainer.length > 2) {
          const horseName = line;
          altRunners.push({
            name: horseName,
            jockey,
            trainer,
          });
        }
      }
    }

    if (altRunners.length > 0) {
      console.log(`    ✓ Found ${altRunners.length} runners via text parsing`);
      return altRunners;
    }

    console.log(`    ⚠ No runners found for ${track} R${raceNum} on ${date}`);
    return null;
  } catch (err) {
    console.log(`    ⚠ Error scraping ${track} R${raceNum}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    await page.close();
  }
}

function normalizeHorseName(name: string): string {
  return name.toUpperCase().trim().replace(/\s+/g, ' ');
}

function matchHorses(betfairName: string, raceNetRunners: RaceNetRunner[]): RaceNetRunner | null {
  const normalized = normalizeHorseName(betfairName);

  // Exact match
  const exact = raceNetRunners.find(r => normalizeHorseName(r.name) === normalized);
  if (exact) return exact;

  // Partial match (first 3+ words)
  const betfairWords = normalized.split(' ');
  if (betfairWords.length > 0) {
    const prefix = betfairWords.slice(0, Math.min(2, betfairWords.length)).join(' ');
    const partial = raceNetRunners.find(r => normalizeHorseName(r.name).startsWith(prefix));
    if (partial) return partial;
  }

  // Fuzzy match (at least 70% of characters match)
  const sorted = raceNetRunners
    .map(r => ({
      runner: r,
      score: calculateSimilarity(normalized, normalizeHorseName(r.name)),
    }))
    .filter(x => x.score > 0.7)
    .sort((a, b) => b.score - a.score);

  return sorted[0]?.runner || null;
}

function calculateSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1: string, s2: string): number {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

async function getUnenrichedRaces(daysBack: number = 7): Promise<BetfairRace[]> {
  // Get all recent races from kelly_logs (enrich all, not just Unknown)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const raceGroups = await sql<Array<{
    date: string;
    track: string;
    race_num: number;
    horse_name: string;
    jockey: string;
    trainer: string;
  }>>`
    SELECT DISTINCT date, track, race_num, horse_name, jockey, trainer
    FROM kelly_logs
    WHERE date >= ${cutoffStr}
    ORDER BY date DESC, track, race_num
  `;

  const result: BetfairRace[] = [];
  const raceMap = new Map<string, BetfairRace>();

  for (const entry of raceGroups) {
    const key = `${entry.date}-${entry.track}-${entry.race_num}`;

    if (!raceMap.has(key)) {
      raceMap.set(key, {
        date: entry.date,
        track: entry.track,
        raceNum: entry.race_num,
        runners: [],
      });
    }

    const race = raceMap.get(key)!;
    race.runners.push({
      horseName: entry.horse_name,
      jockey: entry.jockey,
      trainer: entry.trainer,
    });
  }

  return Array.from(raceMap.values());
}

async function updateRaceWithEnrichedData(
  race: BetfairRace,
  enrichedRunners: Map<string, { jockey: string; trainer: string }>
): Promise<number> {
  const raceId = `${race.date}-${race.track}-${race.raceNum}`;

  // Update runners with enriched data
  const updatedRunners = race.runners.map(runner => ({
    ...runner,
    ...(enrichedRunners.has(runner.horseName) && enrichedRunners.get(runner.horseName)),
  }));

  // Update manual_races
  await sql`
    UPDATE manual_races
    SET runners = ${sql.json(updatedRunners)}
    WHERE id = ${raceId}
  `;

  // Re-log to kelly_logs with enriched data
  let count = 0;
  for (const runner of updatedRunners) {
    if (enrichedRunners.has(runner.horseName)) {
      const enriched = enrichedRunners.get(runner.horseName)!;
      await sql`
        INSERT INTO kelly_logs (date, track, race_num, horse_name, jockey, trainer, confidence)
        VALUES (${race.date}, ${race.track}, ${race.raceNum}, ${runner.horseName}, ${enriched.jockey}, ${enriched.trainer}, 50)
        ON CONFLICT (date, track, race_num, horse_name) DO UPDATE SET
          jockey = EXCLUDED.jockey,
          trainer = EXCLUDED.trainer
      `;
      count++;
    }
  }

  return count;
}

async function main() {
  const daysBack = parseInt(process.argv[2]?.replace('--days=', '') ?? '7', 10);

  console.log('[TrackWise KB Auto-Enrichment]');
  console.log(`📥 Fetching unenriched races (last ${daysBack} days)...`);

  let browser: puppeteer.Browser | null = null;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    console.log(`  (Looking for races on/after ${cutoffStr})`);

    // Quick check for Unknown jockey/trainer counts
    const checkResult = await sql<Array<{ count: number }>>`
      SELECT COUNT(*) as count FROM kelly_logs
      WHERE jockey = 'Unknown' OR trainer = 'Unknown'
    `;
    console.log(`  (Total runners with Unknown jockey/trainer in DB: ${checkResult[0]?.count})`);

    const races = await getUnenrichedRaces(daysBack);

    if (races.length === 0) {
      console.log('✓ No races with Unknown jockey/trainer found in date range.\n');
      return;
    }

    console.log(`✓ Found ${races.length} races to enrich\n`);

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    let totalEnriched = 0;

    for (const race of races) {
      console.log(`\n🔄 ${race.date} ${race.track} R${race.raceNum}:`);

      // Scrape RaceNet for this race
      const raceNetRunners = await scrapeRaceNetRace(race.track, race.date, race.raceNum, browser);

      if (!raceNetRunners || raceNetRunners.length === 0) {
        console.log(`    ⊘ Skipping (no RaceNet data available)`);
        continue;
      }

      // Match and enrich
      const enrichedMap = new Map<string, { jockey: string; trainer: string }>();

      for (const betfairRunner of race.runners) {
        const matched = matchHorses(betfairRunner.horseName, raceNetRunners);

        if (matched && (matched.jockey || matched.trainer)) {
          enrichedMap.set(betfairRunner.horseName, {
            jockey: matched.jockey || 'Unknown',
            trainer: matched.trainer || 'Unknown',
          });

          console.log(`    ✓ ${betfairRunner.horseName.padEnd(25)} → ${matched.jockey || 'N/A'} / ${matched.trainer || 'N/A'}`);
        }
      }

      if (enrichedMap.size > 0) {
        const count = await updateRaceWithEnrichedData(race, enrichedMap);
        totalEnriched += count;
        console.log(`    💾 Updated ${count} runners in KB`);
      }

      // Slow down requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`\n✅ Auto-enrichment complete!`);
    console.log(`   Enriched ${totalEnriched} runners across ${races.length} races`);
    console.log(`   Jockeys and trainers now tracked from RaceNet\n`);
  } catch (err) {
    console.error('[Error]', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    await sql.end();
  }
}

main();
