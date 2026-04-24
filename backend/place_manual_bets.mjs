import Database from 'better-sqlite3';
import http from 'http';
import Predictor from './src/ml/predictor.js';

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
    // Get all runners for this race
    const runners = db.prepare(`
      SELECT rr.id, h.id as horse_id, h.name as horse, j.name as jockey, t.name as trainer,
             rr.starting_odds as odds, rr.result, h.strike_rate
      FROM race_runners rr
      LEFT JOIN horses h ON rr.horse_id = h.id
      LEFT JOIN jockeys j ON rr.jockey_id = j.id
      LEFT JOIN trainers t ON rr.trainer_id = t.id
      WHERE rr.race_id = ?
      AND rr.starting_odds IS NOT NULL
      AND rr.starting_odds > 0
      ORDER BY rr.starting_odds
      LIMIT 15
    `).all(race.id);

    console.log(`  ${runners.length} runners with valid odds`);

    // Generate predictions for each runner
    for (const runner of runners) {
      try {
        const prediction = Predictor.predict(runner.horse_id, runner);

        // Calculate EV
        const ev = (prediction.probability * runner.odds) - 1;

        // Only include if positive EV and >20% confidence
        if (ev >= 0.10 && prediction.probability * 100 >= 20) {
          allPicks.push({
            race_id: race.id,
            track: race.track,
            race_num: race.race_number,
            horse: runner.horse,
            jockey: runner.jockey,
            trainer: runner.trainer,
            odds: runner.odds,
            confidence: Math.round(prediction.probability * 100),
            ev_percent: Math.round(ev * 100),
            stake: 25
          });

          console.log(`    ✅ ${runner.horse}: ${Math.round(prediction.probability * 100)}% conf, ${Math.round(ev * 100)}% EV @ ${runner.odds}`);
        }
      } catch (e) {
        // Skip this runner if prediction fails
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
  console.log('❌ No qualified picks found with positive EV. Exiting.');
  process.exit(1);
}

console.log(`📍 Placing top ${betsToPlace.length} bets by EV:\n`);

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
      console.log(`  Total Input: ${result.total_input} bets\n`);

      if (result.filtered && result.filtered.length > 0) {
        console.log(`Filtered bets:`);
        result.filtered.forEach(f => console.log(`  - ${f}`));
      }

      if (result.placed > 0) {
        console.log(`\n✅ Successfully placed ${result.placed} manual bets`);
        console.log(`\nBet Details:`);
        betsToPlace.slice(0, result.placed).forEach(b => {
          console.log(`  ${b.track} R${b.race_num}: ${b.horse} @ ${b.odds} (${b.confidence}% conf, ${b.ev_percent}% EV)`);
        });

        console.log(`\n💰 Total Stake: $${result.placed * 25}`);
        console.log(`\n⏱️  Settlement Timeline: 3-7 days`);
        console.log(`📊 Expected Baseline Win Rate: ~6-7% (based on strike rates)`);
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
