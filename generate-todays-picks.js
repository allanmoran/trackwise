import db from './backend/src/db.js';
import RacePredictor from './backend/src/ml/predictor.js';

console.log('🏇 Generating Today\'s Picks\n');

const today = new Date().toISOString().split('T')[0];
console.log(`📅 Date: ${today}\n`);

// Get today's races with runners
const races = db.prepare(`
  SELECT r.id, r.track, r.race_number, r.race_name, r.distance,
         COUNT(rr.id) as runner_count,
         SUM(CASE WHEN rr.starting_odds IS NOT NULL AND rr.starting_odds > 0 THEN 1 ELSE 0 END) as runners_with_odds
  FROM races r
  LEFT JOIN race_runners rr ON r.id = rr.race_id
  WHERE r.date = ? AND r.track NOT IN ('Aintree Uk', 'Ascot Uk')
  GROUP BY r.id
  HAVING runner_count > 0
  ORDER BY r.track, r.race_number
`).all(today);

console.log(`Found ${races.length} AU/NZ races for today\n`);

if (races.length === 0) {
  console.log('⚠️  No AU/NZ races found for today');
  console.log('\nChecking available dates in KB...');
  
  const availableDates = db.prepare(`
    SELECT DISTINCT date, COUNT(*) as races
    FROM races
    WHERE track NOT IN ('Aintree Uk', 'Ascot Uk')
    GROUP BY date
    ORDER BY date DESC
    LIMIT 5
  `).all();
  
  console.log('Recent AU/NZ racing dates:');
  availableDates.forEach(d => {
    console.log(`  ${d.date}: ${d.races} races`);
  });
  process.exit(0);
}

let totalPicks = 0;
let highValuePicks = 0;

console.log('═'.repeat(80));

for (const race of races) {
  console.log(`\n${race.track.toUpperCase()} R${race.race_number} - ${race.distance}m`);
  console.log(`${race.race_name}`);
  console.log(`Runners: ${race.runner_count} (${race.runners_with_odds} with odds)`);
  console.log('-'.repeat(80));

  const picks = RacePredictor.generatePicksWithPredictions(race.id);
  
  if (picks.length === 0) {
    console.log('⚠️  No runners found');
    continue;
  }

  // Filter for high-value picks
  const highValue = picks.filter(p => 
    (p.ev_win && p.ev_win > 0.10) || (p.ev_place && p.ev_place > 0.10)
  );

  highValuePicks += highValue.length;
  totalPicks += picks.length;

  // Display top picks
  const displayPicks = picks.slice(0, 5);
  
  displayPicks.forEach((pick, idx) => {
    const evDisplay = Math.max(pick.ev_win || -999, pick.ev_place || -999);
    const betType = pick.best_bet || 'WIN';
    const confidence = Math.round(pick.predicted_win_prob);
    
    let recommendation = '⚠️ ';
    if (pick.recommendation === 'STRONG_BUY') {
      recommendation = '🟢 ';
    } else if (pick.recommendation === 'BUY') {
      recommendation = '🟡 ';
    } else if (pick.recommendation === 'HOLD') {
      recommendation = '🔵 ';
    }
    
    console.log(
      `${recommendation} ${pick.horse.padEnd(20)} @ $${(pick.odds || 0).toFixed(2).padStart(6)} | ` +
      `${confidence}% prob | EV: ${evDisplay.toFixed(2)} | ${betType}`
    );
  });

  if (picks.length > 5) {
    console.log(`   ... and ${picks.length - 5} more runners`);
  }
}

console.log('\n' + '═'.repeat(80));
console.log('\n📊 DAILY SUMMARY');
console.log('-'.repeat(80));
console.log(`Races: ${races.length}`);
console.log(`Total Runners: ${totalPicks}`);
console.log(`High-Value Picks (EV > 0.10): ${highValuePicks}`);
console.log(`Placeable Rate: ${((highValuePicks / totalPicks) * 100).toFixed(1)}%`);

// Find best overall pick
console.log('\n🏆 BEST PICK OF THE DAY');
console.log('-'.repeat(80));

let bestOverall = null;
let bestRaceId = null;
let bestEV = -999;

for (const race of races) {
  const picks = RacePredictor.generatePicksWithPredictions(race.id);
  for (const pick of picks) {
    const ev = Math.max(pick.ev_win || -999, pick.ev_place || -999);
    if (ev > bestEV) {
      bestEV = ev;
      bestOverall = pick;
      bestRaceId = race.id;
      bestOverall.track = race.track;
      bestOverall.raceNum = race.race_number;
    }
  }
}

if (bestOverall) {
  console.log(
    `${bestOverall.track} R${bestOverall.raceNum} | ${bestOverall.horse} @ $${bestOverall.odds} | ` +
    `${Math.round(bestOverall.predicted_win_prob)}% | EV: ${bestEV.toFixed(2)} | ${bestOverall.recommendation}`
  );
}

console.log('\n✅ Pick generation complete!\n');

process.exit(0);
