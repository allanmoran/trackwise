#!/usr/bin/env node
/**
 * Comprehensive settlement script for 150 bets
 * - Loads actual race form cards from actual-races.json
 * - Matches horses with fuzzy matching
 * - Settles bets based on barrier results
 */

import fs from 'fs';

interface RaceData {
  url: string;
  horses: Record<number, string>;
  track: string;
  raceNum?: number;
}

interface BetSettle {
  betId: string;
  horse: string;
  track: string;
  race: number;
  betType: 'WIN' | 'PLACE';
  stake: number;
  odds: number;
  barrier?: number;
  finishPosition?: number;
  result: 'WIN' | 'PLACE' | 'LOSS';
  profit: number;
}

// Levenshtein distance for fuzzy matching
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

function main() {
  console.log('📊 Settlement Engine\n');

  // Check if actual-races.json exists
  if (!fs.existsSync('actual-races.json')) {
    console.log('⏳ Waiting for actual-races.json (form cards will be populated once scraper finishes)\n');
    console.log('Expected structure:');
    console.log(`[
  {
    "url": "https://...",
    "horses": {
      "09": "Rubi Air",
      "11": "Spirits Burn Deep",
      ...
    },
    "track": "Gundagai"
  },
  ...
]`);

    console.log('\nOnce actual-races.json is ready, run this script with barrier results.');
    console.log('Usage: npx tsx scripts/settle-all-bets.ts <barrier-results-file.json>');
    return;
  }

  const races = JSON.parse(fs.readFileSync('actual-races.json', 'utf-8')) as RaceData[];
  console.log(`Loaded ${races.length} race form cards`);

  // TODO: Load barrier results from user
  // TODO: Load bets from database
  // TODO: Settle each bet

  console.log('\n⏳ Awaiting:');
  console.log('  1. Barrier results for all 30 races');
  console.log('  2. List of 150 bets to settle');
  console.log('\nOnce both are available, settlement will be automatic.');
}

main();
