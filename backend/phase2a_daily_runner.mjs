#!/usr/bin/env node

import Database from 'better-sqlite3';
import SportsbetFormScraper from './src/scrapers/sportsbet-form-scraper.js';

const db = new Database('./data/trackwise.db');

console.log(`\n🚀 PHASE 2A: DAILY AUTO-BETTING RUN`);
console.log(`${'='.repeat(60)}`);
console.log(`Time: ${new Date().toLocaleString()}\n`);

try {
  // Get today's races that haven't been loaded yet
  const racesToBet = db.prepare(`
    SELECT DISTINCT r.id, r.track, r.race_number
    FROM races r
    WHERE r.date = date('now')
    AND r.id NOT IN (SELECT race_id FROM bets WHERE placed_at > datetime('now', '-24 hours'))
    AND r.track NOT IN ('Unknown')
    ORDER BY r.id
    LIMIT 3
  `).all();

  if (racesToBet.length === 0) {
    console.log('✅ All available races already have bets placed');
    process.exit(0);
  }

  console.log(`📍 Found ${racesToBet.length} races ready for betting:\n`);
  racesToBet.forEach(r => console.log(`   • ${r.track} R${r.race_number}`));
  console.log();

  let totalBetsPlaced = 0;
  let totalStake = 0;
  let raceCount = 0;

  for (const race of racesToBet) {
    try {
      console.log(`\n🏁 Processing: ${race.track} R${race.race_number}`);

      // Get top runners by odds (likely favorites with higher EV)
      const runners = db.prepare(`
        SELECT h.id, h.name, rr.starting_odds,
               h.strike_rate
        FROM race_runners rr
        JOIN horses h ON rr.horse_id = h.id
        WHERE rr.race_id = ? AND rr.starting_odds > 1.0
        ORDER BY rr.starting_odds ASC
        LIMIT 8
      `).all(race.id);

      if (runners.length === 0) {
        console.log(`   ⏭️  No runners with valid odds`);
        continue;
      }

      console.log(`   ${runners.length} runners loaded`);

      // Generate picks based on odds and strike rate
      const picks = [];
      for (const runner of runners) {
        const strikeRate = runner.strike_rate || 0.06; // Default to 6% if missing
        const confidence = Math.round(strikeRate * 100);

        if (confidence < 20) continue; // Skip low confidence

        const probWin = strikeRate;
        const evWin = (probWin * runner.starting_odds) - 1;

        // Minimum EV threshold (Phase 2A testing: -5% acceptable, avoid heavy neg EV)
        const EV_THRESHOLD = -0.05; // -5% for validation
        if (evWin >= EV_THRESHOLD) {
          picks.push({
            horse_id: runner.id,
            horse_name: runner.name,
            odds: runner.starting_odds,
            confidence,
            ev: evWin
          });
        }
      }

      console.log(`   ${picks.length} picks with EV > -5% (validation threshold)`);

      if (picks.length === 0) {
        console.log(`   ⏭️  No picks met EV threshold`);
        continue;
      }

      // Place up to 3 bets per race
      const betsThisRace = picks.slice(0, 3);
      for (const pick of betsThisRace) {
        const stake = 25;
        db.prepare(`
          INSERT INTO bets (
            race_id, horse_id, bet_type, stake,
            opening_odds, ev_percent, confidence,
            status, placed_at
          ) VALUES (?, ?, 'WIN', ?, ?, ?, ?, 'ACTIVE', datetime('now'))
        `).run(
          race.id,
          pick.horse_id,
          stake,
          pick.odds,
          Math.round(pick.ev * 100),
          pick.confidence
        );

        totalBetsPlaced++;
        totalStake += stake;
        console.log(`     ✅ ${pick.horse_name.padEnd(20)} @ ${pick.odds}x | ${pick.confidence}% | EV ${(pick.ev*100).toFixed(0)}%`);
      }

      raceCount++;

    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }

  // Session summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 SESSION SUMMARY\n`);
  console.log(`Races Processed: ${raceCount}`);
  console.log(`Bets Placed: ${totalBetsPlaced}`);
  console.log(`Total Stake: $${totalStake}`);

  // Database summary
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_active,
      ROUND(SUM(stake), 2) as total_stake,
      ROUND(AVG(confidence), 1) as avg_confidence,
      ROUND(AVG(ev_percent), 1) as avg_ev,
      COUNT(DISTINCT race_id) as race_count
    FROM bets
    WHERE status = 'ACTIVE' AND placed_at > datetime('now', '-1 day')
  `).get();

  console.log(`\n📈 Last 24 Hours Active Bets:`);
  console.log(`   Total Bets: ${summary.total_active}`);
  console.log(`   Total Stake: $${summary.total_stake}`);
  console.log(`   Avg Confidence: ${summary.avg_confidence}%`);
  console.log(`   Avg EV: ${summary.avg_ev}%`);
  console.log(`   Races: ${summary.race_count}`);

  console.log(`\n✅ Daily betting run complete at ${new Date().toLocaleString()}\n`);

} catch (err) {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
}
