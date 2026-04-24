import db from './backend/src/db.js';

console.log("🏇 Generating Picks for Today's Races (2026-04-12)\n");

const today = new Date().toISOString().split('T')[0];

const todayRaces = db.prepare(`
  SELECT id, track, race_number, race_name, distance
  FROM races
  WHERE date = ?
  ORDER BY track, race_number
`).all(today);

console.log(`📊 Found ${todayRaces.length} races for today\n`);

let totalPicks = 0;
let placeablePicks = 0;
const MIN_CONFIDENCE = 75;
const MAX_ODDS = 7.0;

for (const race of todayRaces) {
  console.log(`\n${race.track} R${race.race_number}:`);

  const runners = db.prepare(`
    SELECT
      rr.id as runner_id,
      h.id as horse_id,
      h.name as horse,
      j.name as jockey,
      t.name as trainer,
      rr.starting_odds as odds,
      COALESCE(h.roi, 0) as horse_roi,
      COALESCE(h.strike_rate, 0.25) as horse_strike_rate,
      COALESCE(h.form_score, 60) as horse_form_score,
      COALESCE(j.roi, 0) as jockey_roi,
      COALESCE(j.strike_rate, 0.20) as jockey_strike_rate,
      COALESCE(t.roi, 0) as trainer_roi,
      COALESCE(t.strike_rate, 0.20) as trainer_strike_rate
    FROM race_runners rr
    JOIN horses h ON rr.horse_id = h.id
    LEFT JOIN jockeys j ON rr.jockey_id = j.id
    LEFT JOIN trainers t ON rr.trainer_id = t.id
    WHERE rr.race_id = ?
    ORDER BY h.strike_rate DESC
  `).all(race.id);

  console.log(`  Runners: ${runners.length}`);

  const picks = runners.map(runner => {
    const roiComponent = (
      (runner.horse_roi || 0) * 0.5 +
      (runner.jockey_roi || 0) * 0.25 +
      (runner.trainer_roi || 0) * 0.25
    );

    const strikeRateComponent = (
      (runner.horse_strike_rate || 0) * 0.6 +
      (runner.jockey_strike_rate || 0) * 0.2 +
      (runner.trainer_strike_rate || 0) * 0.2
    );

    const formComponent = runner.horse_form_score || 50;

    const confidence = Math.min(100, Math.max(0,
      (roiComponent * 0.35) + (strikeRateComponent * 0.35) + (formComponent * 0.30)
    ));

    return {
      horse: runner.horse,
      odds: runner.odds || 0,
      confidence: Math.round(confidence),
      strikeRate: Math.round(runner.horse_strike_rate * 100),
      jockey: runner.jockey || 'N/A',
      trainer: runner.trainer || 'N/A'
    };
  });

  picks.sort((a, b) => b.confidence - a.confidence);

  const placeable = picks.filter(p => p.confidence >= MIN_CONFIDENCE && p.odds <= MAX_ODDS && p.odds > 0);
  console.log(`  Confidence range: ${Math.min(...picks.map(p => p.confidence))}% - ${Math.max(...picks.map(p => p.confidence))}%`);
  console.log(`  Placeable (conf≥${MIN_CONFIDENCE}%, odds≤${MAX_ODDS}): ${placeable.length}/${picks.length}`);
  
  if (placeable.length > 0) {
    console.log(`  Top placeable:`);
    placeable.slice(0, 3).forEach(p => {
      console.log(`    ${p.horse} @ $${p.odds} (${p.confidence}% conf, ${p.strikeRate}% SR) - ${p.jockey}`);
    });
  } else if (picks.length > 0) {
    console.log(`  Top 3 picks (below threshold):`);
    picks.slice(0, 3).forEach(p => {
      console.log(`    ${p.horse} @ $${p.odds} (${p.confidence}% conf, ${p.strikeRate}% SR)`);
    });
  }

  totalPicks += picks.length;
  placeablePicks += placeable.length;
}

console.log(`\n📈 Summary:`);
console.log(`  Total picks: ${totalPicks}`);
console.log(`  Placeable: ${placeablePicks} (${((placeablePicks/totalPicks)*100).toFixed(1)}%)`);
console.log(`  Filtered out: ${totalPicks - placeablePicks}`);

process.exit(0);
