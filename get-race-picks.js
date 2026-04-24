import db from './backend/src/db.js';
import RacePredictor from './backend/src/ml/predictor.js';

const raceId = 3535;

const race = db.prepare('SELECT * FROM races WHERE id = ?').get(raceId);

if (!race) {
  console.log('❌ Race not found');
  process.exit(0);
}

console.log(`\n🏇 Picks for ${race.track} R${race.race_number}`);
console.log(`📝 ${race.race_name}`);
console.log(`📏 Distance: ${race.distance}m | Condition: ${race.condition}`);
console.log('\n' + '═'.repeat(100));

const picks = RacePredictor.generatePicksWithPredictions(raceId);

console.log(`\n${picks.length} Runners:\n`);

picks.forEach((pick, idx) => {
  const ev = Math.max(pick.ev_win || -999, pick.ev_place || -999);
  const odds = pick.odds ? `$${pick.odds.toFixed(2)}` : '❌ NO ODDS';
  
  console.log(`${idx + 1}. ${pick.horse.padEnd(25)}`);
  console.log(`   Odds: ${odds.padEnd(10)} | Prob: ${Math.round(pick.predicted_win_prob)}% | EV: ${ev.toFixed(3)}`);
  console.log(`   Jockey: ${pick.jockey || 'N/A'}`);
  console.log(`   Trainer: ${pick.trainer || 'N/A'}`);
  console.log(`   Recommendation: ${pick.recommendation}`);
  console.log(`   Bet Type: ${pick.best_bet}`);
  console.log();
});

console.log('═'.repeat(100));
console.log('\n⚠️  Issue: No odds extracted from page');
console.log('   The page HTML structure may be different than expected.');
console.log('   System needs valid odds to calculate EV and make bets.\n');

process.exit(0);
