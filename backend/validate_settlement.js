import db from './src/db.js';

console.log('\n🎯 RESULTS SETTLEMENT VALIDATION');
console.log('='.repeat(80));

// Fuzzy match function (same as in results.js)
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// Check settlement accuracy
const settledBets = db.prepare(`
  SELECT b.id, b.result, h.name as horse, r.track, r.race_number
  FROM bets b
  JOIN horses h ON b.horse_id = h.id
  JOIN races r ON b.race_id = r.id
  WHERE b.result IS NOT NULL
  LIMIT 30
`).all();

console.log(`\nAnalyzing ${settledBets.length} settled bets...\n`);

const byResult = { WIN: 0, PLACE: 0, LOSS: 0, OTHER: 0 };
const settledCount = {};

for (const bet of settledBets) {
  if (bet.result === 'WIN') byResult.WIN++;
  else if (bet.result === 'PLACE') byResult.PLACE++;
  else if (bet.result === 'LOSS') byResult.LOSS++;
  else byResult.OTHER++;
  
  const key = `${bet.track}-R${bet.race_number}`;
  settledCount[key] = (settledCount[key] || 0) + 1;
}

console.log('Settlement Distribution:');
console.log(`  WIN:   ${byResult.WIN.toString().padStart(3)} (${(byResult.WIN/settledBets.length*100).toFixed(1)}%)`);
console.log(`  PLACE: ${byResult.PLACE.toString().padStart(3)} (${(byResult.PLACE/settledBets.length*100).toFixed(1)}%)`);
console.log(`  LOSS:  ${byResult.LOSS.toString().padStart(3)} (${(byResult.LOSS/settledBets.length*100).toFixed(1)}%)`);
if (byResult.OTHER > 0) console.log(`  OTHER: ${byResult.OTHER}`);

console.log(`\nRaces with settlements: ${Object.keys(settledCount).length}`);

// Sample some bets to verify matching quality
console.log('\nSample of recent settlements:');
console.log('HORSE                    | TRACK         | RACE | RESULT');
console.log('-'.repeat(60));

settledBets.slice(0, 15).forEach(b => {
  console.log(
    `${b.horse.padEnd(24)} | ${b.track.padEnd(13)} | R${b.race_number.toString().padStart(3)} | ${b.result}`
  );
});

console.log('\n✅ Settlement validation complete');
console.log('Note: Old bets from April 11-12 using form-based model');
console.log('Phase 3 model will be tested with next batch run');

process.exit(0);
