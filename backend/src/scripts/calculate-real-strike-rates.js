import db from '../db.js';

async function calculateRealStrikeRates() {
  console.log('📊 Calculating Real Strike Rates from Historical Data...\n');

  try {
    // Calculate horse strike rates from race results
    console.log('🐎 Calculating horse strike rates...');
    const horseStats = db.prepare(`
      SELECT 
        h.id,
        h.name,
        COUNT(rr.id) as total_races,
        SUM(CASE WHEN rr.result = 'W' THEN 1 ELSE 0 END) as wins,
        ROUND(CAST(SUM(CASE WHEN rr.result = 'W' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(rr.id), 4) as strike_rate,
        ROUND(AVG(COALESCE(rr.starting_odds, 0)), 2) as avg_odds
      FROM horses h
      LEFT JOIN race_runners rr ON h.id = rr.horse_id
      WHERE rr.id IS NOT NULL
      GROUP BY h.id, h.name
      HAVING COUNT(rr.id) >= 2
      ORDER BY strike_rate DESC
    `).all();

    let updated = 0;
    for (const horse of horseStats) {
      db.prepare(`
        UPDATE horses 
        SET strike_rate = ?, career_bets = ?
        WHERE id = ?
      `).run(horse.strike_rate, horse.total_races, horse.id);
      updated++;
    }
    console.log(`  ✓ Updated ${updated} horses with real strike rates`);

    // Calculate jockey strike rates
    console.log('\n🎩 Calculating jockey strike rates...');
    const jockeyStats = db.prepare(`
      SELECT 
        j.id,
        j.name,
        COUNT(rr.id) as total_rides,
        SUM(CASE WHEN rr.result = 'W' THEN 1 ELSE 0 END) as wins,
        ROUND(CAST(SUM(CASE WHEN rr.result = 'W' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(rr.id), 4) as strike_rate
      FROM jockeys j
      LEFT JOIN race_runners rr ON j.id = rr.jockey_id
      WHERE rr.id IS NOT NULL
      GROUP BY j.id, j.name
      HAVING COUNT(rr.id) >= 2
      ORDER BY strike_rate DESC
    `).all();

    updated = 0;
    for (const jockey of jockeyStats) {
      db.prepare(`
        UPDATE jockeys 
        SET strike_rate = ?, career_bets = ?
        WHERE id = ?
      `).run(jockey.strike_rate, jockey.total_rides, jockey.id);
      updated++;
    }
    console.log(`  ✓ Updated ${updated} jockeys with real strike rates`);

    // Calculate trainer strike rates
    console.log('\n🏪 Calculating trainer strike rates...');
    const trainerStats = db.prepare(`
      SELECT 
        t.id,
        t.name,
        COUNT(rr.id) as total_trained,
        SUM(CASE WHEN rr.result = 'W' THEN 1 ELSE 0 END) as wins,
        ROUND(CAST(SUM(CASE WHEN rr.result = 'W' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(rr.id), 4) as strike_rate
      FROM trainers t
      LEFT JOIN race_runners rr ON t.id = rr.trainer_id
      WHERE rr.id IS NOT NULL
      GROUP BY t.id, t.name
      HAVING COUNT(rr.id) >= 2
      ORDER BY strike_rate DESC
    `).all();

    updated = 0;
    for (const trainer of trainerStats) {
      db.prepare(`
        UPDATE trainers 
        SET strike_rate = ?, career_bets = ?
        WHERE id = ?
      `).run(trainer.strike_rate, trainer.total_trained, trainer.id);
      updated++;
    }
    console.log(`  ✓ Updated ${updated} trainers with real strike rates`);

    // Sample results
    console.log('\n📈 Top Performers:');
    const topHorses = db.prepare(`
      SELECT name, strike_rate, career_bets
      FROM horses
      WHERE career_bets >= 3
      ORDER BY strike_rate DESC
      LIMIT 5
    `).all();
    console.log('\n  Top Horses:');
    topHorses.forEach(h => {
      console.log(`    ${h.name}: ${(h.strike_rate * 100).toFixed(1)}% (${h.career_bets} races)`);
    });

    const topJockeys = db.prepare(`
      SELECT name, strike_rate, career_bets
      FROM jockeys
      WHERE career_bets > 0
      ORDER BY strike_rate DESC
      LIMIT 5
    `).all();
    console.log('\n  Top Jockeys:');
    topJockeys.forEach(j => {
      console.log(`    ${j.name}: ${(j.strike_rate * 100).toFixed(1)}% (${j.career_bets} rides)`);
    });

    const topTrainers = db.prepare(`
      SELECT name, strike_rate, career_bets
      FROM trainers
      WHERE career_bets > 0
      ORDER BY strike_rate DESC
      LIMIT 5
    `).all();
    console.log('\n  Top Trainers:');
    topTrainers.forEach(t => {
      console.log(`    ${t.name}: ${(t.strike_rate * 100).toFixed(1)}% (${t.career_bets} trained)`);
    });

    console.log('\n✅ Strike rates calculated successfully!\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

calculateRealStrikeRates();
