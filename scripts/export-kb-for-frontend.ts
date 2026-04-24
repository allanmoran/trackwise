#!/usr/bin/env node
/**
 * Export comprehensive KB data in frontend-friendly format
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const outputPath = path.join(__dirname, '../public/data/kb-intelligence.json');

const db = new Database(dbPath);

interface HorseProfile {
  name: string;
  totalRaces: number;
  bets: number;
  wins: number;
  places: number;
  strikeRate: number | null;
  placeRate: number | null;
  formScore: number | null;
  avgOdds: number | null;
  roi: number | null;
}

interface TrackProfile {
  name: string;
  races: number;
  runners: number;
  bets: number;
  winRate: number;
  roi: number;
}

interface HorseTrackAffinity {
  horse: string;
  track: string;
  bets: number;
  wins: number;
  places: number;
  winRate: number;
}

interface KBIntelligence {
  generated: string;
  overview: {
    totalHorses: number;
    totalRaces: number;
    totalBets: number;
    totalWins: number;
    totalPlaces: number;
    overallWinRate: number;
    overallROI: number;
  };
  topHorses: HorseProfile[];
  topTracks: TrackProfile[];
  horseTrackAffinities: HorseTrackAffinity[];
  horseProfiles: Record<string, HorseProfile>;
  trackProfiles: Record<string, TrackProfile>;
}

function main() {
  console.log('\n📊 EXPORTING COMPREHENSIVE KB FOR FRONTEND\n');

  try {
    // Get overview stats
    const overall = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM horses) as total_horses,
        (SELECT COUNT(*) FROM races) as total_races,
        (SELECT COUNT(*) FROM bets WHERE status = 'SETTLED') as total_bets,
        (SELECT COUNT(*) FROM bets WHERE status = 'SETTLED' AND result = 'WIN') as total_wins,
        (SELECT COUNT(*) FROM bets WHERE status = 'SETTLED' AND result = 'PLACE') as total_places
    `).get() as any;

    const overallStats = db.prepare(`
      SELECT
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'PLACE' THEN 1 ELSE 0 END) as places,
        SUM(stake) as total_stake,
        SUM(profit_loss) as total_pnl
      FROM bets WHERE status = 'SETTLED'
    `).get() as any;

    const winRate = overall.total_bets > 0
      ? Math.round((overallStats.wins / overall.total_bets) * 100)
      : 0;

    const roi = (overallStats.total_stake || 0) > 0
      ? Math.round((overallStats.total_pnl / overallStats.total_stake) * 100)
      : 0;

    // Get top horses
    const topHorses = db.prepare(`
      SELECT
        h.name,
        (SELECT COUNT(*) FROM race_runners WHERE horse_id = h.id) as total_races,
        (SELECT COUNT(*) FROM bets WHERE horse_id = h.id AND status = 'SETTLED') as bets,
        (SELECT COUNT(*) FROM bets WHERE horse_id = h.id AND status = 'SETTLED' AND result = 'WIN') as wins,
        (SELECT COUNT(*) FROM bets WHERE horse_id = h.id AND status = 'SETTLED' AND result = 'PLACE') as places,
        h.strike_rate,
        h.place_rate,
        h.form_score,
        h.avg_odds,
        h.roi
      FROM horses h
      WHERE (SELECT COUNT(*) FROM race_runners WHERE horse_id = h.id) > 0
         OR (SELECT COUNT(*) FROM bets WHERE horse_id = h.id) > 0
      ORDER BY h.form_score DESC, h.strike_rate DESC
      LIMIT 50
    `).all() as any[];

    // Get track profiles
    const tracks = db.prepare(`
      SELECT
        r.track,
        COUNT(DISTINCT r.id) as races,
        (SELECT COUNT(*) FROM race_runners rr WHERE rr.race_id IN (SELECT id FROM races WHERE track = r.track)) as runners,
        (SELECT COUNT(*) FROM bets b WHERE b.race_id IN (SELECT id FROM races WHERE track = r.track) AND b.status = 'SETTLED') as bets,
        (SELECT COUNT(*) FROM bets b WHERE b.race_id IN (SELECT id FROM races WHERE track = r.track) AND b.status = 'SETTLED' AND b.result = 'WIN') as wins,
        (SELECT SUM(stake) FROM bets b WHERE b.race_id IN (SELECT id FROM races WHERE track = r.track) AND b.status = 'SETTLED') as stake,
        (SELECT SUM(profit_loss) FROM bets b WHERE b.race_id IN (SELECT id FROM races WHERE track = r.track) AND b.status = 'SETTLED') as pnl
      FROM races r
      GROUP BY r.track
      ORDER BY bets DESC
    `).all() as any[];

    // Get horse-track affinities
    const affinities = db.prepare(`
      SELECT
        h.name,
        r.track,
        COUNT(b.id) as bets,
        SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places
      FROM bets b
      JOIN horses h ON b.horse_id = h.id
      JOIN races r ON b.race_id = r.id
      WHERE b.status = 'SETTLED' AND b.result IS NOT NULL
      GROUP BY h.id, r.track
      HAVING bets > 0
      ORDER BY wins DESC, bets DESC
    `).all() as any[];

    // Build response
    const intelligence: KBIntelligence = {
      generated: new Date().toISOString(),
      overview: {
        totalHorses: overall.total_horses,
        totalRaces: overall.total_races,
        totalBets: overall.total_bets,
        totalWins: overallStats.wins || 0,
        totalPlaces: overallStats.places || 0,
        overallWinRate: winRate,
        overallROI: roi,
      },
      topHorses: topHorses.map(h => ({
        name: h.name,
        totalRaces: h.total_races || 0,
        bets: h.bets || 0,
        wins: h.wins || 0,
        places: h.places || 0,
        strikeRate: h.strike_rate,
        placeRate: h.place_rate,
        formScore: h.form_score,
        avgOdds: h.avg_odds,
        roi: h.roi,
      })),
      topTracks: tracks.map(t => ({
        name: t.track,
        races: t.races,
        runners: t.runners || 0,
        bets: t.bets || 0,
        winRate: t.bets > 0 ? Math.round((t.wins / t.bets) * 100) : 0,
        roi: (t.stake || 0) > 0 ? Math.round(((t.pnl || 0) / t.stake) * 100) : 0,
      })),
      horseTrackAffinities: affinities.map(a => ({
        horse: a.name,
        track: a.track,
        bets: a.bets,
        wins: a.wins || 0,
        places: a.places || 0,
        winRate: a.bets > 0 ? Math.round((a.wins / a.bets) * 100) : 0,
      })),
      horseProfiles: Object.fromEntries(
        topHorses.map(h => [h.name, {
          name: h.name,
          totalRaces: h.total_races || 0,
          bets: h.bets || 0,
          wins: h.wins || 0,
          places: h.places || 0,
          strikeRate: h.strike_rate,
          placeRate: h.place_rate,
          formScore: h.form_score,
          avgOdds: h.avg_odds,
          roi: h.roi,
        }])
      ),
      trackProfiles: Object.fromEntries(
        tracks.map(t => [t.track, {
          name: t.track,
          races: t.races,
          runners: t.runners || 0,
          bets: t.bets || 0,
          winRate: t.bets > 0 ? Math.round((t.wins / t.bets) * 100) : 0,
          roi: (t.stake || 0) > 0 ? Math.round(((t.pnl || 0) / t.stake) * 100) : 0,
        }])
      ),
    };

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(outputPath, JSON.stringify(intelligence, null, 2));

    console.log(`✅ KB Intelligence exported to public/data/kb-intelligence.json\n`);
    console.log('📊 KB OVERVIEW\n');
    console.log(`Total horses in system: ${intelligence.overview.totalHorses}`);
    console.log(`Total races: ${intelligence.overview.totalRaces}`);
    console.log(`Total bets analyzed: ${intelligence.overview.totalBets}`);
    console.log(`Overall win rate: ${intelligence.overview.overallWinRate}%`);
    console.log(`Overall ROI: ${intelligence.overview.overallROI}%\n`);

    console.log('🏆 TOP 5 HORSES\n');
    intelligence.topHorses.slice(0, 5).forEach(h => {
      if (h.bets > 0) {
        console.log(`${h.name}: ${h.bets} bets, ${h.wins}W ${h.places}P, Form Score: ${h.formScore}`);
      }
    });

    console.log('\n📍 TOP TRACKS\n');
    intelligence.topTracks.slice(0, 5).forEach(t => {
      console.log(`${t.name}: ${t.bets} bets, ${t.winRate}% win rate, ${t.roi}% ROI`);
    });

    console.log('\n✅ Comprehensive KB ready for frontend prediction models\n');
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
