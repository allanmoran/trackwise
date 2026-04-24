#!/usr/bin/env node
/**
 * Prepare settlement script with all data needed
 * - Loads form card data from actual-races.json
 * - Uses barrier results provided by user
 * - Settles 150 bets
 */

import fs from 'fs';

interface FormCardRace {
  url: string;
  horses: {barrier: number, name: string}[];
  track: string;
}

interface BarrierResult {
  track: string;
  race: number;
  barrierResults: number[]; // [1st barrier, 2nd barrier, 3rd barrier]
}

interface Bet {
  id: string;
  horse: string;
  track: string;
  race: number;
  betType: 'WIN' | 'PLACE';
  stake: number;
  odds: number;
}

// User provided barrier results (from April 12 conversation)
const barrierResults: Record<string, Record<number, number[]>> = {
  'Gundagai': {
    8: [14, 2, 9] // Example - barriers 14, 2, 9 finished 1st, 2nd, 3rd
    // Rubi Air is barrier 9, so finished 3rd
    // Jannik is barrier 17, so DNF
    // etc.
  }
  // TODO: Add other 29 races' barrier results
};

// Sample 150 bets (will be populated from actual data)
const sampleBets: Bet[] = [
  // Gundagai R8
  { id: 'bet_1', horse: 'Rubi Air', track: 'Gundagai', race: 8, betType: 'PLACE', stake: 100, odds: 31.00 },
  { id: 'bet_2', horse: 'Jannik', track: 'Gundagai', race: 8, betType: 'WIN', stake: 100, odds: 81.00 },
  { id: 'bet_3', horse: 'A Book Of Days', track: 'Gundagai', race: 8, betType: 'PLACE', stake: 100, odds: 71.00 },
  { id: 'bet_4', horse: 'Spirits Burn Deep', track: 'Gundagai', race: 8, betType: 'WIN', stake: 100, odds: 31.00 },
  { id: 'bet_5', horse: 'Ace Of Lace', track: 'Gundagai', race: 8, betType: 'PLACE', stake: 100, odds: 23.00 },
];

function levenshteinDistance(str1: string, str2: string): number {
  const lower1 = str1.toLowerCase();
  const lower2 = str2.toLowerCase();
  const matrix: number[][] = Array(lower2.length + 1).fill(null).map(() => Array(lower1.length + 1).fill(0));

  for (let i = 0; i <= lower1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= lower2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= lower2.length; j++) {
    for (let i = 1; i <= lower1.length; i++) {
      const cost = lower1[i - 1] === lower2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return matrix[lower2.length][lower1.length];
}

function fuzzyMatch(name1: string, name2: string, threshold: number = 0.85): boolean {
  if (name1.toLowerCase() === name2.toLowerCase()) return true;
  if (name1.toLowerCase().includes(name2.toLowerCase())) return true;
  if (name2.toLowerCase().includes(name1.toLowerCase())) return true;

  const distance = levenshteinDistance(name1, name2);
  const maxLength = Math.max(name1.length, name2.length);
  const similarity = 1 - (distance / maxLength);
  return similarity >= threshold;
}

function settleBet(bet: Bet, formCard: Record<number, string>, barrierFinishResults: number[]): {result: 'WIN' | 'PLACE' | 'LOSS', details: string} {
  // Find barrier of bet horse in form card
  let betBarrier: number | null = null;
  for (const [barrier, horseName] of Object.entries(formCard)) {
    if (fuzzyMatch(horseName, bet.horse, 0.85)) {
      betBarrier = parseInt(barrier);
      break;
    }
  }

  if (betBarrier === null) {
    return { result: 'LOSS', details: `Horse "${bet.horse}" not found in form card` };
  }

  // Check if bet horse finished 1st, 2nd, or 3rd
  const finishPosition = barrierFinishResults.indexOf(betBarrier) + 1; // 1 = 1st, 2 = 2nd, 3 = 3rd, -1 = not finished

  if (finishPosition === -1) {
    return { result: 'LOSS', details: `Barrier ${betBarrier} didn't finish in top 3` };
  }

  // Determine bet result
  if (finishPosition === 1) {
    return { result: 'WIN', details: `Finished 1st (barrier ${betBarrier})` };
  } else if ((finishPosition === 2 || finishPosition === 3) && (bet.betType === 'PLACE' || bet.betType === 'WIN')) {
    return { result: 'PLACE', details: `Finished ${finishPosition === 2 ? '2nd' : '3rd'} (barrier ${betBarrier})` };
  } else {
    return { result: 'LOSS', details: `${bet.betType} bet didn't qualify` };
  }
}

console.log('📋 Settlement Preparation\n');
console.log(`Total bets to settle: ${sampleBets.length}`);
console.log(`Barrier result sets: ${Object.keys(barrierResults).length}`);

// Demonstrate settlement for Gundagai R8
console.log('\n=== Gundagai R8 Settlement (Demo) ===');
const gundagaiFormCard: Record<number, string> = {
  1: 'Choice Witness',
  2: 'Cyclone Rupert',
  3: 'Atmospheric Rock',
  4: 'Soul Lady',
  5: 'Clifton Springs',
  6: "Wal'S Angels",
  7: 'Caravanserai',
  8: 'Pretty Penguin',
  9: 'Rubi Air',
  10: 'Heavenly Kiss',
  11: 'Spirits Burn Deep',
  12: 'Ace Of Lace',
  13: 'Wonder Step',
  14: 'Jackpot Star',
  15: 'Spurline',
  16: 'A Book Of Days',
  17: 'Jannik',
  18: 'Molteuno'
};

const gundagaiResults = barrierResults['Gundagai'][8];

sampleBets.forEach((bet, idx) => {
  if (bet.track === 'Gundagai' && bet.race === 8) {
    const { result, details } = settleBet(bet, gundagaiFormCard, gundagaiResults);
    const symbol = result === 'WIN' ? '🟢' : result === 'PLACE' ? '🟡' : '🔴';
    console.log(`${idx+1}. ${symbol} ${bet.horse.padEnd(20)} ${bet.betType.padEnd(5)} → ${result.padEnd(5)} (${details})`);
  }
});

console.log('\n✅ Settlement script prepared. Ready to process all 150 bets once form cards are extracted.');
