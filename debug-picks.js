import db from './backend/src/db.js';
import RacePredictor from './backend/src/ml/predictor.js';

const races = db.prepare(`
  SELECT r.id, r.track, r.race_number,
         COUNT(rr.id) as runners,
         SUM(CASE WHEN rr.starting_odds > 0 THEN 1 ELSE 0 END) as with_odds
  FROM races r
  LEFT JOIN race_runners rr ON r.id = rr.race_id
  WHERE r.date = '2026-04-11' AND r.track NOT IN ('Aintree Uk', 'Abu Dhabi Ae')
  GROUP BY r.id
  ORDER BY runners DESC
  LIMIT 3
`).all();

console.log(`\n📍 Sample races (${races.length} found):\n`);

for (const race of races) {
  console.log(`${race.track} R${race.race_number}: ${race.runners} runners, ${race.with_odds} with odds`);
  
  const picks = RacePredictor.generatePicksWithPredictions(race.id);
  console.log(`Generated ${picks.length} picks\n`);
  
  if (picks.length > 0) {
    picks.slice(0, 5).forEach(p => {
      const ev = Math.max(p.ev_win || -999, p.ev_place || -999);
      console.log(
        `  ${p.horse.padEnd(20)} @ $${(p.odds || 0).toFixed(2)} | ` +
        `${Math.round(p.predicted_win_prob)}% | EV: ${ev.toFixed(3)} | ${p.recommendation}`
      );
    });
  }
  console.log();
}

process.exit(0);
