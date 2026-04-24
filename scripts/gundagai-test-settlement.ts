#!/usr/bin/env node
/**
 * Test settlement using Gundagai R8 data (verified to contain all 5 target horses)
 */

// Gundagai R8 form card data (from manual scrape)
const gundagaiR8FormCard: Record<number, string> = {
  9: 'Rubi Air',
  11: 'Spirits Burn Deep',
  12: 'Ace Of Lace',
  16: 'A Book Of Days',
  17: 'Jannik'
};

// Gundagai R8 barrier results (from user's April 12 form)
// User said: "Rubi Air 3rd (PLACE), others LOSS"
// This means the 1st-2nd-3rd barriers in the race result were something like: [X, Y, 9]
// where 9 was Rubi Air's barrier
const gundagaiR8BarrierResults = [14, 2, 9]; // Example: barriers 14, 2, 9 were 1st, 2nd, 3rd

// Sample bets on Gundagai R8
const sampleBets = [
  { horse: 'Rubi Air', track: 'Gundagai', race: 8, betType: 'PLACE' },     // Should WIN (3rd place)
  { horse: 'Jannik', track: 'Gundagai', race: 8, betType: 'WIN' },        // Should LOSS
  { horse: 'A Book Of Days', track: 'Gundagai', race: 8, betType: 'PLACE' }, // Should LOSS
  { horse: 'Spirits Burn Deep', track: 'Gundagai', race: 8, betType: 'WIN' }, // Should LOSS
  { horse: 'Ace Of Lace', track: 'Gundagai', race: 8, betType: 'PLACE' },  // Should LOSS
];

function settleGundagaiTest() {
  console.log('🧪 Testing Gundagai R8 Settlement\n');

  console.log('Form Card (Barrier → Horse):');
  Object.entries(gundagaiR8FormCard).forEach(([barrier, horse]) => {
    console.log(`  ${barrier.padStart(2)}: ${horse}`);
  });

  console.log(`\nBarrier Results (1st, 2nd, 3rd): [${gundagaiR8BarrierResults.join(', ')}]`);
  console.log('Meaning:');
  const [b1st, b2nd, b3rd] = gundagaiR8BarrierResults;
  const h1st = gundagaiR8FormCard[b1st] || `Unknown (barrier ${b1st})`;
  const h2nd = gundagaiR8FormCard[b2nd] || `Unknown (barrier ${b2nd})`;
  const h3rd = gundagaiR8FormCard[b3rd] || `Unknown (barrier ${b3rd})`;
  console.log(`  1st: Barrier ${b1st} → ${h1st}`);
  console.log(`  2nd: Barrier ${b2nd} → ${h2nd}`);
  console.log(`  3rd: Barrier ${b3rd} → ${h3rd}`);

  console.log(`\nSettling ${sampleBets.length} sample bets:`);
  sampleBets.forEach((bet, idx) => {
    // Find barrier for this horse
    const betBarrier = Object.entries(gundagaiR8FormCard).find(([_, horse]) => horse === bet.horse)?.[0];

    if (!betBarrier) {
      console.log(`  ${idx+1}. ❌ ${bet.horse} - NOT FOUND IN FORM CARD`);
      return;
    }

    const barrier = parseInt(betBarrier);
    const isFinie = gundagaiR8BarrierResults.includes(barrier);
    const position = gundagaiR8BarrierResults.indexOf(barrier) + 1; // 1st, 2nd, or 3rd

    let result: 'WIN' | 'PLACE' | 'LOSS' = 'LOSS';
    if (position === 1 || (bet.betType === 'WIN' && position <= 1)) {
      result = 'WIN';
    } else if ((position === 2 || position === 3) && (bet.betType === 'PLACE' || bet.betType === 'WIN')) {
      result = position === 1 ? 'WIN' : 'PLACE';
    }

    const symbol = result === 'WIN' ? '🟢' : result === 'PLACE' ? '🟡' : '🔴';
    console.log(`  ${idx+1}. ${symbol} ${bet.horse.padEnd(18)} (B${barrier}) - ${bet.betType.padEnd(5)} → ${result} ${isFinie ? `(finished ${position === 1 ? '1st' : position === 2 ? '2nd' : '3rd'})` : '(DNF)'}`);
  });
}

settleGundagaiTest();
