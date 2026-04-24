import db from './backend/src/db.js';
import RacePredictor from './backend/src/ml/predictor.js';

console.log('🤖 Testing ML-Based Pick Generation\n');

// Find a race with runners and odds
const raceWithOdds = db.prepare(`
  SELECT r.id, r.track, r.race_number, COUNT(rr.id) as runners
  FROM races r
  LEFT JOIN race_runners rr ON r.id = rr.race_id
  WHERE rr.starting_odds IS NOT NULL AND rr.starting_odds > 0
  GROUP BY r.id
  LIMIT 5
`).all();

console.log(`Searching for races with odds... Found ${raceWithOdds.length}`);

if (raceWithOdds.length === 0) {
  console.log('⚠️ No races with valid odds found in current KB');
  console.log('\nNote: Betfair data has NULL odds. System needs Sportsbet scraper for real odds.');
  
  // Test with a synthetic race instead
  console.log('\n📊 Testing prediction model with synthetic data...\n');
  
  const testRace = db.prepare('SELECT id FROM races LIMIT 1').get();
  if (testRace) {
    const picks = RacePredictor.generatePicksWithPredictions(testRace.id);
    console.log(`Generated ${picks.length} picks`);
    
    if (picks.length > 0) {
      console.log('\nTop 5 predicted picks:');
      picks.slice(0, 5).forEach((pick, idx) => {
        console.log(`${idx + 1}. ${pick.horse}`);
        console.log(`   Win Prob: ${pick.predicted_win_prob}%`);
        console.log(`   EV (WIN): ${pick.ev_win || 'N/A'}`);
        console.log(`   EV (PLACE): ${pick.ev_place || 'N/A'}`);
        console.log(`   Recommendation: ${pick.recommendation}`);
      });
    }
  }
} else {
  console.log('\n✓ Found races with valid odds!\n');
  
  raceWithOdds.slice(0, 2).forEach(race => {
    console.log(`\n${race.track} R${race.race_number} (${race.runners} runners):`);
    
    const picks = RacePredictor.generatePicksWithPredictions(race.id);
    const strongPicks = picks.filter(p => p.recommendation === 'STRONG_BUY' || p.recommendation === 'BUY');
    
    console.log(`Total picks: ${picks.length}`);
    console.log(`Strong/Buy picks: ${strongPicks.length}`);
    
    if (strongPicks.length > 0) {
      console.log('\nTop recommendations:');
      strongPicks.slice(0, 3).forEach((pick, idx) => {
        console.log(`${idx + 1}. ${pick.horse} @ $${pick.odds}`);
        console.log(`   Win Prob: ${pick.predicted_win_prob}%`);
        console.log(`   EV: ${pick.ev_win || pick.ev_place}`);
        console.log(`   Bet: ${pick.best_bet}`);
      });
    }
  });
}

// Show model accuracy
console.log('\n📈 Model Calibration (Historical):');
const accuracy = RacePredictor.analyzeAccuracy();
console.log(`Total predictions: ${accuracy.total_predictions}`);
console.log(`Actual win rate: ${accuracy.win_rate}%`);
console.log(`Avg predicted prob: ${accuracy.avg_predicted_prob}%`);
console.log(`Calibration error: ±${accuracy.calibration_error}%`);

process.exit(0);
