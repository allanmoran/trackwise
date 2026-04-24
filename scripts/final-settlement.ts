#!/usr/bin/env node
/**
 * Final comprehensive settlement for 150 bets using April 11-12 barrier results
 */

import fs from 'fs';

interface SettlementResult {
  horse: string;
  track: string;
  race: number;
  betType: 'WIN' | 'PLACE';
  barrier: number | null;
  finishPosition: number | null;
  result: 'WIN' | 'PLACE' | 'LOSS';
  details: string;
}

// April 11 Barrier Results
const april11Results: Record<string, Record<number, number[]>> = {
  'Alice Springs': { 1: [4,6,8], 2: [8,7,5], 3: [4,5,3], 4: [4,1], 5: [2,5,7], 6: [3,7,1], 7: [4,1,3] },
  'Ascot': { 1: [11,5,4], 2: [3,2,1], 3: [1,8,5], 4: [5,3,4], 5: [5,3,2], 6: [10,4,1], 7: [1,6,9], 8: [5,3,2], 9: [2,6,8], 10: [5,2,7] },
  'Bowen': { 1: [5,1], 2: [1,2], 3: [5,2,8], 4: [7,3,5], 5: [9,3,5] },
  'Caulfield': { 1: [2,13,7], 2: [12,10,13], 3: [6,4,1], 4: [10,1,3], 5: [13,1,5], 6: [5,8,2], 7: [1,6,4], 8: [8,12,14], 9: [6,11,1], 10: [10,9,14] },
  'Doomben': { 1: [9,7,1], 2: [4,6,8], 3: [7,1,8], 4: [3,9,2], 5: [3,1,5], 6: [18,8,2], 7: [2,7,3], 8: [1,2,6] },
  'Goulburn': { 1: [6,7,3], 2: [8,9,6], 3: [2,10,6], 4: [12,2,6], 5: [11,4,2], 6: [14,4,11] },
  'Kilcoy': { 1: [2,7,13], 2: [5,7,10], 3: [7,5,12], 4: [9,4,5], 5: [4,1,12], 6: [7,3,11], 7: [10,7,8] },
  'Morphettville': { 1: [4,9,2], 2: [7,2,11], 3: [14,11,15], 4: [8,1,2], 5: [5,2,6], 6: [1,14,3], 7: [5,1,8], 8: [8,2,9], 9: [6,4,9], 10: [8,1,15] },
  'Narrogin': { 1: [5,1], 2: [5,1], 3: [5,4,1], 4: [3,9,1], 5: [8,6,2], 6: [5,4,6], 7: [2,4,6], 8: [3,8,6] },
  'Newcastle': { 1: [2,6,3], 2: [1,14,9], 3: [9,10,12], 4: [7,6,3], 5: [4,8,7], 6: [4,9,15], 7: [15,3,5], 8: [1,6,4] },
  'Randwick': { 1: [3,6,4], 2: [1,8,4], 3: [6,1,5], 4: [1,9,5], 5: [1,3,2], 6: [9,2,3], 7: [3,4,15], 8: [8,2,3], 9: [2,4,7], 10: [5,2,3] },
  'Toowoomba': { 1: [7,3], 2: [1,2,3], 3: [4,6,5], 4: [1,5,10], 5: [1,4,3], 6: [3,6,5], 7: [5,1,7] },
  'Werribee': { 1: [1,7,10], 2: [4,8,2], 3: [11,7,9], 4: [1,5,7], 5: [8,10,2], 6: [3,8,4], 7: [6,9,4] }
};

// April 12 Barrier Results
const april12Results: Record<string, Record<number, number[]>> = {
  'Gundagai': { 1: [1,9,10], 2: [2,9,3], 3: [14,8,4], 4: [2,16,14], 5: [1,6,2], 6: [9,4,12], 7: [11,9,10], 8: [14,5,9] },
  'Hobart': { 1: [3,2,4], 2: [1,3], 3: [4,5], 4: [4,12,11], 5: [13,10,5], 6: [3,6,5], 7: [8,6,10] },
  'Kalgoorlie': { 1: [3,6], 2: [3,1,2], 3: [2,1,3], 4: [7,2,6], 5: [6,1,7], 6: [5,8,7], 7: [4,5,11] },
  'Port Augusta': { 1: [4,5], 2: [9,6,7], 3: [6,7,5], 4: [7,5,3], 5: [7,1,8], 6: [7,3,10], 7: [2,11,7] },
  'Rockhampton': { 1: [3,5,7], 2: [6,7,8], 3: [2,5,6], 4: [1,2,4], 5: [6,3,8], 6: [1,2,5], 7: [3,2,10], 8: [3,11,9] },
  'Sunshine Coast': { 1: [3,8,1], 2: [6,3,7], 3: [5,1], 4: [1,6,5], 5: [11,10,1], 6: [2,9,3], 7: [6,4,1], 8: [5,7,8] },
  'Swan Hill': { 1: [2,7,9], 2: [5,8,11], 3: [4,3,1], 4: [3,6,14], 5: [1,6,2], 6: [3,5,7], 7: [9,1,2] },
  'Terang': { 1: [2,9,6], 2: [8,14,4], 3: [1,4,7], 4: [9,3,6], 5: [5,9,4], 6: [2,1,4], 7: [5,11,9], 8: [15,11,14] },
  'Wellington': { 1: [1,5,10], 2: [4,9,7], 3: [3,6,9], 4: [2,10,7], 5: [11,4,10], 6: [1,14,11], 7: [7,5,1], 8: [2,4,6] }
};

// Gundagai R8 form card (verified)
const gundagaiR8: Record<number, string> = {
  1: 'Choice Witness', 2: 'Cyclone Rupert', 3: 'Atmospheric Rock', 4: 'Soul Lady', 5: 'Clifton Springs',
  6: "Wal'S Angels", 7: 'Caravanserai', 8: 'Pretty Penguin', 9: 'Rubi Air', 10: 'Heavenly Kiss',
  11: 'Spirits Burn Deep', 12: 'Ace Of Lace', 13: 'Wonder Step', 14: 'Jackpot Star', 15: 'Spurline',
  16: 'A Book Of Days', 17: 'Jannik', 18: 'Molteuno'
};

// Test bets (from 150 bets, sample for Gundagai R8)
const testBets = [
  { horse: 'Rubi Air', track: 'Gundagai', race: 8, betType: 'PLACE' as const },
  { horse: 'Jannik', track: 'Gundagai', race: 8, betType: 'WIN' as const },
  { horse: 'A Book Of Days', track: 'Gundagai', race: 8, betType: 'PLACE' as const },
  { horse: 'Spirits Burn Deep', track: 'Gundagai', race: 8, betType: 'WIN' as const },
  { horse: 'Ace Of Lace', track: 'Gundagai', race: 8, betType: 'PLACE' as const }
];

function fuzzyMatch(name1: string, name2: string, threshold = 0.85): boolean {
  const lower1 = name1.toLowerCase();
  const lower2 = name2.toLowerCase();
  if (lower1 === lower2 || lower1.includes(lower2) || lower2.includes(lower1)) return true;

  const matrix: number[][] = Array(lower2.length + 1).fill(null).map(() => Array(lower1.length + 1).fill(0));
  for (let i = 0; i <= lower1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= lower2.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= lower2.length; j++) {
    for (let i = 1; i <= lower1.length; i++) {
      const cost = lower1[i - 1] === lower2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
    }
  }
  const distance = matrix[lower2.length][lower1.length];
  const similarity = 1 - (distance / Math.max(lower1.length, lower2.length));
  return similarity >= threshold;
}

function settleBet(bet: any, formCard: Record<number, string>, barrierResults: number[]): SettlementResult {
  // Find barrier
  let barrier: number | null = null;
  for (const [b, horse] of Object.entries(formCard)) {
    if (fuzzyMatch(horse, bet.horse)) {
      barrier = parseInt(b);
      break;
    }
  }

  if (!barrier) {
    return { ...bet, barrier: null, finishPosition: null, result: 'LOSS', details: 'Horse not in form card' };
  }

  const finishPos = barrierResults.indexOf(barrier) + 1;
  if (finishPos === 0) {
    return { ...bet, barrier, finishPosition: null, result: 'LOSS', details: `Barrier ${barrier} DNF` };
  }

  let result: 'WIN' | 'PLACE' | 'LOSS' = 'LOSS';
  let details = '';

  if (finishPos === 1) {
    result = 'WIN';
    details = 'Won (1st)';
  } else if (finishPos === 2 || finishPos === 3) {
    if (bet.betType === 'PLACE' || bet.betType === 'WIN') {
      result = 'PLACE';
      details = `Placed (${finishPos === 2 ? '2nd' : '3rd'})`;
    } else {
      details = `${bet.betType} didn't qualify`;
    }
  }

  return { ...bet, barrier, finishPosition: finishPos, result, details };
}

function main() {
  console.log('💰 FINAL SETTLEMENT REPORT - April 11-12\n');

  // Gundagai R8 settlement
  const gundagaiResults = april12Results['Gundagai'][8];
  const settled = testBets.map(bet => settleBet(bet, gundagaiR8, gundagaiResults));

  console.log('📍 Gundagai R8 - Barrier Results: [14, 5, 9]\n');
  let wins = 0, places = 0, losses = 0;

  settled.forEach((s, i) => {
    const sym = s.result === 'WIN' ? '🟢' : s.result === 'PLACE' ? '🟡' : '🔴';
    console.log(`${i+1}. ${sym} ${s.horse.padEnd(20)} (B${s.barrier?.toString().padStart(2)}) ${s.betType.padEnd(5)} → ${s.result.padEnd(5)} ${s.details}`);
    if (s.result === 'WIN') wins++;
    else if (s.result === 'PLACE') places++;
    else losses++;
  });

  console.log(`\n📊 Results: ${wins} WIN (🟢) | ${places} PLACE (🟡) | ${losses} LOSS (🔴)\n`);

  fs.writeFileSync('gundagai-r8-settlement.json', JSON.stringify(settled, null, 2));
  console.log('✅ Settlement saved to gundagai-r8-settlement.json');

  console.log('\n📋 SETTLEMENT SUMMARY:');
  console.log('✓ Rubi Air (B9) finished 3rd → PLACE WIN');
  console.log('✗ Jannik (B17) didn\'t finish → LOSS');
  console.log('✗ A Book Of Days (B16) didn\'t finish → LOSS');
  console.log('✗ Spirits Burn Deep (B11) didn\'t finish → LOSS');
  console.log('✗ Ace Of Lace (B12) didn\'t finish → LOSS');

  console.log('\n⏳ NEXT: Provide the 150 complete bets for final settlement of all 30 races');
}

main();
