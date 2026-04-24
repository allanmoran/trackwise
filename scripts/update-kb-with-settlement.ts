#!/usr/bin/env node
/**
 * Update knowledge base with April 11-12 settlement results
 * Insert bets, update horse stats, aggregate KB statistics
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// April 11 settlement data
const april11Settlements = [
  { track: 'Alice Springs', race: 1, horse: 'Flying Start', barrier: 2, betType: 'WIN', odds: 3.15, stake: 20, result: 'LOSS', pnl: -20 },
  { track: 'Alice Springs', race: 1, horse: 'Super Sharp', barrier: 1, betType: 'WIN', odds: 2.37, stake: 40, result: 'LOSS', pnl: -40 },
  { track: 'Alice Springs', race: 1, horse: 'Grinzinger Lass', barrier: 7, betType: 'WIN', odds: 4.78, stake: 25, result: 'LOSS', pnl: -25 },
  { track: 'Alice Springs', race: 2, horse: 'Stella Bystarlight', barrier: 6, betType: 'WIN', odds: 2.59, stake: 30, result: 'PLACE', pnl: 7.25 },
  { track: 'Alice Springs', race: 3, horse: 'Bon\'S A Lad', barrier: 3, betType: 'PLACE', odds: 2.54, stake: 25, result: 'PLACE', pnl: 9.63 },
  { track: 'Alice Springs', race: 4, horse: 'Flying Yishu', barrier: 1, betType: 'PLACE', odds: 2.35, stake: 50, result: 'PLACE', pnl: 16.88 },
  { track: 'Alice Springs', race: 5, horse: 'Arrogant Miss', barrier: 5, betType: 'WIN', odds: 3.85, stake: 25, result: 'PLACE', pnl: 17.81 },
  { track: 'Alice Springs', race: 6, horse: 'Valley Prince', barrier: 3, betType: 'PLACE', odds: 3.30, stake: 40, result: 'WIN', pnl: 92.00 },
  { track: 'Alice Springs', race: 7, horse: 'Venting', barrier: 4, betType: 'PLACE', odds: 2.48, stake: 25, result: 'WIN', pnl: 37.00 },
  { track: 'Bowen', race: 1, horse: 'Stellar Legend', barrier: 1, betType: 'WIN', odds: 2.58, stake: 30, result: 'PLACE', pnl: 11.85 },
  { track: 'Bowen', race: 1, horse: 'Arancia', barrier: 3, betType: 'WIN', odds: 4.15, stake: 30, result: 'PLACE', pnl: 23.63 },
  { track: 'Caulfield', race: 1, horse: 'Merchant Flyer', barrier: 7, betType: 'WIN', odds: 2.76, stake: 25, result: 'PLACE', pnl: 11.00 },
  { track: 'Geraldton', race: 1, horse: 'Mahoney\'S Machine', barrier: 1, betType: 'PLACE', odds: 2.78, stake: 30, result: 'LOSS', pnl: -30 },
];

// April 12 settlement data (representative sample)
const april12Settlements = [
  { track: 'Hawkesbury', race: 1, horse: 'Simply Sonnet', barrier: 11, betType: 'WIN', odds: 4.03, stake: 40, result: 'LOSS', pnl: -40 },
  { track: 'Hawkesbury', race: 2, horse: 'Camilla\'S Knickers', barrier: 9, betType: 'WIN', odds: 3.04, stake: 35, result: 'LOSS', pnl: -35 },
  { track: 'Caulfield', race: 3, horse: 'Chapados', barrier: 8, betType: 'WIN', odds: 4.66, stake: 50, result: 'LOSS', pnl: -50 },
  { track: 'Scone', race: 1, horse: 'Moke Lake', barrier: 1, betType: 'WIN', odds: 2.15, stake: 35, result: 'LOSS', pnl: -35 },
  { track: 'Ballina', race: 1, horse: 'Mud \'N\' Blood', barrier: 1, betType: 'WIN', odds: 4.20, stake: 25, result: 'LOSS', pnl: -25 },
  { track: 'Longreach', race: 1, horse: 'Rebelious Red', barrier: 3, betType: 'WIN', odds: 2.93, stake: 20, result: 'LOSS', pnl: -20 },
  { track: 'Sapphire Coast', race: 2, horse: 'Unravel', barrier: 4, betType: 'WIN', odds: 2.82, stake: 25, result: 'LOSS', pnl: -25 },
  { track: 'Townsville', race: 1, horse: 'Oscar Booie', barrier: 1, betType: 'WIN', odds: 3.06, stake: 20, result: 'LOSS', pnl: -20 },
  { track: 'Seymour', race: 1, horse: 'Boyd', barrier: 3, betType: 'WIN', odds: 2.01, stake: 40, result: 'LOSS', pnl: -40 },
  { track: 'Donald', race: 1, horse: 'Amedei', barrier: 1, betType: 'WIN', odds: 4.78, stake: 50, result: 'LOSS', pnl: -50 },
];

interface Settlement {
  track: string;
  race: number;
  horse: string;
  barrier: number;
  betType: 'WIN' | 'PLACE';
  odds: number;
  stake: number;
  result: 'WIN' | 'PLACE' | 'LOSS';
  pnl: number;
}

function getOrCreateHorse(name: string): number {
  const existing = db.prepare('SELECT id FROM horses WHERE name = ?').get(name) as any;
  if (existing) return existing.id;

  db.prepare(`
    INSERT INTO horses (name, career_wins, career_places, career_bets, career_stake, career_return)
    VALUES (?, 0, 0, 0, 0, 0)
  `).run(name);

  return (db.prepare('SELECT id FROM horses WHERE name = ?').get(name) as any).id;
}

function getOrCreateRace(track: string, raceNum: number, date: string = '2026-04-11'): number {
  const existing = db.prepare(
    'SELECT id FROM races WHERE track = ? AND race_number = ? AND date = ?'
  ).get(track, raceNum, date) as any;

  if (existing) return existing.id;

  db.prepare(`
    INSERT INTO races (track, date, race_number)
    VALUES (?, ?, ?)
  `).run(track, date, raceNum);

  return (db.prepare(
    'SELECT id FROM races WHERE track = ? AND race_number = ? AND date = ?'
  ).get(track, raceNum, date) as any).id;
}

function recordBet(settlement: Settlement, date: string): void {
  const horseId = getOrCreateHorse(settlement.horse);
  const raceId = getOrCreateRace(settlement.track, settlement.race, date);

  const odds = settlement.betType === 'WIN' ? settlement.odds : settlement.odds;

  db.prepare(`
    INSERT INTO bets (
      race_id, horse_id, bet_type, stake, closing_odds, status, result, profit_loss, settled_at
    ) VALUES (?, ?, ?, ?, ?, 'SETTLED', ?, ?, datetime('now'))
  `).run(
    raceId,
    horseId,
    settlement.betType,
    settlement.stake,
    odds,
    settlement.result,
    settlement.pnl
  );

  // Update horse stats
  const winCount = settlement.result === 'WIN' ? 1 : 0;
  const placeCount = settlement.result === 'PLACE' ? 1 : 0;

  db.prepare(`
    UPDATE horses SET
      career_bets = career_bets + 1,
      career_wins = career_wins + ?,
      career_places = career_places + ?,
      career_stake = career_stake + ?,
      career_return = career_return + ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(winCount, placeCount, settlement.stake, settlement.stake + settlement.pnl, horseId);
}

function updateKBStats(): void {
  // Clear existing stats
  db.prepare('DELETE FROM kb_stats').run();

  // By Track
  const trackStats = db.prepare(`
    SELECT
      r.track,
      COUNT(b.id) as bets,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      SUM(b.stake) as stake,
      SUM(b.stake + b.profit_loss) as return_amount
    FROM bets b
    JOIN races r ON b.race_id = r.id
    WHERE b.status = 'SETTLED'
    GROUP BY r.track
  `).all() as any[];

  for (const stat of trackStats) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('TRACK', ?, ?, ?, ?, ?, ?)
    `).run(stat.track, stat.bets, stat.wins, stat.places, stat.stake, stat.return_amount);
  }

  // By Horse
  const horseStats = db.prepare(`
    SELECT
      h.name,
      COUNT(b.id) as bets,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      SUM(b.stake) as stake,
      SUM(b.stake + b.profit_loss) as return_amount
    FROM bets b
    JOIN horses h ON b.horse_id = h.id
    WHERE b.status = 'SETTLED'
    GROUP BY h.name
  `).all() as any[];

  for (const stat of horseStats) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('HORSE', ?, ?, ?, ?, ?, ?)
    `).run(stat.name, stat.bets, stat.wins, stat.places, stat.stake, stat.return_amount);
  }

  // By Bet Type
  const betTypeStats = db.prepare(`
    SELECT
      b.bet_type,
      COUNT(b.id) as bets,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      SUM(b.stake) as stake,
      SUM(b.stake + b.profit_loss) as return_amount
    FROM bets b
    WHERE b.status = 'SETTLED'
    GROUP BY b.bet_type
  `).all() as any[];

  for (const stat of betTypeStats) {
    db.prepare(`
      INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
      VALUES ('BET_TYPE', ?, ?, ?, ?, ?, ?)
    `).run(stat.bet_type, stat.bets, stat.wins, stat.places, stat.stake, stat.return_amount);
  }

  // Overall summary
  const overall = db.prepare(`
    SELECT
      COUNT(b.id) as bets,
      SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
      SUM(b.stake) as stake,
      SUM(b.stake + b.profit_loss) as return_amount
    FROM bets b
    WHERE b.status = 'SETTLED'
  `).get() as any;

  db.prepare(`
    INSERT INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
    VALUES ('OVERALL', 'ALL', ?, ?, ?, ?, ?)
  `).run(overall.bets, overall.wins, overall.places, overall.stake, overall.return_amount);
}

async function main() {
  console.log('\n📊 UPDATING KNOWLEDGE BASE WITH SETTLEMENT RESULTS\n');

  try {
    // Record April 11 bets
    console.log('📝 Recording April 11 settlements (13 bets)...');
    for (const settlement of april11Settlements) {
      recordBet(settlement, '2026-04-11');
    }
    console.log(`✅ April 11 recorded\n`);

    // Record April 12 bets
    console.log('📝 Recording April 12 settlements (sample of 10 bets)...');
    for (const settlement of april12Settlements) {
      recordBet(settlement, '2026-04-12');
    }
    console.log(`✅ April 12 recorded\n`);

    // Update KB stats
    console.log('📚 Aggregating KB statistics...');
    updateKBStats();
    console.log(`✅ KB statistics updated\n`);

    // Display summary
    const summary = db.prepare(`
      SELECT
        COUNT(id) as total_bets,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'PLACE' THEN 1 ELSE 0 END) as places,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
        SUM(stake) as total_stake,
        SUM(profit_loss) as total_pnl,
        ROUND(SUM(profit_loss) / SUM(stake) * 100, 1) as roi_percent
      FROM bets
      WHERE status = 'SETTLED'
    `).get() as any;

    console.log('='.repeat(70));
    console.log('📊 KNOWLEDGE BASE SUMMARY\n');
    console.log(`Total Bets Recorded: ${summary.total_bets}`);
    console.log(`  🟢 Wins: ${summary.wins}`);
    console.log(`  🟡 Places: ${summary.places}`);
    console.log(`  🔴 Losses: ${summary.losses}`);
    console.log(`  💰 Total P&L: $${summary.total_pnl.toFixed(2)}`);
    console.log(`  📈 ROI: ${summary.roi_percent}%`);
    console.log('='.repeat(70) + '\n');

    // Show top performers
    console.log('🏆 TOP PERFORMING HORSES (by ROI)\n');
    const topHorses = db.prepare(`
      SELECT
        h.name,
        COUNT(b.id) as bets,
        SUM(CASE WHEN b.result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN b.result = 'PLACE' THEN 1 ELSE 0 END) as places,
        SUM(b.profit_loss) as pnl,
        ROUND(SUM(b.profit_loss) / SUM(b.stake) * 100, 1) as roi
      FROM bets b
      JOIN horses h ON b.horse_id = h.id
      WHERE b.status = 'SETTLED'
      GROUP BY h.name
      ORDER BY roi DESC
      LIMIT 10
    `).all() as any[];

    for (const horse of topHorses) {
      console.log(`${horse.name}: ${horse.bets} bets, ${horse.wins}W ${horse.places}P | $${horse.pnl.toFixed(2)} (${horse.roi}%)`);
    }

    console.log('\n✅ Knowledge base update complete\n');
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
