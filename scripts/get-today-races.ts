#!/usr/bin/env node
/**
 * Extract today's Sportsbet race links
 * Parses the form guide and generates URLs
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

interface TrackRace {
  track: string;
  trackId: string;
  raceNum: number;
  time: string;
  url: string;
}

async function getTodayRaces() {
  console.log('\n🏇 Fetching today\'s Sportsbet race links...\n');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://www.sportsbetform.com.au/', { waitUntil: 'networkidle2' });

    await new Promise(r => setTimeout(r, 1000));

    const races = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a'));
      const races = new Map<string, any[]>();

      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link as HTMLAnchorElement).textContent?.trim() || '';

        // Match race links: /TRACKID/RACEID/ with time text
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

    if (races.length === 0) {
      console.log('❌ No races found\n');
      await browser.close();
      return;
    }

    // Map track IDs to names (based on Sportsbet data)
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
    };

    // Enhance races with track names
    const enhancedRaces: TrackRace[] = races.map((r: any) => ({
      ...r,
      track: trackMap[r.trackId] || `Track ${r.trackId}`,
    }));

    // Group by track
    const byTrack = new Map<string, TrackRace[]>();
    for (const race of enhancedRaces) {
      if (!byTrack.has(race.track)) {
        byTrack.set(race.track, []);
      }
      byTrack.get(race.track)!.push(race);
    }

    // Display results
    console.log('=' .repeat(80));
    console.log(`✅ Found ${enhancedRaces.length} races\n`);

    const sortedTracks = Array.from(byTrack.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [track, trackRaces] of sortedTracks) {
      console.log(`\n📍 ${track}`);
      console.log('-'.repeat(40));

      trackRaces.sort((a, b) => parseInt(a.raceId) - parseInt(b.raceId)).forEach(race => {
        const raceNum = race.time ? `${race.time}` : `Race ${race.raceId}`;
        console.log(`  ${raceNum} → ${race.url}`);
      });
    }

    // Generate copy-paste ready list (only allowed tracks)
    const allowedTrackIds = Object.keys(trackMap);
    const filteredRaces = enhancedRaces.filter(r => allowedTrackIds.includes(r.trackId));

    console.log('\n\n' + '='.repeat(80));
    console.log(`📋 COPY-PASTE ALL LINKS INTO TRACKWISE (${filteredRaces.length} races)\n`);

    const sortedFiltered = new Map<string, TrackRace[]>();
    for (const race of filteredRaces) {
      if (!sortedFiltered.has(race.track)) {
        sortedFiltered.set(race.track, []);
      }
      sortedFiltered.get(race.track)!.push(race);
    }

    for (const [track, trackRaces] of Array.from(sortedFiltered.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      trackRaces.sort((a, b) => parseInt(a.raceId) - parseInt(b.raceId)).forEach(race => {
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

getTodayRaces();
