import db from './backend/src/db.js';

console.log("🏇 Generating Picks for April 11 (Most Recent AU/NZ Racing)\n");

const testDate = '2026-04-11';

const races = db.prepare(`
  SELECT id, track, race_number, race_name
  FROM races
  WHERE date = ? AND track NOT IN ('Aintree Uk', 'Ascot Uk')
  ORDER BY track, race_number
  LIMIT 3
`).all(testDate);

console.log(`📊 Testing with ${races.length} races from ${testDate}\n`);

const MIN_CONFIDENCE = 75;
const MAX_ODDS = 7.0;
let totalPicks = 0;
let placeablePicks = 0;

for (const race of races) {
  console.log(`\n${race.track} R${race.race_number}:`);

  const runners = db.prepare(`
    SELECT
      h.name as horse,
      rr.starting_odds as odds,
      COALESCE(h.strike_rate, 0.20) as horse_strike_rate,
      COALESCE(h.form_score, 60) as horse_form_score,
      COALESCE(j.strike_rate, 0.20) as jockey_strike_rate,
      COALESCE(t.strike_rate, 0.20) as trainer_strike_rate
    FROM race_runners rr
    JOIN horses h ON rr.horse_id = h.id
    LEFT JOIN jockeys j ON rr.jockey_id = j.id
    LEFT JOIN trainers t ON rr.trainer_id = t.id
    WHERE rr.race_id = ?
  `).all(race.id);

  const picks = runners.map(r => {
    const strikeRateComponent = r.horse_strike_rate * 0.6 + r.jockey_strike_rate * 0.2 + r.trainer_strike_rate * 0.2;
    const formComponent = r.horse_form_score;
    const confidence = Math.min(100, strikeRateComponent * 0.35 + formComponent * 0.30);
    return {
      horse: r.horse,
      odds: r.odds || 0,
      confidence: Math.round(confidence),
      strikeRate: Math.round(r.horse_strike_rate * 100)
    };
  });

  picks.sort((a, b) => b.confidence - a.confidence);
  const placeable = picks.filter(p => p.confidence >= MIN_CONFIDENCE && p.odds > 0 && p.odds <= MAX_ODDS);

  console.log(`  Runners: ${picks.length}`);
  console.log(`  Placeable: ${placeable.length}`);
  if (placeable.length > 0) {
    console.log(`  ✓ Top pick: ${placeable[0].horse} @ $${placeable[0].odds} (${placeable[0].confidence}% conf)`);
  } else if (picks.length > 0) {
    console.log(`  ⚠️ Top pick: ${picks[0].horse} @ $${picks[0].odds} (${picks[0].confidence}% conf) - below threshold`);
  }

  totalPicks += picks.length;
  placeablePicks += placeable.length;
}

console.log(`\n📊 Summary: ${placeablePicks} placeable picks out of ${totalPicks} total`);
process.exit(0);
