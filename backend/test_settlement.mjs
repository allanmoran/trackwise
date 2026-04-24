import Database from 'better-sqlite3';

const db = new Database('./data/trackwise.db');

console.log('🧪 TEST SETTLEMENT - Simulating Race Results\n');
console.log('==============================================\n');

// Simulate results for our 10 test bets
const testResults = [
  { bet_id: 289, race_id: 93160, horse: 'Aristocrat', result: 'WIN' },
  { bet_id: 290, race_id: 93176, horse: 'Just Like Liam', result: 'LOSS' },
  { bet_id: 291, race_id: 165, horse: 'Wonder Step', result: 'PLACE' },
  { bet_id: 292, race_id: 93176, horse: 'Just Like Liam', result: 'WIN' },
  { bet_id: 293, race_id: 148, horse: 'Wonder Step', result: 'LOSS' },
  { bet_id: 294, race_id: 93176, horse: 'Just Like Liam', result: 'LOSS' },
  { bet_id: 295, race_id: 163, horse: 'Clifton Springs', result: 'PLACE' },
  { bet_id: 296, race_id: 148, horse: 'Wonder Step', result: 'LOSS' },
  { bet_id: 297, race_id: 93176, horse: 'Overloaded', result: 'WIN' },
  { bet_id: 298, race_id: 93176, horse: 'Overloaded', result: 'LOSS' }
];

console.log('Simulating results for test bets:\n');

for (const test of testResults) {
  // Get bet odds
  const bet = db.prepare('SELECT opening_odds, stake FROM bets WHERE id = ?').get(test.bet_id);
  if (!bet) continue;

  // Calculate profit/loss
  let profitLoss = 0;
  if (test.result === 'WIN') {
    profitLoss = bet.stake * (bet.opening_odds - 1);
  } else if (test.result === 'PLACE') {
    profitLoss = bet.stake * ((bet.opening_odds - 1) / 4);
  } else {
    profitLoss = -bet.stake;
  }

  // Update bet
  db.prepare(`
    UPDATE bets
    SET status = 'SETTLED',
        result = ?,
        profit_loss = ?,
        settled_at = datetime('now')
    WHERE id = ?
  `).run(test.result, profitLoss, test.bet_id);

  console.log(`  ✅ Bet ${test.bet_id}: ${test.horse} - ${test.result} ($${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)})`);
}

console.log('\n' + '='.repeat(50));
console.log('📊 SETTLEMENT RESULTS\n');

// Calculate summary
const summary = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN result = 'PLACE' THEN 1 ELSE 0 END) as places,
    SUM(CASE WHEN result IS NULL OR (result != 'WIN' AND result != 'PLACE') THEN 1 ELSE 0 END) as losses,
    ROUND(SUM(stake), 2) as total_stake,
    ROUND(SUM(profit_loss), 2) as total_pl,
    ROUND(SUM(profit_loss) / SUM(stake) * 100, 1) as roi_pct
  FROM bets
  WHERE id BETWEEN 289 AND 298
`).get();

console.log(`Total Bets: ${summary.total}`);
console.log(`Results: ${summary.wins} W, ${summary.places} P, ${summary.losses} L`);
console.log(`Win Rate: ${(summary.wins / summary.total * 100).toFixed(1)}%`);
console.log(`\nTotal Stake: $${summary.total_stake}`);
console.log(`Profit/Loss: $${summary.total_pl}`);
console.log(`ROI: ${summary.roi_pct}%`);

console.log(`\n✅ Settlement test complete!`);
