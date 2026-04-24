import db from './backend/src/db.js';
import RacePredictor from './backend/src/ml/predictor.js';

console.log('🏇 Generating Picks - April 11, 2026 (Most Recent Racing)\n');

const raceDate = '2026-04-11';

// Get races with runners and odds
const races = db.prepare(`
  SELECT r.id, r.track, r.race_number, r.race_name, r.distance,
         COUNT(rr.id) as runner_count,
         SUM(CASE WHEN rr.starting_odds IS NOT NULL AND rr.starting_odds > 0 THEN 1 ELSE 0 END) as runners_with_odds
  FROM races r
  LEFT JOIN race_runners rr ON r.id = rr.race_id
  WHERE r.date = ? AND r.track NOT IN ('Aintree Uk', 'Ascot Uk', 'Abu Dhabi Ae')
  GROUP BY r.id
  HAVING runner_count > 0
  ORDER BY runners_with_odds DESC, r.track, r.race_number
  LIMIT 20
`).all(raceDate);

console.log(`📅 Date: ${raceDate}`);
console.log(`Found ${races.length} tracks with races\n`);

let totalPicks = 0;
let placeable = 0;
let strongBuys = 0;

console.log('═'.repeat(100));

for (const race of races) {
  const picks = RacePredictor.generatePicksWithPredictions(race.id);
  
  if (picks.length === 0) continue;

  const strong = picks.filter(p => p.recommendation === 'STRONG_BUY');
  const buy = picks.filter(p => p.recommendation === 'BUY');
  const highEV = picks.filter(p => {
    const ev = Math.max(p.ev_win || -999, p.ev_place || -999);
    return ev > 0.15;
  });

  if (strong.length > 0 || highEV.length > 0) {
    console.log(`\n${race.track.toUpperCase()} R${race.race_number}`);
    console.log(`${race.race_name} | ${race.distance || '?'}m | ${race.runner_count} runners`);
    console.log('-'.repeat(100));

    // Show top picks
    const displayPicks = picks.slice(0, 8);
    
    displayPicks.forEach((pick) => {
      const ev = Math.max(pick.ev_win || -999, pick.ev_place || -999);
      
      let emoji = '⚠️ ';
      if (ev > 0.30) emoji = '🟢🟢';
      else if (ev > 0.20) emoji = '🟢 ';
      else if (ev > 0.10) emoji = '🟡 ';
      else if (ev > 0.05) emoji = '🔵 ';
      
      const odds = pick.odds ? `$${pick.odds.toFixed(2)}` : 'NO ODD';
      
      if (ev > -999 && odds !== 'NO ODD') {
        console.log(
          `${emoji} ${pick.horse.padEnd(25)} @ ${odds.padStart(7)} | ` +
          `${Math.round(pick.predicted_win_prob).toString().padStart(2)}% | ` +
          `EV: ${ev.toFixed(2).padStart(5)} | ${pick.best_bet}`
        );
        
        totalPicks++;
        if (ev > 0.15) placeable++;
        if (pick.recommendation === 'STRONG_BUY') strongBuys++;
      }
    });
  }
}

console.log('\n' + '═'.repeat(100));
console.log('\n📊 PICKS SUMMARY');
console.log('-'.repeat(100));
console.log(`Total Picks Generated: ${totalPicks}`);
console.log(`High-Value Picks (EV > 0.15): ${placeable}`);
console.log(`Strong Buys: ${strongBuys}`);
console.log(`Placeable Rate: ${totalPicks > 0 ? ((placeable / totalPicks) * 100).toFixed(1) : 0}%`);

// Find best picks overall
const allPicks = [];
for (const race of races) {
  const picks = RacePredictor.generatePicksWithPredictions(race.id);
  picks.forEach(p => {
    allPicks.push({
      ...p,
      track: race.track,
      raceNum: race.race_number,
      ev: Math.max(p.ev_win || -999, p.ev_place || -999)
    });
  });
}

const topPicks = allPicks
  .filter(p => p.ev > 0.15 && p.odds > 0)
  .sort((a, b) => b.ev - a.ev)
  .slice(0, 5);

if (topPicks.length > 0) {
  console.log('\n🏆 TOP 5 PICKS (Highest EV)');
  console.log('-'.repeat(100));
  
  topPicks.forEach((pick, idx) => {
    console.log(
      `${idx + 1}. ${pick.track} R${pick.raceNum} - ${pick.horse.padEnd(25)} @ $${pick.odds.toFixed(2).padStart(7)} ` +
      `| EV: ${pick.ev.toFixed(2).padStart(5)} | ${Math.round(pick.predicted_win_prob)}% win prob`
    );
  });
}

console.log('\n✅ Pick generation complete!\n');

process.exit(0);
