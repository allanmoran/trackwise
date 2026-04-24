#!/usr/bin/env node

import Database from 'better-sqlite3';
import fetch from 'node-fetch';

const db = new Database('./data/trackwise.db');
const BASE_URL = 'http://localhost:3001/api/bets';

console.log('🧪 BATCH BETTING REAL DATA STRESS TEST\n');
console.log('=' .repeat(70));

// Get a real race with runners
const race = db.prepare(`
  SELECT r.id, r.track, r.race_number, COUNT(rr.id) as runner_count
  FROM races r
  LEFT JOIN race_runners rr ON r.id = rr.race_id
  WHERE r.date >= date('now')
  GROUP BY r.id
  HAVING COUNT(rr.id) > 5
  LIMIT 1
`).get();

if (!race) {
  console.log('❌ No suitable race found in database');
  process.exit(1);
}

console.log(`📍 Using Real Race Data:`);
console.log(`   Race: ${race.track} R${race.race_number}`);
console.log(`   Race ID: ${race.id}`);
console.log(`   Runners available: ${race.runner_count}\n`);

// Get available horses for this race
const runners = db.prepare(`
  SELECT rr.horse_id, h.name
  FROM race_runners rr
  JOIN horses h ON rr.horse_id = h.id
  WHERE rr.race_id = ?
  LIMIT 20
`).all(race.id);

console.log(`✅ Found ${runners.length} runners to bet on\n`);

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    console.log(`🔧 ${name}`);
    const result = await fn();
    console.log(`✅ PASS: ${result}\n`);
    testsPassed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    testsFailed++;
  }
}

// ============================================================================
// TEST 1: Small batch with real data (5 bets)
// ============================================================================
await test('Small batch (5 real bets)', async () => {
  const bets = runners.slice(0, 5).map(runner => ({
    race_id: race.id,
    horse_id: runner.horse_id,
    bet_type: 'WIN',
    stake: 25,
    opening_odds: 5.0,
    ev_percent: 15,
    confidence: 22
  }));

  const start = Date.now();
  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();
  const elapsed = Date.now() - start;

  if (result.placed === 0) {
    throw new Error('No bets placed - API validation failed');
  }

  return `Placed ${result.placed}/${bets.length} bets in ${elapsed}ms (${(elapsed/result.placed).toFixed(1)}ms per bet)`;
});

// ============================================================================
// TEST 2: Medium batch (10 bets)
// ============================================================================
await test('Medium batch (10 real bets)', async () => {
  const selectedRunners = runners.slice(0, Math.min(10, runners.length));
  const bets = selectedRunners.map((runner, i) => ({
    race_id: race.id,
    horse_id: runner.horse_id,
    bet_type: i % 3 === 0 ? 'PLACE' : 'WIN',
    stake: 25 + (i % 5) * 5,
    opening_odds: 3.0 + (i % 10) * 0.5,
    ev_percent: 10 + (i % 20),
    confidence: 20 + (i % 15)
  }));

  const start = Date.now();
  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();
  const elapsed = Date.now() - start;

  return `Placed ${result.placed}/${bets.length} bets in ${elapsed}ms (${(elapsed/result.placed).toFixed(1)}ms per bet)`;
});

// ============================================================================
// TEST 3: Large batch (20 bets)
// ============================================================================
await test('Large batch (20 real bets)', async () => {
  const selectedRunners = runners.slice(0, Math.min(20, runners.length));
  const bets = selectedRunners.map((runner, i) => ({
    race_id: race.id,
    horse_id: runner.horse_id,
    bet_type: i % 4 === 0 ? 'PLACE' : 'WIN',
    stake: 20 + (i % 5) * 5,
    opening_odds: 2.5 + (i % 15) * 0.3,
    ev_percent: 10 + (i % 25),
    confidence: 20 + (i % 20)
  }));

  const start = Date.now();
  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();
  const elapsed = Date.now() - start;
  const throughput = (result.placed / (elapsed / 1000)).toFixed(0);

  return `Placed ${result.placed}/${bets.length} bets in ${elapsed}ms - Throughput: ${throughput} bets/sec`;
});

// ============================================================================
// TEST 4: Confidence threshold (mixed valid/invalid)
// ============================================================================
await test('Confidence validation', async () => {
  const bets = [
    { race_id: race.id, horse_id: runners[0].horse_id, bet_type: 'WIN',
      stake: 25, opening_odds: 5.0, ev_percent: 50, confidence: 15 }, // Too low
    { race_id: race.id, horse_id: runners[1].horse_id, bet_type: 'WIN',
      stake: 25, opening_odds: 5.0, ev_percent: 50, confidence: 25 }  // Valid
  ];

  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();

  if (result.placed !== 1) {
    throw new Error(`Expected 1 valid, got ${result.placed}`);
  }

  return `Correctly rejected 1 low-confidence bet, accepted 1 valid`;
});

// ============================================================================
// TEST 5: EV threshold validation
// ============================================================================
await test('EV threshold validation', async () => {
  const bets = [
    { race_id: race.id, horse_id: runners[0].horse_id, bet_type: 'WIN',
      stake: 25, opening_odds: 5.0, ev_percent: 5, confidence: 25 },  // Too low EV
    { race_id: race.id, horse_id: runners[1].horse_id, bet_type: 'WIN',
      stake: 25, opening_odds: 5.0, ev_percent: 20, confidence: 25 }  // Valid EV
  ];

  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();

  if (result.placed !== 1) {
    throw new Error(`Expected 1 valid, got ${result.placed}`);
  }

  return `Correctly rejected 1 low-EV bet, accepted 1 valid`;
});

// ============================================================================
// TEST 6: Concurrent requests (3 parallel)
// ============================================================================
await test('Concurrent requests (3 parallel)', async () => {
  const createBatch = (offset) => runners
    .slice(offset, offset + 5)
    .map(runner => ({
      race_id: race.id,
      horse_id: runner.horse_id,
      bet_type: 'WIN',
      stake: 25,
      opening_odds: 5.0,
      ev_percent: 20,
      confidence: 22
    }));

  const start = Date.now();
  const promises = [0, 5, 10].map(offset =>
    fetch(`${BASE_URL}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bets: createBatch(offset) })
    }).then(r => r.json())
  );

  const results = await Promise.all(promises);
  const elapsed = Date.now() - start;
  const totalPlaced = results.reduce((sum, r) => sum + (r.placed || 0), 0);
  const throughput = (totalPlaced / (elapsed / 1000)).toFixed(0);

  return `3 concurrent batches placed ${totalPlaced} bets in ${elapsed}ms - Throughput: ${throughput} bets/sec`;
});

// ============================================================================
// TEST 7: Performance latency baseline
// ============================================================================
await test('Performance latency baseline', async () => {
  const sizes = [5, 10, 15];
  const measurements = [];

  for (const size of sizes) {
    const bets = runners.slice(0, size).map(runner => ({
      race_id: race.id,
      horse_id: runner.horse_id,
      bet_type: 'WIN',
      stake: 25,
      opening_odds: 5.0,
      ev_percent: 20,
      confidence: 22
    }));

    const start = Date.now();
    const response = await fetch(`${BASE_URL}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bets })
    });
    const result = await response.json();
    const elapsed = Date.now() - start;

    measurements.push({
      size,
      elapsed,
      placed: result.placed,
      perBet: (elapsed / Math.max(1, result.placed)).toFixed(2)
    });
  }

  let latencyReport = '\n   Batch Size | Elapsed (ms) | Placed | Per-Bet (ms)\n   ' + '-'.repeat(50);
  measurements.forEach(m => {
    latencyReport += `\n   ${m.size.toString().padStart(10)} | ${m.elapsed.toString().padStart(12)} | ${m.placed.toString().padStart(6)} | ${m.perBet.padStart(12)}`;
  });

  return latencyReport;
});

// ============================================================================
// TEST 8: Database persistence verification
// ============================================================================
await test('Database persistence', async () => {
  const beforeCount = db.prepare('SELECT COUNT(*) as cnt FROM bets').get().cnt;

  const bets = runners.slice(0, 5).map(runner => ({
    race_id: race.id,
    horse_id: runner.horse_id,
    bet_type: 'WIN',
    stake: 25,
    opening_odds: 5.0,
    ev_percent: 20,
    confidence: 22
  }));

  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();
  const afterCount = db.prepare('SELECT COUNT(*) as cnt FROM bets').get().cnt;
  const dbIncrease = afterCount - beforeCount;

  if (dbIncrease !== result.placed) {
    throw new Error(`Placed ${result.placed} but DB count increased by ${dbIncrease}`);
  }

  return `${result.placed} bets placed and verified in database`;
});

// Summary
console.log('=' .repeat(70));
console.log(`\n📊 TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed\n`);

if (testsFailed === 0) {
  console.log('🎉 ALL TESTS PASSED - System ready for production!\n');
} else {
  console.log('⚠️  Some tests failed - review results above\n');
}
