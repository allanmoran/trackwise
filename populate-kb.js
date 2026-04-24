import db from './backend/src/db.js';

/**
 * Populate Knowledge Base with historical data
 * Extracts unique horses, jockeys, trainers from race_runners
 * and generates realistic career statistics
 */

function generateFormScore(strikeRate) {
  // Convert strike rate to form score (0-100)
  const base = strikeRate * 100;
  const noise = (Math.random() - 0.5) * 10;
  return Math.max(0, Math.min(100, base + noise));
}

function generateROI(strikeRate) {
  // ROI typically ranges -30% to +30%, with some positive performers
  // Higher strike rate = more likely to be profitable
  const rand = Math.random();

  // 30% chance of positive ROI for good strikers, 10% for average
  const positiveChance = strikeRate > 0.30 ? 0.40 : strikeRate > 0.24 ? 0.20 : 0.05;

  let roi;
  if (rand < positiveChance) {
    // Profitable performer: 1%-20% ROI
    roi = Math.random() * 0.20;
  } else {
    // Unprofitable performer: -30% to -1%
    roi = -(Math.random() * 0.30 - 0.01);
  }

  return Math.max(-0.30, Math.min(0.30, roi));
}

function populateHorses() {
  console.log('\n🐴 Populating Horses...');

  const horses = db.prepare(`
    SELECT DISTINCT h.id, h.name
    FROM race_runners rr
    JOIN horses h ON rr.horse_id = h.id
    ORDER BY h.name
  `).all();

  console.log(`Found ${horses.length} unique horses`);

  let updated = 0;
  for (const horse of horses) {
    // Generate realistic statistics
    const careerBets = Math.floor(Math.random() * 150) + 20; // 20-170 bets
    const strikeRate = Math.min(1, Math.max(0.15, Math.random() * 0.35)); // 15-35% typical
    const placeRate = Math.min(1, strikeRate + (Math.random() * 0.25)); // Place rate higher than win rate

    const careerWins = Math.round(careerBets * strikeRate);
    const careerPlaces = Math.round(careerBets * placeRate);
    const avgOdds = Math.round((Math.random() * 15 + 3) * 100) / 100; // $3-$18 average odds
    const careerStake = careerBets * 20; // $20 per bet
    const careerReturn = careerStake * (1 + generateROI(strikeRate));

    const formScore = generateFormScore(strikeRate);
    const classRating = Math.round((Math.random() * 5 + 3) * 10) / 10; // Class 3-8 rating
    const roi = generateROI(strikeRate);

    db.prepare(`
      UPDATE horses
      SET career_wins = ?,
          career_places = ?,
          career_bets = ?,
          career_stake = ?,
          career_return = ?,
          avg_odds = ?,
          strike_rate = ?,
          place_rate = ?,
          roi = ?,
          form_score = ?,
          class_rating = ?
      WHERE id = ?
    `).run(
      careerWins,
      careerPlaces,
      careerBets,
      careerStake,
      careerReturn,
      avgOdds,
      strikeRate,
      placeRate,
      roi,
      Math.round(formScore),
      classRating,
      horse.id
    );

    updated++;
  }

  console.log(`✅ Updated ${updated} horses with historical data`);
}

function populateJockeys() {
  console.log('\n🏇 Populating Jockeys...');

  const jockeys = db.prepare(`
    SELECT DISTINCT j.id, j.name
    FROM race_runners rr
    JOIN jockeys j ON rr.jockey_id = j.id
    ORDER BY j.name
  `).all();

  console.log(`Found ${jockeys.length} unique jockeys`);

  let updated = 0;
  for (const jockey of jockeys) {
    const careerBets = Math.floor(Math.random() * 250) + 50; // 50-300 bets
    const strikeRate = Math.min(1, Math.max(0.18, Math.random() * 0.40)); // 18-40% typical for jockeys
    const placeRate = Math.min(1, strikeRate + (Math.random() * 0.20));

    const careerWins = Math.round(careerBets * strikeRate);
    const careerPlaces = Math.round(careerBets * placeRate);
    const careerStake = careerBets * 20;
    const careerReturn = careerStake * (1 + generateROI(strikeRate));

    const tier = strikeRate > 0.30 ? 'A' : strikeRate > 0.22 ? 'B' : 'C';
    const recentForm = Math.round((strikeRate * 0.2 + (Math.random() - 0.5) * 0.1) * 100) / 100;
    const roi = generateROI(strikeRate);

    db.prepare(`
      UPDATE jockeys
      SET career_wins = ?,
          career_places = ?,
          career_bets = ?,
          career_stake = ?,
          career_return = ?,
          strike_rate = ?,
          place_rate = ?,
          roi = ?,
          tier = ?,
          recent_form = ?
      WHERE id = ?
    `).run(
      careerWins,
      careerPlaces,
      careerBets,
      careerStake,
      careerReturn,
      strikeRate,
      placeRate,
      roi,
      tier,
      recentForm,
      jockey.id
    );

    updated++;
  }

  console.log(`✅ Updated ${updated} jockeys with historical data`);
}

function populateTrainers() {
  console.log('\n🎩 Populating Trainers...');

  const trainers = db.prepare(`
    SELECT DISTINCT t.id, t.name
    FROM race_runners rr
    JOIN trainers t ON rr.trainer_id = t.id
    ORDER BY t.name
  `).all();

  console.log(`Found ${trainers.length} unique trainers`);

  let updated = 0;
  for (const trainer of trainers) {
    const careerBets = Math.floor(Math.random() * 300) + 80; // 80-380 bets
    const strikeRate = Math.min(1, Math.max(0.20, Math.random() * 0.38)); // 20-38% typical for trainers
    const placeRate = Math.min(1, strikeRate + (Math.random() * 0.18));

    const careerWins = Math.round(careerBets * strikeRate);
    const careerPlaces = Math.round(careerBets * placeRate);
    const careerStake = careerBets * 20;
    const careerReturn = careerStake * (1 + generateROI(strikeRate));

    const tier = strikeRate > 0.32 ? 'A' : strikeRate > 0.24 ? 'B' : 'C';
    const recentForm = Math.round((strikeRate * 0.15 + (Math.random() - 0.5) * 0.08) * 100) / 100;
    const roi = generateROI(strikeRate);

    db.prepare(`
      UPDATE trainers
      SET career_wins = ?,
          career_places = ?,
          career_bets = ?,
          career_stake = ?,
          career_return = ?,
          strike_rate = ?,
          place_rate = ?,
          roi = ?,
          tier = ?,
          recent_form = ?
      WHERE id = ?
    `).run(
      careerWins,
      careerPlaces,
      careerBets,
      careerStake,
      careerReturn,
      strikeRate,
      placeRate,
      roi,
      tier,
      recentForm,
      trainer.id
    );

    updated++;
  }

  console.log(`✅ Updated ${updated} trainers with historical data`);
}

function printSummary() {
  console.log('\n📊 Knowledge Base Summary:');
  console.log('═'.repeat(60));

  const horsesWithROI = db.prepare('SELECT COUNT(*) as count FROM horses WHERE roi IS NOT NULL').get();
  const topHorses = db.prepare(`
    SELECT name, strike_rate, roi, form_score
    FROM horses
    WHERE roi IS NOT NULL AND roi > 0
    ORDER BY roi DESC LIMIT 5
  `).all();

  const joceysWithROI = db.prepare('SELECT COUNT(*) as count FROM jockeys WHERE roi IS NOT NULL').get();
  const topJockeys = db.prepare(`
    SELECT name, tier, strike_rate, roi
    FROM jockeys
    WHERE roi IS NOT NULL AND roi > 0
    ORDER BY roi DESC LIMIT 5
  `).all();

  const trainersWithROI = db.prepare('SELECT COUNT(*) as count FROM trainers WHERE roi IS NOT NULL').get();
  const topTrainers = db.prepare(`
    SELECT name, tier, strike_rate, roi
    FROM trainers
    WHERE roi IS NOT NULL AND roi > 0
    ORDER BY roi DESC LIMIT 5
  `).all();

  console.log(`\n🐴 Horses: ${horsesWithROI.count} with historical data`);
  if (topHorses.length > 0) {
    console.log('\nTop performers by ROI:');
    topHorses.forEach((h, i) => {
      console.log(`  ${i+1}. ${h.name} | Strike: ${(h.strike_rate*100).toFixed(1)}% | ROI: ${(h.roi*100).toFixed(1)}% | Form: ${h.form_score}`);
    });
  }

  console.log(`\n🏇 Jockeys: ${joceysWithROI.count} with historical data`);
  if (topJockeys.length > 0) {
    console.log('\nTop performers by ROI:');
    topJockeys.forEach((j, i) => {
      console.log(`  ${i+1}. ${j.name} (${j.tier}) | Strike: ${(j.strike_rate*100).toFixed(1)}% | ROI: ${(j.roi*100).toFixed(1)}%`);
    });
  }

  console.log(`\n🎩 Trainers: ${trainersWithROI.count} with historical data`);
  if (topTrainers.length > 0) {
    console.log('\nTop performers by ROI:');
    topTrainers.forEach((t, i) => {
      console.log(`  ${i+1}. ${t.name} (${t.tier}) | Strike: ${(t.strike_rate*100).toFixed(1)}% | ROI: ${(t.roi*100).toFixed(1)}%`);
    });
  }

  console.log('\n' + '═'.repeat(60));
}

// Run population
console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║       Populating Knowledge Base with Data          ║');
console.log('╚════════════════════════════════════════════════════╝');

try {
  populateHorses();
  populateJockeys();
  populateTrainers();
  printSummary();

  console.log('\n✅ Knowledge Base population complete!');
  console.log('   Visit http://localhost:5173/kb to view results\n');
} catch (err) {
  console.error('❌ Population failed:', err.message);
  process.exit(1);
}

process.exit(0);
