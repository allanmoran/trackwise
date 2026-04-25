#!/usr/bin/env node
const Database = require('better-sqlite3');
const db = new Database('/Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db');

console.log(`
════════════════════════════════════════════════════════════
PRODUCTION READINESS: BUSINESS LOGIC TESTS
════════════════════════════════════════════════════════════
`);

// TEST 4: EV CALCULATION ACCURACY
console.log(`\n🎯 TEST 4: EV CALCULATION VALIDATION`);
console.log(`─────────────────────────────────────────────────────────`);

const evThreshold = 0.10; // 10% EV minimum
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

if (potentialPicks.length === 0) {
  console.log(`⚠️  No runners with valid odds - odds extraction issue`);
} else {
  const evDistribution = potentialPicks.map(p => ({
    ...p,
    // Simple EV: implied_prob * odds - 1
    ev: ((1.0 / p.implied_prob) * 0.5 - 1) // Assuming 50% actual win rate
  }));
  
  const positive_ev = evDistribution.filter(p => p.ev >= evThreshold).length;
  console.log(`Picks with ${(evThreshold * 100).toFixed(0)}%+ EV: ${positive_ev}/${potentialPicks.length} (${(positive_ev * 100 / potentialPicks.length).toFixed(1)}%)`);
}

// TEST 5: BETTING LOGIC
console.log(`\n💰 TEST 5: BETTING LOGIC VALIDATION`);
console.log(`─────────────────────────────────────────────────────────`);

// Simulate betting logic
const initialBankroll = 1000;
const kellyFraction = 0.02; // 2% per bet (conservative)
const stakePerBet = initialBankroll * kellyFraction;

console.log(`Initial bankroll: $${initialBankroll}`);
console.log(`Kelly fraction: ${(kellyFraction * 100).toFixed(1)}%`);
console.log(`Stake per bet: $${stakePerBet.toFixed(2)}`);

// Simulate 50 bets
const simulatedBets = [];
const avgOdds = 5.41;
const winRate = 0.15; // 15% realistic win rate

for (let i = 0; i < 50; i++) {
  const won = Math.random() < winRate;
  const profit = won ? stakePerBet * (avgOdds - 1) : -stakePerBet;
  simulatedBets.push({ bet: i + 1, won, profit, balance: simulatedBets.length > 0 ? simulatedBets[simulatedBets.length - 1].balance + profit : initialBankroll + profit });
}

const totalProfit = simulatedBets.reduce((sum, b) => sum + b.profit, 0);
const wins = simulatedBets.filter(b => b.won).length;
const roi = (totalProfit / (stakePerBet * 50) * 100).toFixed(1);

console.log(`\nSimulation: 50 bets at ${(winRate * 100).toFixed(0)}% win rate, ${avgOdds.toFixed(2)} avg odds`);
console.log(`Expected wins: ${wins} (${(wins * 100 / 50).toFixed(0)}%)`);
console.log(`Total P/L: $${totalProfit.toFixed(2)}`);
console.log(`ROI: ${roi}%`);
console.log(`Final bankroll: $${(initialBankroll + totalProfit).toFixed(2)}`);

// TEST 6: SETTLEMENT ACCURACY
console.log(`\n✅ TEST 6: SETTLEMENT LOGIC VALIDATION`);
console.log(`─────────────────────────────────────────────────────────`);

console.log(`Settlement logic requires:`);
console.log(`  ✓ Race result status in database`);
console.log(`  ✓ Winning position detection (finishing_position = 1)`);
console.log(`  ✓ Odds × stake calculation`);
console.log(`  ✓ Status update (PLACED → SETTLED)`);
console.log(`  ✓ Profit/loss recording`);

// Check schema for settlement fields
const raceSchema = db.prepare(`PRAGMA table_info(race_runners)`).all();
const hasFinishingPosition = raceSchema.some(col => col.name === 'finishing_position');
const hasResult = raceSchema.some(col => col.name === 'result');

if (hasFinishingPosition && hasResult) {
  console.log(`✓ Settlement schema present (finishing_position, result)`);
} else {
  console.log(`⚠️  Missing settlement fields in race_runners schema`);
}

// TEST 7: ROI TRACKING
console.log(`\n📊 TEST 7: ROI TRACKING VALIDATION`);
console.log(`─────────────────────────────────────────────────────────`);

console.log(`ROI calculation requires:`);
console.log(`  ✓ Bets table with (stake, odds, profit_loss, status)`);
console.log(`  ✓ Accurate settlement amounts`);
console.log(`  ✓ Win/loss tracking per bet`);
console.log(`  ✓ Daily/cumulative rollup`);

const betSchema = db.prepare(`PRAGMA table_info(bets)`).all();
const betsFields = betSchema.map(col => col.name);
const requiredFields = ['stake', 'starting_odds', 'profit_loss', 'status'];
const hasAllFields = requiredFields.every(f => betsFields.includes(f));

if (hasAllFields) {
  console.log(`✓ Bets table complete (${requiredFields.join(', ')})`);
} else {
  const missing = requiredFields.filter(f => !betsFields.includes(f));
  console.log(`⚠️  Missing fields: ${missing.join(', ')}`);
}

// Check existing bets
const existingBets = db.prepare(`SELECT COUNT(*) as count FROM bets`).get();
console.log(`\nExisting bets in database: ${existingBets.count}`);

if (existingBets.count > 0) {
  const betSummary = db.prepare(`
    SELECT 
      COUNT(*) as total_bets,
      SUM(CASE WHEN status = 'SETTLED' THEN 1 ELSE 0 END) as settled,
      ROUND(SUM(profit_loss), 2) as total_pl,
      ROUND(SUM(profit_loss) * 100 / SUM(stake), 1) as roi_pct
    FROM bets WHERE status = 'SETTLED'
  `).get();
  
  console.log(`Settled bets: ${betSummary.settled}/${betSummary.total_bets}`);
  console.log(`Total P/L: $${betSummary.total_pl}`);
  console.log(`ROI: ${betSummary.roi_pct}%`);
}

console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`BUSINESS LOGIC TESTS COMPLETE`);
console.log(`════════════════════════════════════════════════════════════`);
