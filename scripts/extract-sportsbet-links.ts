#!/usr/bin/env node
/**
 * Extract today's race links from Sportsbet Form
 * Generates copy-paste ready URLs for all races
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function extractRaceLinks() {
  console.log('\n🔗 Extracting race links from Sportsbet Form...\n');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    console.log('Loading https://www.sportsbetform.com.au/');
    await page.goto('https://www.sportsbetform.com.au/', { waitUntil: 'networkidle2' });

    await new Promise(r => setTimeout(r, 1000));

    const raceLinks = await page.evaluate(() => {
      const races: any[] = [];

      // Get all links
      const links = Array.from(document.querySelectorAll('a[href*="sportsbetform.com.au"]'));

      let currentTrack = '';

      // Build a map of track names from the page
      const text = document.body.innerText;
      const trackNames: Record<string, string> = {};

      const lines = text.split('\n');
      for (const line of lines) {
        const cleanLine = line.trim();
        // Look for track names followed by race times
        if (['Cranbourne', 'Darwin', 'Gatton', 'Geelong', 'Gold Coast', 'Launceston', 'Murray Bdge', 'Tamworth', 'Wellington'].includes(cleanLine.split('\t')[0])) {
          currentTrack = cleanLine.split('\t')[0];
        }
      }

      // Process links - time links have href like /435971/3308383/
      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        const text = link.textContent?.trim() || '';

        // Match time pattern (HH:MM)
        if (/\d{2}:\d{2}/.test(text)) {
          // This is a race link
          const match = href.match(/sportsbetform\.com\.au\/(\d+)\/(\d+)\/?$/);
          if (match) {
            const [, trackId, raceId] = match;

            // Find track name by looking at siblings
            let trackElement = (link as HTMLElement).parentElement;
            while (trackElement && !trackElement.textContent?.includes('Cranbourne') && !trackElement.textContent?.includes('Darwin')) {
              trackElement = trackElement.parentElement;
            }

            races.push({
              trackId,
              raceId,
              url: href,
            });
          }
        }
      }

      return races;
    });

    if (raceLinks.length === 0) {
      console.log('❌ No race links found. Page structure may have changed.\n');
      await browser.close();
      return;
    }

    // Group by track
    const byTrack = new Map<string, any[]>();
    for (const race of raceLinks) {
      if (!byTrack.has(race.track)) {
        byTrack.set(race.track, []);
      }
      byTrack.get(race.track)!.push(race);
    }

    // Sort tracks and races
    const sortedTracks = Array.from(byTrack.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    console.log('=' .repeat(80));
    console.log(`✅ Found ${raceLinks.length} races across ${byTrack.size} tracks\n`);

    // Display formatted list
    for (const [track, races] of sortedTracks) {
      console.log(`\n📍 ${track}`);
      console.log('-'.repeat(40));

      races.sort((a, b) => a.raceNum - b.raceNum).forEach(race => {
        console.log(`  R${race.raceNum}: ${race.url}`);
      });
    }

    // Generate copy-paste block
    console.log('\n\n' + '='.repeat(80));
    console.log('📋 COPY-PASTE ALL LINKS\n');

    for (const [track, races] of sortedTracks) {
      races.sort((a, b) => a.raceNum - b.raceNum).forEach(race => {
        console.log(race.url);
      });
    }

    console.log('\n' + '='.repeat(80) + '\n');

    await browser.close();
  } catch (err) {
    console.error('❌ Error:', err);
    if (browser) await browser.close();
  }
}

extractRaceLinks();
