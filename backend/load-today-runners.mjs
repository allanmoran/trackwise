#!/usr/bin/env node

/**
 * Load runners for existing races in database
 * Generates URLs from track mapping and scrapes runners via batch processor
 */

import Database from 'better-sqlite3';
import SportsbetFormScraper from './src/scrapers/sportsbet-form-scraper.js';

const db = new Database('./data/trackwise.db');
const trackMapping = SportsbetFormScraper.trackMapping;

console.log(`\n🏃 RUNNER LOADER - Loading runners for today's races`);
console.log(`${'='.repeat(60)}\n`);

// Get today's races without runners
const racesWithoutRunners = db.prepare(`
  SELECT r.id, r.track, r.race_number
  FROM races r
  LEFT JOIN race_runners rr ON r.id = rr.race_id
  WHERE r.date = date('now')
  AND rr.id IS NULL
  GROUP BY r.id
  ORDER BY r.track, r.race_number
  LIMIT 50
`).all();

console.log(`📍 Found ${racesWithoutRunners.length} races without runners\n`);

if (racesWithoutRunners.length === 0) {
  console.log('✅ All races have runners loaded');
  process.exit(0);
}

// Generate URLs from track mapping
const urlsToScrape = [];

for (const trackMapping_entry of Object.values(trackMapping)) {
  const track = trackMapping_entry.track;
  const races_in_track = racesWithoutRunners.filter(r => r.track === track);

  if (races_in_track.length === 0) continue;

  // For each race in this track, find the corresponding URL
  for (const race of races_in_track) {
    // Find a meeting ID for this race from the track mapping
    const raceIds = Object.keys(trackMapping_entry.races || {});
    if (raceIds.length > 0) {
      const trackId = Object.keys(trackMapping).find(id =>
        trackMapping[id].track === track
      );
      if (trackId && raceIds.length > 0) {
        // Use the first available meeting ID for this track
        const meetingId = raceIds[race.race_number - 1] || raceIds[0];
        const url = `https://www.sportsbetform.com.au/${trackId}/${meetingId}/`;
        urlsToScrape.push({ url, track, race_number: race.race_number });
      }
    }
  }
}

console.log(`📥 Generated ${urlsToScrape.length} URLs to scrape\n`);

if (urlsToScrape.length === 0) {
  console.log('⚠️  No URLs could be generated for races');
  process.exit(1);
}

// Process in batches
let successCount = 0;
let failureCount = 0;

async function processBatch() {
  for (let i = 0; i < urlsToScrape.length; i += 3) {
    const batch = urlsToScrape.slice(i, i + 3);

    for (const item of batch) {
      try {
        console.log(`[${i + 1}/${urlsToScrape.length}] Scraping ${item.track} R${item.race_number}...`);

        const result = await SportsbetFormScraper.scrapeAndLoad(item.url);
        console.log(`  ✅ Loaded ${result.runnersLoaded} runners`);
        successCount++;
      } catch (err) {
        console.log(`  ❌ Failed: ${err.message}`);
        failureCount++;
      }
    }

    // Small delay between batches
    if (i + 3 < urlsToScrape.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ Complete: ${successCount} succeeded, ${failureCount} failed`);
}

processBatch().catch(err => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
