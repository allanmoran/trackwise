#!/usr/bin/env node

import Database from 'better-sqlite3';
import SportsbetFormScraper from './src/scrapers/sportsbet-form-scraper.js';

const db = new Database('./data/trackwise.db');

console.log('🚀 PHASE 2A: AUTO-BETTING SESSION');
console.log('==================================\n');

// Phase 2A Configuration
const config = {
  tracks: ['Grafton', 'Naracoorte'],  // Start with 2 tracks
  minEv: 0.10,  // 10% minimum EV threshold
  maxConcurrent: 3  // Conservative concurrent processing
};

console.log(`📍 Configuration:`);
console.log(`   Tracks: ${config.tracks.join(', ')}`);
console.log(`   Min EV: ${(config.minEv * 100).toFixed(0)}%`);
console.log(`   Concurrent: ${config.maxConcurrent}\n`);

try {
  console.log('🔍 Extracting today\'s race URLs...\n');

  const urlsByTrack = {};
  let totalUrls = 0;

  for (const track of config.tracks) {
    try {
      const urls = await SportsbetFormScraper.scrapeRaceUrlsByTracks([track]);
      urlsByTrack[track] = urls;
      totalUrls += urls.length;
      console.log(`   ✓ ${track}: ${urls.length} races found`);
    } catch (err) {
      console.log(`   ⚠️  ${track}: ${err.message}`);
    }
  }

  console.log(`\n✅ Total races: ${totalUrls}\n`);

  if (totalUrls === 0) {
    console.log('❌ No races found for configured tracks');
    process.exit(0);
  }

  // Flatten URLs with track info
  const allUrls = [];
  for (const [track, urls] of Object.entries(urlsByTrack)) {
    for (const url of urls) {
      allUrls.push({ url, track });
    }
  }

  console.log(`🎯 PHASE 2A: AUTO-BETTING START\n`);
  console.log(`Processing ${allUrls.length} races with auto-betting enabled...\n`);

  let successCount = 0;
  let betCount = 0;
  let totalBets = 0;
  let totalStake = 0;
  let errorCount = 0;

  // Process URLs with concurrency control
  for (let i = 0; i < allUrls.length; i += config.maxConcurrent) {
    const batch = allUrls.slice(i, Math.min(i + config.maxConcurrent, allUrls.length));

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const { url, track } = item;
        const raceNum = i + allUrls.indexOf(item) + 1;

        try {
          console.log(`[${raceNum}/${allUrls.length}] Processing: ${track}...`);

          // Call scraper with auto-betting enabled
          const result = await SportsbetFormScraper.scrapeLoadPredictAndBet(url, config.minEv);

          const picksCount = result.picks?.length || 0;
          const betsPlaced = result.betResult?.betsPlaced || 0;

          if (betsPlaced > 0) {
            const stakePerBet = 25; // Standard stake
            const raceStake = betsPlaced * stakePerBet;
            totalStake += raceStake;
            totalBets += betsPlaced;
            console.log(`   ✅ ${picksCount} picks → ${betsPlaced} bets placed (${track} R${result.raceNumber}) - $${raceStake}`);
            betCount++;
          } else if (picksCount > 0) {
            console.log(`   ⚠️  ${picksCount} picks but no bets placed (low EV) - ${track}`);
          } else {
            console.log(`   ⏭️  No picks generated - ${track}`);
          }

          successCount++;
          return { status: 'success', betsPlaced };
        } catch (err) {
          errorCount++;
          console.log(`   ❌ Error: ${err.message}`);
          return { status: 'error', error: err.message };
        }
      })
    );
  }

  // Query database for placement summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 PHASE 2A SESSION SUMMARY\n`);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_bets,
      COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_bets,
      ROUND(SUM(stake), 2) as total_stake,
      ROUND(AVG(confidence), 1) as avg_confidence,
      ROUND(AVG(ev_percent), 1) as avg_ev
    FROM bets
    WHERE placed_at > datetime('now', '-1 hour')
  `).get();

  console.log(`Processed Races: ${successCount}/${allUrls.length}`);
  console.log(`Races with Bets: ${betCount}`);
  console.log(`Total Bets Placed: ${summary.total_bets}`);
  console.log(`Active Bets: ${summary.active_bets}`);
  console.log(`Total Stake: $${summary.total_stake}`);
  console.log(`Avg Confidence: ${summary.avg_confidence}%`);
  console.log(`Avg EV: ${summary.avg_ev}%`);

  if (summary.total_bets > 0) {
    console.log(`\n✅ PHASE 2A LIVE: ${summary.total_bets} bets placed for settlement tonight at 8 PM`);
    console.log(`\n📊 Monitor with: bash /tmp/phase1b_dashboard.sh`);
  } else {
    console.log(`\n⚠️  No bets placed. Check EV thresholds and track availability.`);
  }

  console.log(`\n📍 Status checked: ${new Date().toLocaleString()}`);

} catch (err) {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
}
