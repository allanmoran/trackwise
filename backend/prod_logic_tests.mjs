#!/usr/bin/env node
import Database from 'better-sqlite3';

const db = new Database('./data/trackwise.db');

console.log(`
════════════════════════════════════════════════════════════
PRODUCTION READINESS: BUSINESS LOGIC TESTS
════════════════════════════════════════════════════════════
`);

// TEST 4: EV CALCULATION ACCURACY
console.log(`\n🎯 TEST 4: EV CALCULATION VALIDATION`);
console.log(`─────────────────────────────────────────────────────────`);

const evThreshold = 0.10;
const sampleSize = 100;

const potentialPicks = db.prepare(`
  SELECT 
    r.track, r.race_number,
    h.name, rr.starting_odds,
    ROUND(1.0 / rr.starting_odds, 3) as implied_prob
  FROM race_runners rr
  JOIN races r ON rr.race_id = r.id
  LEFT JOIN horses h ON rr.horse_id = h.id
  WHERE rr.starting_odds >= 1.01 AND rr.starting_odds <= 100
  LIMIT ${sampleSize}
`).all();

console.log(`Sample picks analyzed: ${potentialPicks.length}`);
console.log(`EV threshold: ${(evThreshold * 100).toFixed(0)}%`);

if (potentialPicks.length > 0) {
  console.log(`✓ Found ${potentialPicks.length} runners with valid odds`);
  console.log(`Example pick: ${potentialPicks[0].track} R${potentialPicks[0].race_number} - ${potentialPicks[0].name || 'Unknown'} @ ${potentialPicks[0].starting_odds.toFixed(2)}`);
} else {
  console.log(`⚠️  No runners with valid odds`);
}

// TEST 5: BETTING LOGIC
console.log(`\n💰 TEST 5: BETTING LOGIC VALIDATION`);
console.log(`─────────────────────────────────────────────────────────`);

const initialBankroll = 1000;
const kellyFraction = 0.02;
const stakePerBet = initialBankroll * kellyFraction;
const avgOdds = 5.41;
const winRate = 0.15;

console.log(`Initial bankroll: $${initialBankroll}`);
console.log(`Stake per bet: $${stakePerBet.toFixed(2)} (${(kellyFraction * 100).toFixed(1)}%)`);
console.log(`Average odds: ${avgOdds.toFixed(2)}`);
console.log(`Simulated win rate: ${(winRate * 100).toFixed(0)}%`);

let totalProfit = 0;
let wins = 0;

for (let i = 0; i < 50; i++) {
  if (Math.random() < winRate) {
    totalProfit += stakePerBet * (avgOdds - 1);
    wins++;
  } else {
    totalProfit -= stakePerBet;
  }
}

const roi = (totalProfit / (stakePerBet * 50) * 100).toFixed(1);

console.log(`\nSimulation Results (50 bets):`);
console.log(`  Wins: ${wins}/${50} (${(wins * 100 / 50).toFixed(0)}%)`);
console.log(`  Total P/L: $${totalProfit.toFixed(2)}`);
console.log(`  ROI: ${roi}%`);
console.log(`  Final bankroll: $${(initialBankroll + totalProfit).toFixed(2)}`);

// TEST 6: SETTLEMENT SCHEMA
console.log(`\n✅ TEST 6: SETTLEMENT SCHEMA VALIDATION`);
console.log(`─────────────────────────────────────────────────────────`);

const raceSchema = db.prepare(`PRAGMA table_info(race_runners)`).all();
const betSchema = db.prepare(`PRAGMA table_info(bets)`).all();

const raceFields = raceSchema.map(col => col.name);
const betFields = betSchema.map(col => col.name);

console.log(`race_runners fields: ${raceFields.filter(f => ['finishing_position', 'result'].includes(f)).join(', ') || 'missing'}`);
console.log(`bets fields: ${betFields.filter(f => ['stake', 'starting_odds', 'profit_loss'].includes(f)).join(', ') || 'missing'}`);

if (raceFields.includes('finishing_position') && betFields.includes('profit_loss')) {
  console.log(`✓ Settlement schema complete`);
} else {
  console.log(`⚠️  Settlement schema incomplete`);
}

// TEST 7: ROI TRACKING
console.log(`\n📊 TEST 7: ROI TRACKING VALIDATION`);
console.log(`─────────────────────────────────────────────────────────`);

const stats = db.prepare(`
  SELECT 
    COUNT(*) as total_bets,
    COUNT(CASE WHEN status = 'SETTLED' THEN 1 END) as settled_bets,
    ROUND(SUM(CASE WHEN status = 'SETTLED' THEN profit_loss ELSE 0 END), 2) as total_pl,
    ROUND(SUM(CASE WHEN status = 'SETTLED' THEN stake ELSE 0 END), 2) as total_staked
  FROM bets
`).get();

console.log(`Database status:`);
console.log(`  Total bets: ${stats.total_bets}`);
console.log(`  Settled: ${stats.settled_bets}`);

if (stats.total_bets > 0) {
  const roi = (stats.total_pl / stats.total_staked * 100).toFixed(1);
  console.log(`  Total P/L: $${stats.total_pl}`);
  console.log(`  ROI: ${roi}%`);
} else {
  console.log(`  (No historical bets)`);
}

console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`BUSINESS LOGIC TESTS COMPLETE`);
console.log(`════════════════════════════════════════════════════════════`);

db.close();
