#!/usr/bin/env node
/**
 * Settle April 11-12 bets using race meets data
 * Extracts form cards from CSV files and barrier results
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Barrier results from April 11-12 racenet
const barrierResults: Record<string, Record<number, number[]>> = {
  // April 11
  'Alice Springs': { 1: [4,6,8], 2: [8,7,5], 3: [4,5,3], 4: [4,1,3], 5: [2,5,7], 6: [3,7,1], 7: [4,1,3] },
  'Ascot': { 1: [11,5,4], 2: [3,2,1], 3: [1,8,5], 4: [5,3,4], 5: [5,3,2], 6: [10,4,1], 7: [1,6,9], 8: [5,3,2], 9: [2,6,8], 10: [5,2,7] },
  'Bowen': { 1: [5,1,3], 2: [1,2,5], 3: [5,2,8], 4: [7,3,5], 5: [9,3,5] },
  'Caulfield': { 1: [2,13,7], 2: [12,10,13], 3: [6,4,1], 4: [10,1,3], 5: [13,1,5], 6: [5,8,2], 7: [1,6,4], 8: [8,12,14], 9: [6,11,1], 10: [10,9,14] },
  'Ballina': { 1: [10,7,6], 2: [13,7,2], 3: [9,3,8], 4: [4,8,5], 5: [2,4,7], 6: [4,12,5] },
  'Geraldton': { 1: [6,7,8] },
};

// Load form cards from April 11 CSV files
function loadFormCardsFromCSV(): Record<string, Record<number, Record<number, string>>> {
  const formCards: Record<string, Record<number, Record<number, string>>> = {};
  const csvDir = '/Users/mora0145/Downloads';
  const csvFiles = fs.readdirSync(csvDir)
    .filter(f => f.match(/20260411.*\.csv$/))
    .sort();

  for (const csvFile of csvFiles) {
    const filePath = path.join(csvDir, csvFile);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.trim().split('\n');

    if (lines.length < 2) continue;

    const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const numIdx = header.indexOf('Num');
    const nameIdx = header.indexOf('Horse Name');

    // Extract track and race from filename
    const match = csvFile.match(/20260411-(.+?)-r(\d+)\.csv/i);
    if (!match) continue;

    let track = match[1]
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    track = track.replace(/alice springs/i, 'Alice Springs')
      .replace(/ascot/i, 'Ascot')
      .replace(/bowen/i, 'Bowen')
      .replace(/caulfield/i, 'Caulfield')
      .replace(/ballina/i, 'Ballina')
      .replace(/geraldton/i, 'Geraldton');

    const raceNum = parseInt(match[2]);

    if (!formCards[track]) formCards[track] = {};
    if (!formCards[track][raceNum]) formCards[track][raceNum] = {};

    // Parse horses
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < Math.max(numIdx, nameIdx) + 1) continue;

      const num = (parts[numIdx] || '').trim().replace(/^"|"$/g, '');
      const name = (parts[nameIdx] || '').trim().replace(/^"|"$/g, '');

      if (name && num) {
        const barrierNum = parseInt(num);
        if (barrierNum > 0) {
          formCards[track][raceNum][barrierNum] = name;
        }
      }
    }
  }

  return formCards;
}

function fuzzyMatch(a: string, b: string, threshold: number = 0.85): boolean {
  const aNorm = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const bNorm = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  if (aNorm === bNorm) return true;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;

  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= bNorm.length; i++) matrix[i] = [i];
  for (let j = 0; j <= aNorm.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= bNorm.length; i++) {
    for (let j = 1; j <= aNorm.length; j++) {
      const cost = aNorm[j - 1] === bNorm[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[bNorm.length][aNorm.length];
  const similarity = 1 - (distance / Math.max(aNorm.length, bNorm.length));
  return similarity >= threshold;
}

async function main() {
  console.log('🏇 SETTLING APRIL 11-12 BETS\n');

  // Load form cards from CSV
  console.log('📂 Loading form cards from April 11 CSV files...');
  const formCards = loadFormCardsFromCSV();
  console.log(`✓ Loaded form cards for ${Object.keys(formCards).length} tracks\n`);

  // Get pending bets
  const pendingBets = db.prepare(`
    SELECT b.id, r.track, r.race_number, h.name as horse_name, b.bet_type
    FROM bets b
    JOIN races r ON b.race_id = r.id
    JOIN horses h ON b.horse_id = h.id
    WHERE b.result IS NULL
    ORDER BY r.track, r.race_number
  `).all() as any[];

  console.log(`Found ${pendingBets.length} pending bets\n`);

  let settled = 0;
  let wins = 0, places = 0, losses = 0;

  // Process each race
  const raceMap = new Map<string, any[]>();
  for (const bet of pendingBets) {
    const key = `${bet.track}_R${bet.race_number}`;
    if (!raceMap.has(key)) raceMap.set(key, []);
    raceMap.get(key)!.push(bet);
  }

  for (const [raceKey, raceBets] of raceMap) {
    const [track, raceNum] = raceKey.split('_R');
    const raceNumber = parseInt(raceNum);

    console.log(`${track} R${raceNumber}:`);

    // Get barrier results
    const trackResults = barrierResults[track];
    const finishingBarriers = trackResults?.[raceNumber];

    if (!finishingBarriers) {
      console.log(`  ⚠️  No barrier results\n`);
      for (const bet of raceBets) {
        db.prepare(`UPDATE bets SET result = 'LOSS', status = 'SETTLED', settled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(bet.id);
        losses++;
        settled++;
      }
      continue;
    }

    // Get form card
    const trackForm = formCards[track];
    const raceForm = trackForm?.[raceNumber];

    if (!raceForm) {
      console.log(`  ⚠️  No form card data\n`);
      for (const bet of raceBets) {
        db.prepare(`UPDATE bets SET result = 'LOSS', status = 'SETTLED', settled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(bet.id);
        losses++;
        settled++;
      }
      continue;
    }

    console.log(`  ✓ Finishing barriers: ${finishingBarriers.join(', ')}`);

    // Settle each bet
    for (const bet of raceBets) {
      let result: 'WIN' | 'PLACE' | 'LOSS' = 'LOSS';

      // Check each finishing barrier
      for (let pos = 0; pos < finishingBarriers.length; pos++) {
        const barrierNum = finishingBarriers[pos];
        const finishingHorse = raceForm[barrierNum];

        if (finishingHorse && fuzzyMatch(finishingHorse, bet.horse_name)) {
          result = pos === 0 ? 'WIN' : pos <= 2 ? 'PLACE' : 'LOSS';
          console.log(`    ${bet.horse_name}: ${result} (matched barrier ${barrierNum})`);
          break;
        }
      }

      if (result === 'LOSS') {
        console.log(`    ${bet.horse_name}: LOSS`);
      }

      // Calculate profit/loss
      const betData = db.prepare(`SELECT stake, closing_odds, opening_odds FROM bets WHERE id = ?`).get(bet.id) as any;
      const odds = betData.closing_odds || betData.opening_odds || 0;
      let profitLoss = 0;
      if (result === 'WIN') profitLoss = betData.stake * (odds - 1);
      else if (result === 'PLACE') profitLoss = betData.stake * ((odds - 1) / 4);
      else profitLoss = -betData.stake;

      db.prepare(`
        UPDATE bets
        SET result = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(result, Math.round(profitLoss * 100) / 100, bet.id);

      if (result === 'WIN') wins++;
      else if (result === 'PLACE') places++;
      else losses++;

      settled++;
    }

    console.log('');
  }

  // Summary
  console.log('='.repeat(70));
  console.log('📊 SETTLEMENT SUMMARY\n');
  console.log(`Settled: ${settled}/${pendingBets.length}`);
  console.log(`WIN: ${wins} | PLACE: ${places} | LOSS: ${losses}\n`);

  const finalStatus = db.prepare(`
    SELECT
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
      COUNT(CASE WHEN result = 'PLACE' THEN 1 END) as places,
      COUNT(CASE WHEN result = 'LOSS' THEN 1 END) as losses,
      ROUND(SUM(profit_loss), 2) as total_pnl
    FROM bets
    WHERE result IS NOT NULL
  `).get() as any;

  console.log(`Total P&L: $${finalStatus.total_pnl}`);
  console.log('='.repeat(70) + '\n');

  process.exit(0);
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
