#!/usr/bin/env node
/**
 * Settle 150 bets using barrier results and form card data
 */

import fs from 'fs';

interface BetResult {
  horse: string;
  track: string;
  race: number;
  betType: 'WIN' | 'PLACE';
  barrier: number | null;
  finishPosition: number | null;
  result: 'WIN' | 'PLACE' | 'LOSS';
  details: string;
}

// Barrier results from April 11 (user provided)
const barrierResults: Record<string, Record<number, number[]>> = {
  'Alice Springs': {
    1: [4, 6, 8],
    2: [8, 7, 5],
    3: [4, 5, 3],
    4: [4, 1],
    5: [2, 5, 7],
    6: [3, 7, 1],
    7: [4, 1, 3]
  },
  'Ascot': {
    1: [11, 5, 4],
    2: [3, 2, 1],
    3: [1, 8, 5],
    4: [5, 3, 4],
    5: [5, 3, 2],
    6: [10, 4, 1],
    7: [1, 6, 9],
    8: [5, 3, 2],
    9: [2, 6, 8],
    10: [5, 2, 7]
  },
  'Bowen': {
    1: [5, 1],
    2: [1, 2],
    3: [5, 2, 8],
    4: [7, 3, 5],
    5: [9, 3, 5]
  },
  'Caulfield': {
    1: [2, 13, 7],
    2: [12, 10, 13],
    3: [6, 4, 1],
    4: [10, 1, 3],
    5: [13, 1, 5],
    6: [5, 8, 2],
    7: [1, 6, 4],
    8: [8, 12, 14],
    9: [6, 11, 1],
    10: [10, 9, 14]
  },
  'Doomben': {
    1: [9, 7, 1],
    2: [4, 6, 8],
    3: [7, 1, 8],
    4: [3, 9, 2],
    5: [3, 1, 5],
    6: [18, 8, 2],
    7: [2, 7, 3],
    8: [1, 2, 6]
  },
  'Goulburn': {
    1: [6, 7, 3],
    2: [8, 9, 6],
    3: [2, 10, 6],
    4: [12, 2, 6],
    5: [11, 4, 2],
    6: [14, 4, 11]
  },
  'Kilcoy': {
    1: [2, 7, 13],
    2: [5, 7, 10],
    3: [7, 5, 12],
    4: [9, 4, 5],
    5: [4, 1, 12],
    6: [7, 3, 11],
    7: [10, 7, 8]
  },
  'Morphettville': {
    1: [4, 9, 2],
    2: [7, 2, 11],
    3: [14, 11, 15],
    4: [8, 1, 2],
    5: [5, 2, 6],
    6: [1, 14, 3],
    7: [5, 1, 8],
    8: [8, 2, 9],
    9: [6, 4, 9],
    10: [8, 1, 15]
  },
  'Narrogin': {
    1: [5, 1],
    2: [5, 1],
    3: [5, 4, 1],
    4: [3, 9, 1],
    5: [8, 6, 2],
    6: [5, 4, 6],
    7: [2, 4, 6],
    8: [3, 8, 6]
  },
  'Newcastle': {
    1: [2, 6, 3],
    2: [1, 14, 9],
    3: [9, 10, 12],
    4: [7, 6, 3],
    5: [4, 8, 7],
    6: [4, 9, 15],
    7: [15, 3, 5],
    8: [1, 6, 4]
  },
  'Randwick': {
    1: [3, 6, 4],
    2: [1, 8, 4],
    3: [6, 1, 5],
    4: [1, 9, 5],
    5: [1, 3, 2],
    6: [9, 2, 3],
    7: [3, 4, 15],
    8: [8, 2, 3],
    9: [2, 4, 7],
    10: [5, 2, 3]
  },
  'Toowoomba': {
    1: [7, 3],
    2: [1, 2, 3],
    3: [4, 6, 5],
    4: [1, 5, 10],
    5: [1, 4, 3],
    6: [3, 6, 5],
    7: [5, 1, 7]
  },
  'Werribee': {
    1: [1, 7, 10],
    2: [4, 8, 2],
    3: [11, 7, 9],
    4: [1, 5, 7],
    5: [8, 10, 2],
    6: [3, 8, 4],
    7: [6, 9, 4]
  }
};

// Form cards extracted (manual + from scraping)
const formCards: Record<string, Record<number, Record<number, string>>> = {
  'Gundagai': {
    8: {
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
    }
  }
};

// Sample bets to settle (from the 150 bets)
const sampleBets = [
  { horse: 'Rubi Air', track: 'Gundagai', race: 8, betType: 'PLACE' as const },
  { horse: 'Jannik', track: 'Gundagai', race: 8, betType: 'WIN' as const },
  { horse: 'A Book Of Days', track: 'Gundagai', race: 8, betType: 'PLACE' as const },
  { horse: 'Spirits Burn Deep', track: 'Gundagai', race: 8, betType: 'WIN' as const },
  { horse: 'Ace Of Lace', track: 'Gundagai', race: 8, betType: 'PLACE' as const }
];

function fuzzyMatch(name1: string, name2: string, threshold = 0.85): boolean {
  const lower1 = name1.toLowerCase();
  const lower2 = name2.toLowerCase();

  if (lower1 === lower2) return true;
  if (lower1.includes(lower2) || lower2.includes(lower1)) return true;

  // Levenshtein distance
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

  const distance = matrix[lower2.length][lower1.length];
  const maxLength = Math.max(lower1.length, lower2.length);
  const similarity = 1 - (distance / maxLength);
  return similarity >= threshold;
}

function settleBet(bet: {horse: string, track: string, race: number, betType: 'WIN' | 'PLACE'}): BetResult {
  // Get form card for this race
  const formCard = formCards[bet.track]?.[bet.race];
  if (!formCard) {
    return {
      ...bet,
      barrier: null,
      finishPosition: null,
      result: 'LOSS',
      details: `Form card not found for ${bet.track} R${bet.race}`
    };
  }

  // Find barrier of bet horse
  let betBarrier: number | null = null;
  for (const [barrier, horseName] of Object.entries(formCard)) {
    if (fuzzyMatch(horseName, bet.horse, 0.85)) {
      betBarrier = parseInt(barrier);
      break;
    }
  }

  if (betBarrier === null) {
    return {
      ...bet,
      barrier: null,
      finishPosition: null,
      result: 'LOSS',
      details: `Horse "${bet.horse}" not found in form card`
    };
  }

  // Get barrier results for this race
  const results = barrierResults[bet.track]?.[bet.race];
  if (!results) {
    return {
      ...bet,
      barrier: betBarrier,
      finishPosition: null,
      result: 'LOSS',
      details: `Barrier results not found for ${bet.track} R${bet.race}`
    };
  }

  // Check finish position
  const finishPosition = results.indexOf(betBarrier) + 1; // 1 = 1st, 2 = 2nd, 3 = 3rd, 0 = not finished

  if (finishPosition === 0) {
    return {
      ...bet,
      barrier: betBarrier,
      finishPosition: null,
      result: 'LOSS',
      details: `Barrier ${betBarrier} didn't finish in top 3`
    };
  }

  // Determine result
  let result: 'WIN' | 'PLACE' | 'LOSS' = 'LOSS';
  let details = '';

  if (finishPosition === 1) {
    result = 'WIN';
    details = `Won (1st place)`;
  } else if (finishPosition === 2 || finishPosition === 3) {
    if (bet.betType === 'PLACE' || bet.betType === 'WIN') {
      result = 'PLACE';
      details = `Placed (${finishPosition === 2 ? '2nd' : '3rd'} place)`;
    } else {
      result = 'LOSS';
      details = `${bet.betType} bet didn't qualify`;
    }
  }

  return {
    ...bet,
    barrier: betBarrier,
    finishPosition,
    result,
    details
  };
}

function main() {
  console.log('📊 Bet Settlement Report - April 11\n');
  console.log(`Barrier results loaded: ${Object.keys(barrierResults).length} tracks`);
  console.log(`Form cards loaded: ${Object.keys(formCards).length} tracks\n`);

  const settled = sampleBets.map(bet => settleBet(bet));

  console.log('=== Gundagai R8 Settlement ===\n');
  let wins = 0, places = 0, losses = 0;

  settled.forEach((bet, idx) => {
    const symbol = bet.result === 'WIN' ? '🟢' : bet.result === 'PLACE' ? '🟡' : '🔴';
    console.log(`${idx + 1}. ${symbol} ${bet.horse.padEnd(20)} (B${bet.barrier?.toString().padStart(2)}) ${bet.betType.padEnd(5)} → ${bet.result.padEnd(5)} ${bet.details}`);

    if (bet.result === 'WIN') wins++;
    else if (bet.result === 'PLACE') places++;
    else losses++;
  });

  console.log(`\n📈 Results: ${wins} WIN | ${places} PLACE | ${losses} LOSS`);

  // Save settlement report
  fs.writeFileSync('settlement-gundagai-r8.json', JSON.stringify(settled, null, 2));
  console.log('\n✅ Settlement report saved to settlement-gundagai-r8.json');

  console.log('\n📝 Next Steps:');
  console.log('1. Provide form cards for remaining 29 races');
  console.log('2. Provide complete list of 150 bets');
  console.log('3. Provide April 12 barrier results if any bets are from that date');
}

main();
