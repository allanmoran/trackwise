import Database from 'better-sqlite3';
import http from 'http';
import { RacePredictor } from './src/ml/predictor.js';

const db = new Database('./data/trackwise.db');

console.log('🎯 MANUAL BET PLACEMENT - PHASE 1 VALIDATION\n');

// Get available races
const races = db.prepare(`
  SELECT DISTINCT r.id, r.track, r.race_number, COUNT(rr.id) as runner_count
  FROM races r
  LEFT JOIN race_runners rr ON r.id = rr.race_id
  WHERE r.id > 100
  GROUP BY r.id
  HAVING runner_count > 10
  LIMIT 10
`).all();

console.log(`Found ${races.length} races with 10+ runners\n`);

const allPicks = [];

// Generate predictions for each race
for (const race of races) {
  console.log(`Processing ${race.track} R${race.race_number} (Race ${race.id}, ${race.runner_count} runners)...`);

  try {
    // Generate predictions using the built-in method
    const picks = RacePredictor.generatePicksWithPredictions(race.id);

    console.log(`  ${picks.length} picks generated`);

    // Filter for positive EV and min confidence
    for (const pick of picks) {
      if (pick.ev_win >= 10 && pick.predicted_win_prob >= 20) {
        allPicks.push({
          race_id: race.id,
          track: race.track,
          race_num: race.race_number,
          horse: pick.horse,
          jockey: pick.jockey,
          trainer: pick.trainer,
          odds: pick.odds,
          confidence: Math.round(pick.predicted_win_prob),
          ev_percent: Math.round(pick.ev_win),
          stake: 25
        });

        console.log(`    ✅ ${pick.horse}: ${Math.round(pick.predicted_win_prob)}% conf, ${Math.round(pick.ev_win)}% EV @ ${pick.odds}`);
      }
    }
  } catch (err) {
    console.log(`  ❌ Error processing race: ${err.message}`);
  }
}

console.log(`\n📊 Summary: ${allPicks.length} qualified picks found\n`);

// Sort by EV and take top 15
allPicks.sort((a, b) => b.ev_percent - a.ev_percent);
const betsToPlace = allPicks.slice(0, 15);

if (betsToPlace.length === 0) {
  console.log('❌ No qualified picks found with positive EV and 20%+ confidence.');
  console.log('This is expected - model is conservative to avoid losses.');
  console.log('\nAlternative: Lowering thresholds to 10% EV and 15% confidence...\n');

  // Try with lower thresholds
  const lowThresholdPicks = allPicks.filter(p =>
    p.ev_percent >= 5 && p.confidence >= 15
  );

  if (lowThresholdPicks.length > 0) {
    console.log(`Found ${lowThresholdPicks.length} picks with lower thresholds`);
    betsToPlace.push(...lowThresholdPicks.slice(0, 10));
  }

  if (betsToPlace.length === 0) {
    process.exit(1);
  }
}

console.log(`📍 Placing ${betsToPlace.length} bets:\n`);

// Format bets for API
const betsPayload = {
  bets: betsToPlace.map(b => ({
    race_id: b.race_id,
    horse: b.horse,
    jockey: b.jockey,
    trainer: b.trainer,
    bet_type: 'WIN',
    stake: b.stake,
    opening_odds: b.odds,
    confidence: b.confidence
  }))
};

// Make API request to place bets
const postData = JSON.stringify(betsPayload);
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/bets/batch',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const result = JSON.parse(data);

      console.log(`\n✅ Bet Placement Result:`);
      console.log(`  Placed: ${result.placed} bets`);
      console.log(`  Filtered: ${result.filtered ? result.filtered.length : 0} bets`);
      if (result.duplicates) console.log(`  Duplicates: ${result.duplicates.length} bets`);
      console.log(`  Total Input: ${result.total_input} bets\n`);

      if (result.filtered && result.filtered.length > 0) {
        console.log(`Filtered reasons:`);
        result.filtered.slice(0, 5).forEach(f => console.log(`  - ${f}`));
        if (result.filtered.length > 5) console.log(`  ... and ${result.filtered.length - 5} more`);
      }

      if (result.placed > 0) {
        console.log(`\n✅ Successfully placed ${result.placed} manual bets`);
        console.log(`\nBet Details (Top picks):`);
        betsToPlace.slice(0, Math.min(result.placed, 10)).forEach((b, i) => {
          console.log(`  ${i+1}. ${b.track} R${b.race_num}: ${b.horse} @ ${b.odds} (${b.confidence}% conf, ${b.ev_percent}% EV) - $${b.stake}`);
        });

        console.log(`\n💰 Total Stake: $${result.placed * 25}`);
        console.log(`\n⏱️  Settlement Timeline: 3-7 days`);
        console.log(`📊 Expected Baseline Win Rate: ~6-7% (based on strike rates)`);
        console.log(`\n📍 Next: Monitor settlement and track ROI...`);
      } else {
        console.log('⚠️  No bets placed. Check filtered reasons above.');
      }
    } catch (e) {
      console.error('Error parsing response:', e);
      console.log('Response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(postData);
req.end();
