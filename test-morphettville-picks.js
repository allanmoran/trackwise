import db from './backend/src/db.js';

console.log("🏇 Generating Picks for Morphettville April 11\n");

const races = db.prepare(`
  SELECT id, track, race_number, race_name
  FROM races
  WHERE date = '2026-04-11' AND track = 'Morphettville'
  ORDER BY race_number
`).all();

console.log(`📊 Found ${races.length} races\n`);

const MIN_CONFIDENCE = 75;
const MAX_ODDS = 7.0;
let totalPicks = 0;
let placeablePicks = 0;

for (const race of races) {
  const runners = db.prepare(`
    SELECT
      h.name as horse,
      rr.starting_odds as odds,
      COALESCE(h.strike_rate, 0.20) as horse_sr,
      COALESCE(h.form_score, 60) as form,
      COALESCE(j.strike_rate, 0.20) as jockey_sr,
      COALESCE(t.strike_rate, 0.20) as trainer_sr
    FROM race_runners rr
    JOIN horses h ON rr.horse_id = h.id
    LEFT JOIN jockeys j ON rr.jockey_id = j.id
    LEFT JOIN trainers t ON rr.trainer_id = t.id
    WHERE rr.race_id = ?
  `).all(race.id);

  const picks = runners.map(r => {
    const sr_comp = r.horse_sr * 0.6 + r.jockey_sr * 0.2 + r.trainer_sr * 0.2;
    const confidence = Math.round(sr_comp * 0.35 + r.form * 0.30);
    return { horse: r.horse, odds: r.odds || 0, confidence, sr: Math.round(r.horse_sr * 100) };
  }).sort((a, b) => b.confidence - a.confidence);

  const placeable = picks.filter(p => p.confidence >= MIN_CONFIDENCE && p.odds > 0 && p.odds <= MAX_ODDS);
  totalPicks += picks.length;
  placeablePicks += placeable.length;

  if (race.race_number <= 3 || placeable.length > 0) {
    console.log(`R${race.race_number}: ${picks.length} runners, ${placeable.length} placeable`);
    if (picks.length > 0) {
      console.log(`  Top: ${picks[0].horse} @ $${picks[0].odds} (${picks[0].confidence}% conf, ${picks[0].sr}% SR)`);
    }
  }
}

console.log(`\n✅ Total: ${totalPicks} picks, ${placeablePicks} placeable (${Math.round(placeablePicks/totalPicks*100)}%)`);
process.exit(0);
