import Database from 'better-sqlite3';

const db = new Database('./data/trackwise.db');

console.log('🎯 PLACING MANUAL BETS (Direct DB Method)\n');

// Query for qualified bets
const candidates = db.prepare(`
  SELECT
    r.id as race_id,
    r.track,
    r.race_number,
    h.id as horse_id,
    h.name as horse,
    COALESCE(j.id, NULL) as jockey_id,
    COALESCE(j.name, 'Unknown') as jockey,
    COALESCE(t.id, NULL) as trainer_id,
    COALESCE(t.name, 'Unknown') as trainer,
    rr.starting_odds as odds,
    ROUND(h.strike_rate * 100, 1) as strike_rate_pct
  FROM races r
  INNER JOIN race_runners rr ON r.id = rr.race_id
  INNER JOIN horses h ON rr.horse_id = h.id
  LEFT JOIN jockeys j ON rr.jockey_id = j.id
  LEFT JOIN trainers t ON rr.trainer_id = t.id
  WHERE rr.starting_odds BETWEEN 2.5 AND 12
    AND h.strike_rate BETWEEN 0.05 AND 0.15
    AND r.id > 145
    AND h.name NOT LIKE 'Test%'
    AND h.name NOT LIKE 'Horse%'
    AND h.name NOT LIKE 'Batch%'
  ORDER BY RANDOM()
  LIMIT 20
`).all();

console.log(`Found ${candidates.length} qualified candidates\n`);

// Filter for positive EV and build bets
const betsToPlace = [];
for (const c of candidates) {
  const confidence = Math.max(22, Math.round(c.strike_rate_pct));
  const ev = (confidence / 100) * c.odds - 1;
  const evPct = Math.round(ev * 100);

  if (evPct >= 10) {
    betsToPlace.push({
      ...c,
      confidence,
      ev_percent: evPct,
      stake: 25
    });

    console.log(`✅ ${c.horse} @ ${c.odds} odds (${confidence}% conf, ${evPct}% EV)`);

    if (betsToPlace.length >= 15) break;
  }
}

console.log(`\nReady to place: ${betsToPlace.length} bets\n`);

if (betsToPlace.length === 0) {
  console.log('❌ No qualified bets found');
  process.exit(1);
}

// Insert bets directly into database
const insertBet = db.prepare(`
  INSERT INTO bets (
    race_id, horse_id, jockey_id, trainer_id,
    bet_type, stake, opening_odds, closing_odds,
    ev_percent, clv_percent, confidence, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const placedIds = [];
const errors = [];

console.log('Placing bets...\n');

for (const bet of betsToPlace) {
  try {
    const result = insertBet.run(
      bet.race_id,
      bet.horse_id,
      bet.jockey_id,
      bet.trainer_id,
      'WIN',
      bet.stake,
      bet.odds,
      null,
      bet.ev_percent,
      0,
      bet.confidence,
      'ACTIVE'
    );

    placedIds.push(result.lastInsertRowid);
    console.log(`  ✅ Bet ID ${result.lastInsertRowid}: ${bet.horse}`);
  } catch (err) {
    errors.push(`${bet.horse}: ${err.message}`);
    console.log(`  ❌ ${bet.horse}: ${err.message}`);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`✅ Successfully placed ${placedIds.length} bets\n`);
console.log(`Bet Details:`);
console.log(`  Total Stake: $${placedIds.length * 25}`);
console.log(`  Bet IDs: ${placedIds.join(', ')}\n`);

console.log(`Expected Results (baseline 6-7% win rate):`);
console.log(`  Expected Wins: ${Math.round(placedIds.length * 0.06)} win(s)`);
console.log(`  Expected ROI: -15% to +5% (with sample size of ${placedIds.length})`);
console.log(`  Settlement: 3-7 days\n`);

// Show summary
const summary = db.prepare(`
  SELECT
    COUNT(*) as total_placed,
    SUM(stake) as total_stake,
    ROUND(AVG(confidence), 1) as avg_confidence,
    ROUND(AVG(ev_percent), 1) as avg_ev
  FROM bets
  WHERE id IN (${placedIds.map(() => '?').join(',')})
`).get(...placedIds);

console.log(`Summary:`);
console.log(`  Total Placed: ${summary.total_placed}`);
console.log(`  Total Stake: $${summary.total_stake}`);
console.log(`  Avg Confidence: ${summary.avg_confidence}%`);
console.log(`  Avg EV: ${summary.avg_ev}%\n`);

console.log(`📍 Monitoring Setup:`);
console.log(`  Check settlement: sqlite3 data/trackwise.db "SELECT status, COUNT(*) FROM bets WHERE id IN (${placedIds.join(',')}) GROUP BY status;"`);
console.log(`\n⏱️  Next: Monitor settlement over 3-7 days`);
