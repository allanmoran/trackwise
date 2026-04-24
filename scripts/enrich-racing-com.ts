#!/usr/bin/env node
/**
 * Enrich KB with Racing.com data
 * Scrapes horse pages from racing.com to find jockey/trainer info
 *
 * Usage: npx tsx scripts/enrich-racing-com.ts --days=30
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

interface HorseInfo {
  jockey?: string;
  trainer?: string;
  rating?: number;
}

async function searchHorseOnRacingCom(
  horseName: string,
  browser: puppeteer.Browser
): Promise<HorseInfo | null> {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(15000);

  try {
    // Search for horse on racing.com
    const searchUrl = `https://www.racing.com/horses?search=${encodeURIComponent(horseName)}`;

    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch(() => null);

    await new Promise(r => setTimeout(r, 2000));

    // Try to find horse link and navigate to horse page
    const horseLink = await page.evaluate((name: string) => {
      // Look for horse name in links
      const links = Array.from(document.querySelectorAll('a'));
      const normalized = name.toLowerCase().trim();

      for (const link of links) {
        const text = (link.textContent || '').toLowerCase().trim();
        const href = link.getAttribute('href') || '';

        // Match horse name or close enough
        if (text.includes(normalized.split(' ')[0]) && href.includes('/horses/')) {
          return href;
        }
      }

      return null;
    }, horseName);

    if (!horseLink) {
      // Try direct URL construction
      const slug = horseName.toLowerCase().replace(/\s+/g, '-');
      const directUrl = `https://www.racing.com/horses/${slug}`;

      await page.goto(directUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      }).catch(() => null);
    } else if (horseLink.startsWith('http')) {
      await page.goto(horseLink, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
    } else {
      await page.goto(`https://www.racing.com${horseLink}`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
    }

    await new Promise(r => setTimeout(r, 1500));

    // Extract jockey and trainer from horse page
    const info = await page.evaluate(() => {
      const result: HorseInfo = {};

      // Look for jockey info
      const pageText = document.body.innerText || '';
      const lines = pageText.split('\n').map(l => l.trim());

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();

        // Find jockey
        if (line.includes('jockey') || line.includes('rider')) {
          const nextLine = lines[i + 1] || '';
          if (nextLine && nextLine.length > 2 && nextLine.length < 50 && /^[A-Z]/.test(nextLine)) {
            result.jockey = nextLine;
          }
        }

        // Find trainer
        if (line.includes('trainer') || line.includes('trainer:')) {
          const nextLine = lines[i + 1] || '';
          if (nextLine && nextLine.length > 2 && nextLine.length < 50 && /^[A-Z]/.test(nextLine)) {
            result.trainer = nextLine;
          }
        }
      }

      // Alternative: Look for structured data
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || '{}');
          if (data.jockey) result.jockey = data.jockey;
          if (data.trainer) result.trainer = data.trainer;
        } catch (e) {
          // Ignore parse errors
        }
      }

      return result;
    });

    if (info.jockey || info.trainer) {
      return info;
    }

    return null;
  } catch (err) {
    return null;
  } finally {
    await page.close();
  }
}

async function getUnenrichedRunners(daysBack: number = 7): Promise<Array<{
  date: string;
  track: string;
  race_num: number;
  horse_name: string;
}>> {
  // Get all runners with Unknown jockey or trainer (no date filter)
  const runners = await sql<Array<{
    date: string;
    track: string;
    race_num: number;
    horse_name: string;
  }>>`
    SELECT DISTINCT date, track, race_num, horse_name
    FROM kelly_logs
    WHERE jockey = 'Unknown' OR trainer = 'Unknown'
    ORDER BY date DESC, track, race_num
    LIMIT 500
  `;

  return runners;
}

async function updateRunnerInfo(
  date: string,
  track: string,
  raceNum: number,
  horseName: string,
  jockey?: string,
  trainer?: string
): Promise<boolean> {
  try {
    await sql`
      UPDATE kelly_logs
      SET
        jockey = COALESCE(${jockey || null}, jockey),
        trainer = COALESCE(${trainer || null}, trainer)
      WHERE date = ${date}
      AND track = ${track}
      AND race_num = ${raceNum}
      AND horse_name = ${horseName}
    `;

    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  const daysBack = parseInt(process.argv[2]?.replace('--days=', '') ?? '30', 10);

  console.log('[Racing.com KB Enrichment]');
  console.log(`📥 Fetching unenriched runners (last ${daysBack} days)...`);

  let browser: puppeteer.Browser | null = null;

  try {
    const runners = await getUnenrichedRunners(daysBack);

    if (runners.length === 0) {
      console.log('✓ All runners already enriched!\n');
      return;
    }

    console.log(`✓ Found ${runners.length} runners to enrich\n`);

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    let enrichedCount = 0;
    let processedCount = 0;

    for (const runner of runners) {
      processedCount++;
      process.stdout.write(`\r  [${processedCount}/${runners.length}] ${runner.horse_name.padEnd(30)}`);

      try {
        const info = await searchHorseOnRacingCom(runner.horse_name, browser);

        if (info && (info.jockey || info.trainer)) {
          const updated = await updateRunnerInfo(
            runner.date,
            runner.track,
            runner.race_num,
            runner.horse_name,
            info.jockey,
            info.trainer
          );

          if (updated) {
            enrichedCount++;
            process.stdout.write(' ✓\n');
          }
        } else {
          process.stdout.write(' ⊘\n');
        }
      } catch (err) {
        process.stdout.write(' ✗\n');
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n✅ Enrichment complete!`);
    console.log(`   Enriched ${enrichedCount}/${runners.length} runners from Racing.com`);
    console.log(`   Jockeys and trainers now tracked\n`);
  } catch (err) {
    console.error('[Error]', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    await sql.end();
  }
}

main();
