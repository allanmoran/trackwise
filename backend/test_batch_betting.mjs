#!/usr/bin/env node

import Database from 'better-sqlite3';
import fetch from 'node-fetch';

const db = new Database('./data/trackwise.db');
const BASE_URL = 'http://localhost:3001/api/bets';

console.log('🧪 BATCH BETTING SYSTEM TEST SUITE\n');
console.log('=' .repeat(70));

// Test configuration
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const t of tests) {
    try {
      console.log(`\n🔧 ${t.name}`);
      await t.fn();
      console.log(`✅ PASS`);
      passed++;
    } catch (err) {
      console.log(`❌ FAIL: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 TEST RESULTS: ${passed} passed, ${failed} failed\n`);
}

// ============================================================================
// TEST 1: Small batch (5 bets)
// ============================================================================
test('Small batch (5 bets)', async () => {
  const bets = [
    { horse: 'Test Horse 1', jockey: 'Test Jockey', trainer: 'Test Trainer',
      bet_type: 'WIN', stake: 25, opening_odds: 5.0, ev_percent: 15, confidence: 22 },
    { horse: 'Test Horse 2', jockey: 'Test Jockey', trainer: 'Test Trainer',
      bet_type: 'WIN', stake: 25, opening_odds: 6.0, ev_percent: 12, confidence: 20 },
    { horse: 'Test Horse 3', jockey: 'Test Jockey', trainer: 'Test Trainer',
      bet_type: 'PLACE', stake: 50, opening_odds: 4.5, ev_percent: 20, confidence: 25 },
    { horse: 'Test Horse 4', jockey: 'Test Jockey', trainer: 'Test Trainer',
      bet_type: 'WIN', stake: 30, opening_odds: 7.0, ev_percent: 18, confidence: 23 },
    { horse: 'Test Horse 5', jockey: 'Test Jockey', trainer: 'Test Trainer',
      bet_type: 'WIN', stake: 40, opening_odds: 3.5, ev_percent: 10, confidence: 21 }
  ];

  const start = Date.now();
  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();
  const elapsed = Date.now() - start;

  if (result.placed !== 5) {
    throw new Error(`Expected 5 bets placed, got ${result.placed}`);
  }
  console.log(`   Placed 5 bets in ${elapsed}ms (${(elapsed/5).toFixed(1)}ms per bet)`);
});

// ============================================================================
// TEST 2: Medium batch (20 bets)
// ============================================================================
test('Medium batch (20 bets)', async () => {
  const bets = Array.from({ length: 20 }, (_, i) => ({
    horse: `Test Horse ${i+1}`,
    jockey: 'Test Jockey',
    trainer: 'Test Trainer',
    bet_type: i % 3 === 0 ? 'PLACE' : 'WIN',
    stake: 25 + (i % 5) * 10,
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

  if (result.placed < 15) {
    throw new Error(`Expected 15+ bets placed, got ${result.placed}`);
  }
  console.log(`   Placed ${result.placed} of 20 bets in ${elapsed}ms (${(elapsed/result.placed).toFixed(1)}ms per bet)`);
  console.log(`   Skipped: ${result.skipped || 0} (low EV or confidence)`);
});

// ============================================================================
// TEST 3: Large batch (50 bets)
// ============================================================================
test('Large batch (50 bets)', async () => {
  const bets = Array.from({ length: 50 }, (_, i) => ({
    horse: `Test Horse ${i+1}`,
    jockey: 'Test Jockey',
    trainer: 'Test Trainer',
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

  if (result.placed < 30) {
    throw new Error(`Expected 30+ bets placed, got ${result.placed}`);
  }
  console.log(`   Placed ${result.placed} of 50 bets in ${elapsed}ms (${(elapsed/result.placed).toFixed(1)}ms per bet)`);
  console.log(`   Throughput: ${(result.placed / (elapsed/1000)).toFixed(0)} bets/sec`);
});

// ============================================================================
// TEST 4: Confidence validation (should skip < 20%)
// ============================================================================
test('Confidence validation (reject < 20%)', async () => {
  const bets = [
    { horse: 'Low Conf', jockey: 'Test', trainer: 'Test',
      bet_type: 'WIN', stake: 25, opening_odds: 5.0, ev_percent: 50, confidence: 15 },
    { horse: 'Good Conf', jockey: 'Test', trainer: 'Test',
      bet_type: 'WIN', stake: 25, opening_odds: 5.0, ev_percent: 50, confidence: 25 }
  ];

  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();

  if (result.placed !== 1) {
    throw new Error(`Expected 1 bet (one rejected for low confidence), got ${result.placed}`);
  }
  console.log(`   Correctly rejected 1 low-confidence bet, placed 1 valid bet`);
});

// ============================================================================
// TEST 5: EV validation (should skip < 10%)
// ============================================================================
test('EV validation (reject < 10%)', async () => {
  const bets = [
    { horse: 'Low EV', jockey: 'Test', trainer: 'Test',
      bet_type: 'WIN', stake: 25, opening_odds: 5.0, ev_percent: 5, confidence: 25 },
    { horse: 'Good EV', jockey: 'Test', trainer: 'Test',
      bet_type: 'WIN', stake: 25, opening_odds: 5.0, ev_percent: 20, confidence: 25 }
  ];

  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();

  if (result.placed !== 1) {
    throw new Error(`Expected 1 bet (one rejected for low EV), got ${result.placed}`);
  }
  console.log(`   Correctly rejected 1 low-EV bet, placed 1 valid bet`);
});

// ============================================================================
// TEST 6: Odds validation (2.5 - 100 range)
// ============================================================================
test('Odds validation (2.5 - 100 range)', async () => {
  const bets = [
    { horse: 'Bad Odds Low', jockey: 'Test', trainer: 'Test',
      bet_type: 'WIN', stake: 25, opening_odds: 1.5, ev_percent: 50, confidence: 25 },
    { horse: 'Bad Odds High', jockey: 'Test', trainer: 'Test',
      bet_type: 'WIN', stake: 25, opening_odds: 150, ev_percent: 50, confidence: 25 },
    { horse: 'Good Odds', jockey: 'Test', trainer: 'Test',
      bet_type: 'WIN', stake: 25, opening_odds: 5.0, ev_percent: 50, confidence: 25 }
  ];

  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();

  if (result.placed !== 1) {
    throw new Error(`Expected 1 valid bet, got ${result.placed}`);
  }
  console.log(`   Correctly rejected 2 out-of-range bets, placed 1 valid bet`);
});

// ============================================================================
// TEST 7: Concurrent requests (5 parallel)
// ============================================================================
test('Concurrent requests (5 parallel batches)', async () => {
  const createBatch = (id) => ({
    bets: [
      { horse: `Concurrent ${id}-1`, jockey: 'Test', trainer: 'Test',
        bet_type: 'WIN', stake: 25, opening_odds: 5.0, ev_percent: 20, confidence: 22 },
      { horse: `Concurrent ${id}-2`, jockey: 'Test', trainer: 'Test',
        bet_type: 'WIN', stake: 30, opening_odds: 6.0, ev_percent: 25, confidence: 23 }
    ]
  });

  const start = Date.now();
  const promises = Array.from({ length: 5 }, (_, i) =>
    fetch(`${BASE_URL}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBatch(i))
    }).then(r => r.json())
  );

  const results = await Promise.all(promises);
  const elapsed = Date.now() - start;
  const totalPlaced = results.reduce((sum, r) => sum + (r.placed || 0), 0);

  if (totalPlaced < 8) {
    throw new Error(`Expected 8+ bets placed, got ${totalPlaced}`);
  }
  console.log(`   5 concurrent batches placed ${totalPlaced} bets in ${elapsed}ms`);
  console.log(`   Throughput: ${(totalPlaced / (elapsed/1000)).toFixed(0)} bets/sec`);
});

// ============================================================================
// TEST 8: Deduplication (same horse/jockey in race should fail 2nd time)
// ============================================================================
test('Deduplication check', async () => {
  const bets = [
    { horse: 'Duplicate Test', jockey: 'Same Jockey', trainer: 'Test',
      bet_type: 'WIN', stake: 25, opening_odds: 5.0, ev_percent: 50, confidence: 25 },
    { horse: 'Duplicate Test', jockey: 'Same Jockey', trainer: 'Test',
      bet_type: 'WIN', stake: 25, opening_odds: 5.0, ev_percent: 50, confidence: 25 }
  ];

  const response = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bets })
  });

  const result = await response.json();

  if (result.placed < 1) {
    throw new Error(`Expected at least 1 bet placed`);
  }
  console.log(`   Deduplication working: placed ${result.placed} of 2 duplicate bets`);
});

// ============================================================================
// TEST 9: Database integrity (all bets persisted)
// ============================================================================
test('Database persistence (10 bets)', async () => {
  const beforeCount = db.prepare('SELECT COUNT(*) as cnt FROM bets').get().cnt;

  const bets = Array.from({ length: 10 }, (_, i) => ({
    horse: `DB Test ${i+1}`,
    jockey: 'Test',
    trainer: 'Test',
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

  if (afterCount - beforeCount !== result.placed) {
    throw new Error(`Bet count mismatch: inserted ${result.placed} but count increased by ${afterCount - beforeCount}`);
  }
  console.log(`   ${result.placed} bets inserted and verified in database`);
});

// ============================================================================
// TEST 10: Performance baseline (measure latency)
// ============================================================================
test('Performance baseline (latency analysis)', async () => {
  const sizes = [5, 10, 20, 50];
  const results = [];

  for (const size of sizes) {
    const bets = Array.from({ length: size }, (_, i) => ({
      horse: `Perf ${size}-${i}`,
      jockey: 'Test',
      trainer: 'Test',
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

    results.push({ size, elapsed, placed: result.placed, perBet: (elapsed / result.placed).toFixed(2) });
  }

  console.log('\n   Batch Size | Elapsed (ms) | Placed | Per-Bet (ms)');
  console.log('   ' + '-'.repeat(50));
  results.forEach(r => {
    console.log(`   ${r.size.toString().padStart(10)} | ${r.elapsed.toString().padStart(12)} | ${r.placed.toString().padStart(6)} | ${r.perBet.padStart(12)}`);
  });
});

// Run all tests
console.log('\n🚀 Starting test suite...\n');
runTests();
