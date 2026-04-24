import db from '../db.js';
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3001';

async function testPicksPipeline() {
  console.log('🧪 Testing Picks Generation Pipeline\n');

  try {
    // Step 1: Check KB population
    console.log('Step 1: Checking Knowledge Base...');
    const kbStats = db.prepare(`
      SELECT
        COUNT(*) as total_runners,
        COUNT(DISTINCT race_id) as races_with_runners
      FROM race_runners
    `).get();

    console.log(`  ✓ Total race_runners: ${kbStats.total_runners}`);
    console.log(`  ✓ Races with runners: ${kbStats.races_with_runners}\n`);

    if (kbStats.total_runners === 0) {
      console.log('❌ No race_runners found. KB may still be populating.\n');
      process.exit(0);
    }

    // Step 2: Get a race with runners
    console.log('Step 2: Finding race with runners...');
    const raceWithRunners = db.prepare(`
      SELECT r.id, r.track, r.race_number, COUNT(rr.id) as runner_count
      FROM races r
      JOIN race_runners rr ON r.id = rr.race_id
      GROUP BY r.id
      ORDER BY runner_count DESC
      LIMIT 1
    `).get();

    if (!raceWithRunners) {
      console.log('❌ No races with runners found\n');
      process.exit(0);
    }

    console.log(`  ✓ Found ${raceWithRunners.track} R${raceWithRunners.race_number} (ID: ${raceWithRunners.id})`);
    console.log(`  ✓ Runners: ${raceWithRunners.runner_count}\n`);

    // Step 3: Generate picks via API
    console.log('Step 3: Generating picks via API...');
    const pickResponse = await fetch(`${API_URL}/api/races/${raceWithRunners.id}/picks`);
    const pickData = await pickResponse.json();

    if (!pickData.success) {
      console.log(`❌ API error: ${pickData.error}\n`);
      process.exit(0);
    }

    console.log(`  ✓ Generated ${pickData.picks.length} picks`);

    if (pickData.picks.length > 0) {
      const topPick = pickData.picks[0];
      console.log(`  ✓ Top pick: ${topPick.horse} (${topPick.jockey})`);
      console.log(`  ✓ Confidence: ${topPick.confidence}%`);
      console.log(`  ✓ Horse strike rate: ${(topPick.horseStats.strikeRate * 100).toFixed(1)}%`);
      console.log(`  ✓ Jockey strike rate: ${(topPick.jockeyStats.strikeRate * 100).toFixed(1)}%`);
      console.log(`  ✓ Trainer strike rate: ${(topPick.trainerStats.strikeRate * 100).toFixed(1)}%\n`);
    } else {
      console.log('  ⚠️ No picks generated (all filtered out)\n');
    }

    // Step 4: Check confidence distribution
    console.log('Step 4: Confidence distribution...');
    const confidences = pickData.picks.map(p => p.confidence);
    const minConf = Math.min(...confidences, 100);
    const maxConf = Math.max(...confidences, 0);
    const avgConf = confidences.length > 0 ? (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(1) : 0;

    console.log(`  ✓ Min confidence: ${minConf}%`);
    console.log(`  ✓ Max confidence: ${maxConf}%`);
    console.log(`  ✓ Avg confidence: ${avgConf}%`);

    const highConfidence = confidences.filter(c => c >= 75).length;
    console.log(`  ✓ Picks with 75%+ confidence: ${highConfidence}/${pickData.picks.length}\n`);

    // Step 5: Test with filtering criteria
    console.log('Step 5: Simulating bet placement filters...');
    const MIN_CONFIDENCE = 75;
    const MAX_ODDS = 7.0;

    const filtered = pickData.picks.filter(p => p.confidence < MIN_CONFIDENCE || p.odds > MAX_ODDS);
    const placeable = pickData.picks.filter(p => p.confidence >= MIN_CONFIDENCE && p.odds <= MAX_ODDS);

    console.log(`  ✓ Below confidence threshold (<${MIN_CONFIDENCE}%): ${pickData.picks.filter(p => p.confidence < MIN_CONFIDENCE).length}`);
    console.log(`  ✓ Above odds threshold (>${MAX_ODDS}): ${pickData.picks.filter(p => p.odds > MAX_ODDS).length}`);
    console.log(`  ✓ Placeable bets: ${placeable.length}/${pickData.picks.length}\n`);

    // Step 6: Stats
    console.log('📊 Overall Stats:');
    console.log(`  - Total races: ${db.prepare('SELECT COUNT(*) as cnt FROM races').get().cnt}`);
    console.log(`  - Total horses: ${db.prepare('SELECT COUNT(*) as cnt FROM horses').get().cnt}`);
    console.log(`  - Total jockeys: ${db.prepare('SELECT COUNT(*) as cnt FROM jockeys').get().cnt}`);
    console.log(`  - Total trainers: ${db.prepare('SELECT COUNT(*) as cnt FROM trainers').get().cnt}`);
    console.log(`  - Race runners with KB data: ${kbStats.total_runners}\n`);

    console.log('✅ Pipeline test complete!\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

testPicksPipeline();
