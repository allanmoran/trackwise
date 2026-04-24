#!/usr/bin/env node
/**
 * Export settlement results to JSON for frontend consumption
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const outputPath = path.join(__dirname, '../public/data/results.json');

const db = new Database(dbPath);

interface Results {
  meta: {
    totalRaces: number;
    totalBets: number;
    noBets: number;
    startedAt: string;
    lastUpdated: string;
  };
  bankroll: {
    start: number;
    current: number;
    peak: number;
    trough: number;
    totalPL: number;
    maxDrawdown: number;
    history: number[];
  };
  kb: any;
  bets: any[];
  performance: {
    summary: {
      totalRaces: number;
      totalBets: number;
      noBets: number;
      wins: number;
      places: number;
      losses: number;
      winStrike: number;
      placeStrike: number;
      roi: number;
      totalStaked: number;
      growth: number;
      maxDrawdown: number;
    };
    byTrack: any[];
    byCondition: any[];
    byOddsRange: any[];
    byBetType: any[];
    byScoreBand: any[];
    byBarrier: any[];
    byDistance: any[];
    byFieldSize: any[];
    roiCurve: any[];
  };
}

function getMetrics(bets: any[]): any {
  if (bets.length === 0) {
    return {
      totalRaces: 0,
      totalBets: 0,
      noBets: 0,
      wins: 0,
      places: 0,
      losses: 0,
      winStrike: 0,
      placeStrike: 0,
      roi: 0,
      totalStaked: 0,
      growth: 0,
      maxDrawdown: 0,
    };
  }

  const wins = bets.filter((b: any) => b.result === 'WIN').length;
  const places = bets.filter((b: any) => b.result === 'PLACE').length;
  const losses = bets.filter((b: any) => b.result === 'LOSS').length;
  const totalStaked = bets.reduce((sum: number, b: any) => sum + b.stake, 0);
  const totalPL = bets.reduce((sum: number, b: any) => sum + b.profit_loss, 0);

  return {
    totalRaces: new Set(bets.map((b: any) => `${b.track}-R${b.race_number}`)).size,
    totalBets: bets.length,
    noBets: 0,
    wins,
    places,
    losses,
    winStrike: Math.round((wins / bets.length) * 100),
    placeStrike: Math.round(((wins + places) / bets.length) * 100),
    roi: Math.round((totalPL / totalStaked) * 100),
    totalStaked,
    growth: totalPL,
    maxDrawdown: 0,
  };
}

function main() {
  console.log('📤 Exporting results to JSON...\n');

  try {
    // Get all settled bets
    const bets = db.prepare(`
      SELECT
        b.id, b.bet_type, b.stake, b.closing_odds, b.result, b.profit_loss,
        h.name as horse_name,
        r.track, r.race_number, r.date
      FROM bets b
      JOIN horses h ON b.horse_id = h.id
      JOIN races r ON b.race_id = r.id
      WHERE b.status = 'SETTLED'
      ORDER BY r.date DESC, r.race_number DESC
    `).all() as any[];

    const summary = getMetrics(bets);

    // Get KB stats by track
    const byTrack = db.prepare(`
      SELECT
        stat_key as label,
        bets,
        wins,
        places,
        stake as staked,
        return_amount as returned,
        ROUND(wins * 100.0 / bets, 1) as winStrike,
        ROUND((wins + places) * 100.0 / bets, 1) as placeStrike,
        ROUND((return_amount - stake) * 100.0 / stake, 1) as roi
      FROM kb_stats
      WHERE stat_type = 'TRACK'
      ORDER BY roi DESC
    `).all() as any[];

    const byBetType = db.prepare(`
      SELECT
        stat_key as label,
        bets,
        wins,
        places,
        stake as staked,
        return_amount as returned,
        ROUND(wins * 100.0 / bets, 1) as winStrike,
        ROUND((wins + places) * 100.0 / bets, 1) as placeStrike,
        ROUND((return_amount - stake) * 100.0 / stake, 1) as roi
      FROM kb_stats
      WHERE stat_type = 'BET_TYPE'
      ORDER BY roi DESC
    `).all() as any[];

    const results: Results = {
      meta: {
        totalRaces: summary.totalRaces,
        totalBets: summary.totalBets,
        noBets: summary.noBets,
        startedAt: '2026-04-11',
        lastUpdated: new Date().toISOString(),
      },
      bankroll: {
        start: 5000,
        current: 5000 + summary.growth,
        peak: 5000 + (summary.growth > 0 ? summary.growth : 0),
        trough: 5000 + (summary.growth < 0 ? summary.growth : 0),
        totalPL: summary.growth,
        maxDrawdown: Math.abs(summary.growth < 0 ? summary.growth : 0),
        history: bets.map((_, i) => 5000 + bets.slice(0, i + 1).reduce((sum: number, b: any) => sum + b.profit_loss, 0)),
      },
      kb: {
        totalSettled: bets.length,
        performanceByTrack: byTrack,
        performanceByBetType: byBetType,
      },
      bets: bets.slice(0, 50), // Last 50 bets for display
      performance: {
        summary,
        byTrack,
        byCondition: [],
        byOddsRange: [],
        byBetType,
        byScoreBand: [],
        byBarrier: [],
        byDistance: [],
        byFieldSize: [],
        roiCurve: bets.map((_, i) => ({
          race: i + 1,
          roi: getMetrics(bets.slice(0, i + 1)).roi,
          bank: 5000 + bets.slice(0, i + 1).reduce((sum: number, b: any) => sum + b.profit_loss, 0),
        })),
      },
    };

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log('✅ Results exported to public/data/results.json\n');
    console.log('📊 EXPORTED DATA SUMMARY\n');
    console.log(`Total Bets: ${summary.totalBets}`);
    console.log(`Total Races: ${summary.totalRaces}`);
    console.log(`Win Rate: ${summary.winStrike}%`);
    console.log(`Place Rate: ${summary.placeStrike}%`);
    console.log(`Total ROI: ${summary.roi}%`);
    console.log(`Total P&L: $${summary.growth.toFixed(2)}\n`);

    console.log('🎯 PERFORMANCE BY TRACK\n');
    byTrack.slice(0, 5).forEach((t: any) => {
      console.log(`${t.label}: ${t.bets} bets, ${t.winStrike}% W/L, ${t.roi}% ROI`);
    });

    console.log('\n✅ Frontend is ready to display updated results\n');
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
