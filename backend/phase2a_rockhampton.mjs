#!/usr/bin/env node

import Database from 'better-sqlite3';
import SportsbetFormScraper from './src/scrapers/sportsbet-form-scraper.js';

const db = new Database('./data/trackwise.db');

console.log('🚀 PHASE 2A: AUTO-BETTING SESSION - Rockhampton');
console.log('================================================\n');

try {
  // Get today's races at Rockhampton
  const races = db.prepare(`
    SELECT id, track, race_number, date 
    FROM races 
    WHERE track = 'Rockhampton' 
    AND date = date('now')
    LIMIT 5
  `).all();

  console.log(`📍 Found ${races.length} race(s) at Rockhampton today\n`);

  if (races.length === 0) {
    console.log('No races found');
    process.exit(0);
  }

  let totalBets = 0;
  let totalStake = 0;

  for (const race of races) {
    console.log(`\n🏁 Race: ${race.track} R${race.race_number}\n`);

    try {
      // Get runners and generate picks
      const runners = db.prepare(`
        SELECT rr.id, h.name, rr.barrier, rr.starting_odds
        FROM race_runners rr
        JOIN horses h ON rr.horse_id = h.id
        WHERE rr.race_id = ?
        LIMIT 20
      `).all(race.id);

      console.log(`   ${runners.length} runners loaded`);

      if (runners.length === 0) {
        console.log(`   ⏭️  No runners data available`);
        continue;
      }

      // Generate picks using the predictor
      const RacePredictor = (await import('./src/ml/predictor.js')).default;
      const picks = await RacePredictor.generatePicksWithPredictions(race.id);

      console.log(`   ${picks.length} picks generated`);

      // Filter for high-EV picks and place bets
      const highEvPicks = picks.filter(p => (p.ev_win >= 0.10 || p.ev_place >= 0.10));
      console.log(`   ${highEvPicks.length} high-EV picks (>10%)\n`);

      if (highEvPicks.length === 0) {
        console.log(`   ⚠️  No picks with EV > 10%\n`);
        continue;
      }

      // Place bets for high-EV picks
      for (const pick of highEvPicks.slice(0, 3)) {  // Max 3 bets per race
        const betType = pick.ev_place > pick.ev_win ? 'PLACE' : 'WIN';
        const stake = 25;
        const ev = Math.max(pick.ev_win, pick.ev_place);
        const confidence = Math.round(pick.predicted_win_prob * 100);

        const result = db.prepare(`
          INSERT INTO bets (
            race_id, horse, jockey, trainer, 
            bet_type, stake, opening_odds, 
            ev_percent, confidence, status, placed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', datetime('now'))
        `).run(
          race.id,
          pick.horse,
          pick.jockey || '',
          pick.trainer || '',
          betType,
          stake,
          pick.odds || 0,
          Math.round(ev * 100),
          confidence
        );

        totalBets++;
        totalStake += stake;

        console.log(`   ✅ Placed: ${pick.horse} (${betType}) @ ${pick.odds}x - ${confidence}% conf, ${(ev*100).toFixed(0)}% EV`);
      }

    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 PHASE 2A SESSION SUMMARY\n`);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_bets,
      ROUND(SUM(stake), 2) as total_stake,
      ROUND(AVG(confidence), 1) as avg_confidence,
      ROUND(AVG(ev_percent), 1) as avg_ev
    FROM bets
    WHERE placed_at > datetime('now', '-1 hour') AND status = 'ACTIVE'
  `).get();

  console.log(`Total Bets Placed: ${summary.total_bets}`);
  console.log(`Total Stake: $${summary.total_stake}`);
  console.log(`Avg Confidence: ${summary.avg_confidence}%`);
  console.log(`Avg EV: ${summary.avg_ev}%`);

  if (summary.total_bets > 0) {
    console.log(`\n✅ PHASE 2A LIVE: ${summary.total_bets} bets placed for settlement at 8 PM`);
    console.log(`\n📊 Monitor with: bash /tmp/phase1b_dashboard.sh`);
  } else {
    console.log(`\n⚠️  No bets placed.`);
  }

} catch (err) {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
}
