#!/usr/bin/env node
/**
 * Build comprehensive knowledge base from all available race data
 * Uses settled bets and race runners to create intelligence for predictions
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

function buildComprehensiveStatistics() {
  console.log('\n📚 BUILDING COMPREHENSIVE KB STATISTICS\n');

  // Clear existing KB stats
  db.prepare('DELETE FROM kb_stats').run();

  let totalRecords = 0;

  // 1. Build stats from SETTLED BETS (our ground truth)
  console.log('📊 Analyzing settled bets...');

  // By Horse (from bets)
  console.log('  Building horse statistics...');
  const horseStats = db.prepare(`
    SELECT
      h.id,
      h.name,
      COUNT(b.id) as total_bets,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      SUM(CASE WHEN b.result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(b.stake) as total_stake,
      SUM(CASE WHEN b.result IS NOT NULL THEN b.stake + COALESCE(b.profit_loss, 0) ELSE b.stake END) as total_return,
      AVG(b.closing_odds) as avg_odds
    FROM bets b
    JOIN horses h ON b.horse_id = h.id
    WHERE b.status = 'SETTLED'
    GROUP BY h.id, h.name
    HAVING total_bets > 0
    ORDER BY wins DESC, total_bets DESC
  `).all() as any[];

  for (const stat of horseStats) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('HORSE', ?, ?, ?, ?, ?, ?)
    `).run(stat.name, stat.total_bets, stat.wins, stat.places, stat.total_stake, stat.total_return);
    totalRecords++;
  }
  console.log(`    ✓ ${horseStats.length} horses with betting performance`);

  // By Track (from races in bets)
  console.log('  Building track statistics...');
  const trackStats = db.prepare(`
    SELECT
      r.track,
      COUNT(b.id) as total_bets,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      SUM(b.stake) as total_stake,
      SUM(CASE WHEN b.result IS NOT NULL THEN b.stake + COALESCE(b.profit_loss, 0) ELSE b.stake END) as total_return
    FROM bets b
    JOIN races r ON b.race_id = r.id
    WHERE b.status = 'SETTLED'
    GROUP BY r.track
    ORDER BY total_bets DESC
  `).all() as any[];

  for (const stat of trackStats) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('TRACK', ?, ?, ?, ?, ?, ?)
    `).run(stat.track, stat.total_bets, stat.wins, stat.places, stat.total_stake, stat.total_return);
    totalRecords++;
  }
  console.log(`    ✓ ${trackStats.length} tracks with performance data`);

  // By Bet Type
  console.log('  Building bet type statistics...');
  const betTypeStats = db.prepare(`
    SELECT
      b.bet_type,
      COUNT(b.id) as total_bets,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      SUM(b.stake) as total_stake,
      SUM(CASE WHEN b.result IS NOT NULL THEN b.stake + COALESCE(b.profit_loss, 0) ELSE b.stake END) as total_return
    FROM bets b
    WHERE b.status = 'SETTLED'
    GROUP BY b.bet_type
    ORDER BY total_bets DESC
  `).all() as any[];

  for (const stat of betTypeStats) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('BET_TYPE', ?, ?, ?, ?, ?, ?)
    `).run(stat.bet_type, stat.total_bets, stat.wins, stat.places, stat.total_stake, stat.total_return);
    totalRecords++;
  }
  console.log(`    ✓ ${betTypeStats.length} bet types analyzed`);

  // Horse + Track combination (key intelligence)
  console.log('  Building horse-by-track intelligence...');
  const horseByTrackStats = db.prepare(`
    SELECT
      h.name,
      r.track,
      COUNT(b.id) as total_bets,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      SUM(b.stake) as total_stake,
      SUM(CASE WHEN b.result IS NOT NULL THEN b.stake + COALESCE(b.profit_loss, 0) ELSE b.stake END) as total_return
    FROM bets b
    JOIN horses h ON b.horse_id = h.id
    JOIN races r ON b.race_id = r.id
    WHERE b.status = 'SETTLED'
    GROUP BY h.name, r.track
    HAVING total_bets > 0
    ORDER BY total_bets DESC, wins DESC
  `).all() as any[];

  for (const stat of horseByTrackStats.slice(0, 100)) { // Top 100 horse-track combinations
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('HORSE_TRACK', ?, ?, ?, ?, ?, ?)
    `).run(`${stat.name} @ ${stat.track}`, stat.total_bets, stat.wins, stat.places, stat.total_stake, stat.total_return);
    totalRecords++;
  }
  console.log(`    ✓ Top ${Math.min(100, horseByTrackStats.length)} horse-track combinations`);

  // Overall Summary
  console.log('  Building overall summary...');
  const overall = db.prepare(`
    SELECT
      COUNT(b.id) as total_bets,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      SUM(b.stake) as total_stake,
      SUM(CASE WHEN b.result IS NOT NULL THEN b.stake + COALESCE(b.profit_loss, 0) ELSE b.stake END) as total_return
    FROM bets b
    WHERE b.status = 'SETTLED'
  `).get() as any;

  if (overall.total_bets > 0) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('OVERALL', 'ALL', ?, ?, ?, ?, ?)
    `).run(overall.total_bets, overall.wins, overall.places, overall.total_stake, overall.total_return);
    totalRecords++;
  }
  console.log(`    ✓ Overall portfolio summary\n`);

  return totalRecords;
}

function updateHorseMetrics() {
  console.log('📈 UPDATING HORSE CAREER METRICS\n');

  const horses = db.prepare(`
    SELECT DISTINCT h.id, h.name FROM horses h
    WHERE EXISTS (SELECT 1 FROM bets b WHERE b.horse_id = h.id AND b.status = 'SETTLED')
  `).all() as any[];

  let updated = 0;

  for (const horse of horses) {
    const stats = db.prepare(`
      SELECT
        COUNT(b.id) as total_bets,
        SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
        SUM(COALESCE(b.profit_loss, 0)) as total_pnl,
        AVG(b.closing_odds) as avg_odds,
        SUM(b.stake) as total_stake,
        SUM(CASE WHEN b.result IS NOT NULL THEN b.stake + COALESCE(b.profit_loss, 0) ELSE b.stake END) as total_return
      FROM bets b
      WHERE b.horse_id = ? AND b.status = 'SETTLED'
    `).get(horse.id) as any;

    if (stats.total_bets === 0) continue;

    const strikeRate = Math.round((stats.wins / stats.total_bets) * 100);
    const placeRate = Math.round(((stats.wins + stats.places) / stats.total_bets) * 100);
    const roi = Math.round((stats.total_pnl / stats.total_stake) * 100);
    const formScore = Math.round(strikeRate * 0.6 + placeRate * 0.4);

    db.prepare(`
      UPDATE horses SET
        career_bets = ?,
        career_wins = ?,
        career_places = ?,
        career_stake = ?,
        career_return = ?,
        avg_odds = ?,
        strike_rate = ?,
        place_rate = ?,
        roi = ?,
        form_score = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      stats.total_bets,
      stats.wins,
      stats.places,
      stats.total_stake,
      stats.total_return,
      stats.avg_odds,
      strikeRate,
      placeRate,
      roi,
      formScore,
      horse.id
    );
    updated++;
  }

  console.log(`✅ Updated ${updated} horses with career metrics\n`);
}

function displayComprehensiveKBSummary() {
  console.log('='.repeat(80));
  console.log('🧠 COMPREHENSIVE KNOWLEDGE BASE SUMMARY\n');

  // Overall
  const overall = db.prepare(`
    SELECT bets as total_bets, wins, places, stake, return_amount
    FROM kb_stats WHERE stat_type = 'OVERALL'
  `).get() as any;

  if (overall) {
    const losses = overall.total_bets - overall.wins - overall.places;
    const roi = Math.round(((overall.return_amount - overall.stake) / overall.stake) * 100);
    const pnl = overall.return_amount - overall.stake;

    console.log(`📊 OVERALL PORTFOLIO PERFORMANCE\n`);
    console.log(`Total Bets Analyzed: ${overall.total_bets}`);
    console.log(`  🟢 Wins: ${overall.wins} (${(overall.wins / overall.total_bets * 100).toFixed(1)}%)`);
    console.log(`  🟡 Places: ${overall.places} (${(overall.places / overall.total_bets * 100).toFixed(1)}%)`);
    console.log(`  🔴 Losses: ${losses} (${(losses / overall.total_bets * 100).toFixed(1)}%)`);
    console.log(`  💰 Total Staked: $${overall.stake?.toFixed(2) || 0}`);
    console.log(`  💵 Total Returned: $${overall.return_amount?.toFixed(2) || 0}`);
    console.log(`  📈 P&L: $${pnl.toFixed(2)}`);
    console.log(`  🎯 ROI: ${roi}%\n`);
  }

  // Top Horses
  console.log('🏆 TOP 10 HORSES (by performance)\n');
  const topHorses = db.prepare(`
    SELECT stat_key, bets, wins, places, stake, return_amount
    FROM kb_stats WHERE stat_type = 'HORSE'
    ORDER BY wins DESC, bets DESC
    LIMIT 10
  `).all() as any[];

  for (const h of topHorses) {
    const pnl = h.return_amount - h.stake;
    const roi = h.stake > 0 ? Math.round((pnl / h.stake) * 100) : 0;
    console.log(
      `${h.stat_key}: ${h.bets} bets, ${h.wins}W ${h.places}P | $${pnl.toFixed(2)} (${roi}%)`
    );
  }

  // Top Tracks
  console.log('\n📍 TRACK PERFORMANCE\n');
  const tracks = db.prepare(`
    SELECT stat_key, bets, wins, places, stake, return_amount
    FROM kb_stats WHERE stat_type = 'TRACK'
    ORDER BY bets DESC
  `).all() as any[];

  for (const t of tracks) {
    const pnl = t.return_amount - t.stake;
    const roi = t.stake > 0 ? Math.round((pnl / t.stake) * 100) : 0;
    const strikeRate = Math.round((t.wins / t.bets) * 100);
    console.log(`${t.stat_key}: ${t.bets} bets, ${strikeRate}% W | ${roi}% ROI`);
  }

  // Bet Type Performance
  console.log('\n🎲 BET TYPE ANALYSIS\n');
  const betTypes = db.prepare(`
    SELECT stat_key, bets, wins, places, stake, return_amount
    FROM kb_stats WHERE stat_type = 'BET_TYPE'
    ORDER BY bets DESC
  `).all() as any[];

  for (const bt of betTypes) {
    const pnl = bt.return_amount - bt.stake;
    const roi = bt.stake > 0 ? Math.round((pnl / bt.stake) * 100) : 0;
    console.log(`${bt.stat_key}: ${bt.bets} bets, ${bt.wins}W ${bt.places}P, ${roi}% ROI`);
  }

  // Best horse-track combinations
  console.log('\n⭐ BEST HORSE-TRACK COMBINATIONS\n');
  const bestCombos = db.prepare(`
    SELECT stat_key, bets, wins, places, stake, return_amount
    FROM kb_stats WHERE stat_type = 'HORSE_TRACK'
    ORDER BY wins DESC, bets DESC
    LIMIT 5
  `).all() as any[];

  for (const c of bestCombos) {
    const pnl = c.return_amount - c.stake;
    const roi = c.stake > 0 ? Math.round((pnl / c.stake) * 100) : 0;
    const winRate = Math.round((c.wins / c.bets) * 100);
    console.log(`${c.stat_key}: ${c.bets} bets, ${winRate}% win rate, ${roi}% ROI`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  console.log('\n🧠 BUILDING COMPREHENSIVE KNOWLEDGE BASE\n');
  console.log('This KB aggregates all race and betting data to identify');
  console.log('patterns that inform predictive decisions.\n');

  try {
    const kbRecords = buildComprehensiveStatistics();
    updateHorseMetrics();
    displayComprehensiveKBSummary();

    console.log(`✅ Comprehensive KB complete`);
    console.log(`   Total aggregated statistics: ${kbRecords}`);
    console.log(`   Ready for prediction modeling\n`);
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
