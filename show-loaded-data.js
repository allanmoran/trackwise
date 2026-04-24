import db from './backend/src/db.js';
import RacePredictor from './backend/src/ml/predictor.js';

const raceId = 3535;

// Check what we actually loaded
const race = db.prepare('SELECT * FROM races WHERE id = ?').get(raceId);
const runners = db.prepare(`
  SELECT rr.id, h.name as horse, rr.starting_odds as odds,
         j.name as jockey, t.name as trainer
  FROM race_runners rr
  JOIN horses h ON rr.horse_id = h.id
  LEFT JOIN jockeys j ON rr.jockey_id = j.id
  LEFT JOIN trainers t ON rr.trainer_id = t.id
  WHERE rr.race_id = ?
  ORDER BY rr.id
`).all(raceId);

console.log(`\n📋 Loaded Data for Race ${raceId}`);
console.log(`Track: ${race.track} | Race: ${race.race_number} | Distance: ${race.distance}`);
console.log(`Condition: ${race.condition} | Name: ${race.race_name}\n`);

console.log(`Runners: ${runners.length}\n`);
console.log('═'.repeat(80));

runners.forEach((r, idx) => {
  console.log(`${idx + 1}. ${r.horse.padEnd(20)} @ $${(r.odds || 0).toFixed(2)} | J: ${r.jockey || 'N/A'} | T: ${r.trainer || 'N/A'}`);
});

console.log('\n═'.repeat(80));
console.log('\n⚠️  Issue: Horse names are showing as times (12:11, 12:05, etc.)');
console.log('   These are start times, not horse names.');
console.log('   Need to fix table column extraction in scraper.\n');

// Now generate picks with this data
console.log('📊 Generating Picks with Current Data:\n');
const picks = RacePredictor.generatePicksWithPredictions(raceId);

const withOdds = picks.filter(p => p.odds && p.odds > 0);
const highEV = picks.filter(p => {
  const ev = Math.max(p.ev_win || -999, p.ev_place || -999);
  return ev > 0.05;
});

console.log(`Picks with odds: ${withOdds.length}`);
console.log(`High-EV picks (>0.05): ${highEV.length}\n`);

highEV.slice(0, 5).forEach((p, idx) => {
  const ev = Math.max(p.ev_win || -999, p.ev_place || -999);
  console.log(`${idx + 1}. ${p.horse} @ $${p.odds} | EV: ${ev.toFixed(3)} | ${p.recommendation}`);
});

process.exit(0);
