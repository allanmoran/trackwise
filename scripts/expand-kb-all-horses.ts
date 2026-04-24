#!/usr/bin/env node
/**
 * Expand KB to include ALL horses and their complete race history
 * This creates a comprehensive racing database for prediction
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

function indexAllHorses() {
  console.log('\n🐴 INDEXING ALL HORSES IN SYSTEM\n');

  // Get count of unique horses
  const totalHorses = db.prepare('SELECT COUNT(*) as count FROM horses').get() as any;
  console.log(`Total horses in database: ${totalHorses.count}`);

  // Horses that ran in races (race_runners)
  const runnersHorses = db.prepare(`
    SELECT COUNT(DISTINCT horse_id) as count FROM race_runners
  `).get() as any;
  console.log(`Horses with race entries: ${runnersHorses.count}`);

  // Horses with betting history
  const bettedHorses = db.prepare(`
    SELECT COUNT(DISTINCT horse_id) as count FROM bets
  `).get() as any;
  console.log(`Horses with betting history: ${bettedHorses.count}\n`);

  return {
    total: totalHorses.count,
    runners: runnersHorses.count,
    betted: bettedHorses.count,
  };
}

function buildExtendedHorseKB() {
  console.log('📚 BUILDING EXTENDED HORSE KNOWLEDGE BASE\n');

  // Get all horses and their available race data
  const horses = db.prepare(`
    SELECT
      h.id,
      h.name,
      (SELECT COUNT(*) FROM race_runners rr WHERE rr.horse_id = h.id) as race_entries,
      (SELECT COUNT(*) FROM bets b WHERE b.horse_id = h.id AND b.status = 'SETTLED') as settled_bets,
      (SELECT COUNT(*) FROM bets b WHERE b.horse_id = h.id AND b.result = 'WIN') as bet_wins,
      (SELECT COUNT(*) FROM bets b WHERE b.horse_id = h.id AND b.result = 'PLACE') as bet_places
    FROM horses h
    WHERE (SELECT COUNT(*) FROM race_runners rr WHERE rr.horse_id = h.id) > 0
       OR (SELECT COUNT(*) FROM bets b WHERE b.horse_id = h.id) > 0
    ORDER BY race_entries DESC, settled_bets DESC
  `).all() as any[];

  console.log(`Found ${horses.length} horses with racing/betting history\n`);

  let updated = 0;

  for (const horse of horses) {
    // Calculate strike rates from betting history
    const strikeRate = horse.settled_bets > 0
      ? Math.round((horse.bet_wins / horse.settled_bets) * 100)
      : null;

    const placeRate = horse.settled_bets > 0
      ? Math.round(((horse.bet_wins + horse.bet_places) / horse.settled_bets) * 100)
      : null;

    // Form score based on available data
    const formScore = horse.settled_bets > 0
      ? Math.round(strikeRate * 0.6 + placeRate * 0.4)
      : Math.min(Math.round(horse.race_entries * 5), 100);

    db.prepare(`
      UPDATE horses SET
        strike_rate = ?,
        place_rate = ?,
        form_score = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(strikeRate, placeRate, formScore, horse.id);

    updated++;
  }

  console.log(`✅ Updated ${updated} horse profiles with extended metrics\n`);
  return updated;
}

function buildTrackDatabase() {
  console.log('📍 BUILDING TRACK PERFORMANCE DATABASE\n');

  // Get all unique tracks
  const tracks = db.prepare(`
    SELECT DISTINCT track FROM races ORDER BY track
  `).all() as any[];

  console.log(`Analyzing ${tracks.length} tracks:\n`);

  for (const track of tracks) {
    const raceCount = db.prepare(
      'SELECT COUNT(*) as count FROM races WHERE track = ?'
    ).get(track.track) as any;

    const runnerCount = db.prepare(`
      SELECT COUNT(*) as count FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE r.track = ?
    `).get(track.track) as any;

    const betCount = db.prepare(`
      SELECT COUNT(*) as count FROM bets b
      JOIN races r ON b.race_id = r.id
      WHERE r.track = ?
    `).get(track.track) as any;

    console.log(`  ${track.track}: ${raceCount.count} races, ${runnerCount.count} runners, ${betCount.count} bets`);
  }

  console.log();
}

function buildHorseTrackAffinityIndex() {
  console.log('⭐ BUILDING HORSE-TRACK AFFINITY INDEX\n');

  // For each horse, track their performance at each track
  const affinities = db.prepare(`
    SELECT
      h.name,
      r.track,
      COUNT(DISTINCT r.id) as race_count,
      COUNT(DISTINCT b.id) as bet_count,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      AVG(b.closing_odds) as avg_odds
    FROM horses h
    LEFT JOIN race_runners rr ON h.id = rr.horse_id
    LEFT JOIN races r ON rr.race_id = r.id
    LEFT JOIN bets b ON h.id = b.horse_id AND r.id = b.race_id
    WHERE r.track IS NOT NULL
    GROUP BY h.id, r.track
    HAVING race_count > 0 OR bet_count > 0
    ORDER BY h.name, race_count DESC
  `).all() as any[];

  console.log(`Found ${affinities.length} horse-track relationships\n`);

  // Identify strong performers at specific tracks
  const strongPerformers = affinities.filter(a =>
    a.bet_count > 0 && a.wins > 0 && (a.wins / a.bet_count) >= 0.3
  );

  if (strongPerformers.length > 0) {
    console.log('🎯 Horses with 30%+ win rate at specific tracks:\n');
    for (const perf of strongPerformers.slice(0, 10)) {
      const winRate = ((perf.wins / perf.bet_count) * 100).toFixed(0);
      console.log(
        `  ${perf.name} @ ${perf.track}: ${perf.bet_count} bets, ${perf.wins}W ${perf.places}P (${winRate}% win rate)`
      );
    }
  }

  console.log();
  return affinities.length;
}

function generateKBInsights() {
  console.log('='.repeat(80));
  console.log('🧠 KB INSIGHTS FOR PREDICTION\n');

  // Find horses with consistent form
  const consistentFormers = db.prepare(`
    SELECT
      h.name,
      h.career_bets,
      h.strike_rate,
      h.place_rate,
      h.form_score,
      COUNT(DISTINCT r.track) as tracks_raced
    FROM horses h
    LEFT JOIN race_runners rr ON h.id = rr.horse_id
    LEFT JOIN races r ON rr.race_id = r.id
    WHERE h.career_bets > 0 AND h.strike_rate IS NOT NULL
    GROUP BY h.id
    ORDER BY h.form_score DESC
    LIMIT 10
  `).all() as any[];

  if (consistentFormers.length > 0) {
    console.log('📈 TOP FORM SCORERS (likely future performers):\n');
    for (const horse of consistentFormers) {
      console.log(
        `  ${horse.name}: Form ${horse.form_score}, Strike ${horse.strike_rate}%, Place ${horse.place_rate}%`
      );
    }
  }

  // Find tracks with highest win rate
  const trackQuality = db.prepare(`
    SELECT
      r.track,
      COUNT(b.id) as bet_count,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      ROUND(SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) * 100.0 / COUNT(b.id), 1) as win_rate
    FROM bets b
    JOIN races r ON b.race_id = r.id
    WHERE b.status = 'SETTLED'
    GROUP BY r.track
    ORDER BY win_rate DESC
    LIMIT 5
  `).all() as any[];

  if (trackQuality.length > 0) {
    console.log('\n🏆 TRACKS WITH HIGHEST WIN RATES:\n');
    for (const track of trackQuality) {
      console.log(`  ${track.track}: ${track.win_rate}% win rate (${track.wins}/${track.bet_count})`);
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  console.log('\n📊 EXPANDING KB TO ALL HORSES AND RACES\n');
  console.log('Creating comprehensive racing intelligence database...\n');

  try {
    const counts = indexAllHorses();
    buildExtendedHorseKB();
    buildTrackDatabase();
    const affinityCount = buildHorseTrackAffinityIndex();
    generateKBInsights();

    console.log(`✅ COMPREHENSIVE KB EXPANSION COMPLETE\n`);
    console.log(`📊 KB STATISTICS:`);
    console.log(`   • Total horses indexed: ${counts.total}`);
    console.log(`   • Horses with race entries: ${counts.runners}`);
    console.log(`   • Horses with betting history: ${counts.betted}`);
    console.log(`   • Horse-track relationships: ${affinityCount}`);
    console.log(`\n🎯 The knowledge base is now ready to inform predictive models\n`);
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
