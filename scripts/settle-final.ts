#!/usr/bin/env node
/**
 * Final settlement: form cards + barrier results
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Load form data from scraper output
const correctRaces = JSON.parse(fs.readFileSync(path.join(__dirname, '../correct-races.json'), 'utf-8'));

// Build formData from scraped races
const formData: Record<string, Record<number, Record<number, string>>> = {};
correctRaces.forEach((race: any) => {
  if (!formData[race.track]) {
    formData[race.track] = {};
  }
  formData[race.track][race.raceNum] = race.horses;
});

// Barrier results from user's April 12 table
const barrierResults: Record<string, Record<number, number[]>> = {
  'Alice Springs': {
    1: [4, 6, 8], 2: [8, 7, 5], 3: [4, 5, 3], 4: [4, 1], 5: [2, 5, 7],
    6: [3, 7, 1], 7: [4, 1, 3]
  },
  'Ascot': {
    1: [11, 5, 4], 2: [3, 2, 1], 3: [1, 8, 5], 4: [5, 3, 4], 5: [5, 3, 2],
    6: [10, 4, 1], 7: [1, 6, 9], 8: [5, 3, 2], 9: [2, 6, 8], 10: [5, 2, 7]
  },
  'Ballina': {
    1: [10, 7, 6], 2: [13, 7, 2], 3: [9, 3, 8], 4: [4, 8, 5],
    5: [2, 4, 7], 6: [4, 12, 5]
  },
  'Bowen': {
    1: [5, 1], 2: [1, 2], 3: [5, 2, 8], 4: [7, 3, 5], 5: [9, 3, 5]
  },
  'Caulfield': {
    1: [2, 13, 7], 2: [12, 10, 13], 3: [6, 4, 1], 4: [10, 1, 3],
    5: [13, 1, 5], 6: [5, 8, 2], 7: [1, 6, 4], 8: [8, 12, 14],
    9: [6, 11, 1], 10: [10, 9, 14]
  },
  'Geraldton': {
    1: [6, 7, 3]
  }
};

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshteinDistance(a: string, b: string): number {
  const aNorm = normaliseName(a);
  const bNorm = normaliseName(b);
  const matrix: number[][] = [];
  for (let i = 0; i <= bNorm.length; i++) matrix[i] = [i];
  for (let j = 0; j <= aNorm.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= bNorm.length; i++) {
    for (let j = 1; j <= aNorm.length; j++) {
      const cost = aNorm[j - 1] === bNorm[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[bNorm.length][aNorm.length];
}

function fuzzyMatch(horse: string, target: string): boolean {
  if (horse.toLowerCase() === target.toLowerCase()) return true;
  const dist = levenshteinDistance(horse, target);
  const maxLen = Math.max(normaliseName(horse).length, normaliseName(target).length);
  const similarity = 1 - (dist / maxLen);
  return similarity >= 0.85;
}

console.log('======================================================================');
console.log('🏇 SETTLING 150 BETS WITH CORRECT FORM CARD DATA\n');

// Get all pending bets
const pendingBets = db.prepare(`
  SELECT b.id, b.horse_id, b.race_id, h.name as horse_name, r.track, r.race_number
  FROM bets b
  JOIN horses h ON b.horse_id = h.id
  JOIN races r ON b.race_id = r.id
  WHERE b.status = 'ACTIVE'
  ORDER BY r.track, r.race_number, h.name
`).all() as any[];

console.log(`Found ${pendingBets.length} pending bets\n`);

let wins = 0, places = 0, losses = 0;

// Process each bet
for (const bet of pendingBets) {
  const track = bet.track;
  const raceNum = bet.race_number;
  const horseToFind = bet.horse_name;

  if (!barrierResults[track] || !barrierResults[track][raceNum]) {
    console.log(`⚠ No barrier results for ${track} R${raceNum}`);
    continue;
  }

  if (!formData[track] || !formData[track][raceNum]) {
    console.log(`⚠ No form data for ${track} R${raceNum}`);
    continue;
  }

  const finishingBarriers = barrierResults[track][raceNum];
  const raceHorses = formData[track][raceNum];

  let result = 'LOSS';

  // Check each finishing barrier
  for (let pos = 0; pos < finishingBarriers.length; pos++) {
    const barrier = finishingBarriers[pos];
    const horseInBarrier = raceHorses[barrier];

    if (horseInBarrier && fuzzyMatch(horseToFind, horseInBarrier)) {
      if (pos === 0) {
        result = 'WIN';
      } else if (pos === 1 || pos === 2) {
        result = 'PLACE';
      }
      break;
    }
  }

  // Update database
  if (result === 'WIN') {
    wins++;
    db.prepare(`UPDATE bets SET status = 'SETTLED', result = 'WIN', settled_at = datetime('now') WHERE id = ?`)
      .run(bet.id);
  } else if (result === 'PLACE') {
    places++;
    db.prepare(`UPDATE bets SET status = 'SETTLED', result = 'PLACE', settled_at = datetime('now') WHERE id = ?`)
      .run(bet.id);
  } else {
    losses++;
    db.prepare(`UPDATE bets SET status = 'SETTLED', result = 'LOSS', settled_at = datetime('now') WHERE id = ?`)
      .run(bet.id);
  }
}

console.log('======================================================================');
console.log('📊 SETTLEMENT COMPLETE\n');
console.log(`Wins: ${wins} | Places: ${places} | Losses: ${losses}`);
console.log(`Total Bets: ${wins + places + losses}/150`);
console.log('======================================================================\n');

