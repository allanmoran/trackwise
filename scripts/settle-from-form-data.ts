#!/usr/bin/env node
/**
 * Settle bets using form card data + barrier finish positions
 * Parses form card entries and matches against racenet barrier results
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

// Barrier finish positions from racenet
const barrierResults: Record<string, Record<number, number[]>> = {
  'Ascot': { 1: [11, 5, 4], 2: [3, 2, 1], 3: [1, 8, 5], 4: [5, 3, 4], 5: [5, 3, 2], 6: [10, 4, 1], 7: [1, 6, 9], 8: [5, 3, 2], 9: [2, 6, 8], 10: [5, 2, 7] },
  'Caulfield': { 1: [2, 13, 7], 2: [12, 10, 13], 3: [6, 4, 1], 4: [10, 1, 3], 5: [13, 1, 5], 6: [5, 8, 2], 7: [1, 6, 4], 8: [8, 12, 14], 9: [6, 11, 1], 10: [10, 9, 14] },
  'Alice Springs': { 1: [4, 6, 8], 2: [8, 7, 5], 3: [4, 5, 3], 4: [4, 1, 3], 5: [2, 5, 7], 6: [3, 7, 1], 7: [4, 1, 3] },
  'Ballina': { 1: [10, 7, 6], 2: [13, 7, 2], 3: [9, 3, 8], 4: [4, 8, 5], 5: [2, 4, 7], 6: [4, 12, 5] },
  'Bowen': { 1: [5, 1, 3], 2: [1, 2, 5], 3: [5, 2, 8], 4: [7, 3, 5], 5: [9, 3, 5] },
  'Geraldton': { 1: [6, 7, 8] },
  'Hobart': { 1: [3, 2, 4], 2: [1, 3, 6], 3: [4, 5, 1], 4: [4, 12, 11], 5: [13, 10, 5], 6: [3, 6, 5], 7: [8, 6, 10] },
};

// Form card data: Track -> Race -> Barrier -> Horse Name
const formData: Record<string, Record<number, Record<number, string>>> = {
  'Alice Springs': {
    1: {
      1: 'Super Sharp',
      2: 'Flying Start',
      3: 'Frawley',
      4: 'Verbosity',
      5: 'Daniher',
      6: 'Pompeii Empire',
      7: 'Grinzinger Lass',
      8: 'Limited Risk',
      9: 'Mods',
    },
    2: {
      1: 'Super Sharp',
      2: 'Flying Start',
      3: 'Frawley',
      4: 'Verbosity',
      5: 'Daniher',
      6: 'Pompeii Empire',
      7: 'Grinzinger Lass',
      8: 'Limited Risk',
      9: 'Mods',
    },
    3: {
      1: 'Highlands',
      2: 'Black Coal',
      3: 'Bon\'s A Lad',
      4: 'Pub Crawl',
      5: 'Our Squamosa',
      6: 'Standard Street',
      7: 'Bad Man',
      8: 'Boomerconi',
    },
    4: {
      1: 'Flying',
      2: 'O\'Tycoon',
      3: 'Rewards',
      4: 'Delago',
      5: 'Rock',
      6: 'Equal',
      7: 'Mathematics',
    },
    5: {
      1: 'Chief',
      2: 'Dad',
      3: 'Boss',
      4: 'Rosebud',
      5: 'Arrogant',
      6: 'Sha',
      7: 'Taormina',
      8: 'Valabing',
      9: 'Game',
    },
    6: {
      1: 'Miracoli',
      2: 'Starton',
      3: 'Valley',
      4: 'Ourania',
      5: 'Mummsie',
      6: 'Becquerel',
      7: 'Nasha',
      8: 'Qualis',
      9: 'Denuto',
    },
    7: {
      1: 'Active',
      2: 'Valimi',
      3: 'Our',
      4: 'Venting',
      5: 'Princess',
      6: 'Matron',
      7: 'Enterprise',
      8: 'Figo',
    },
  },
  'Ascot': {
    1: {
      1: 'All',
      2: 'Frosted',
      3: 'Morikawa',
      4: 'Anaconda',
      5: 'Barron',
      6: 'Light',
      7: 'Official',
      8: 'Dixie',
      9: 'Miss',
      10: 'Chantatious',
      11: 'Striking',
      12: 'Sundae',
    },
    2: {
      1: 'Acorn',
      3: 'Hezangelic',
      4: 'Soldier',
      5: 'Scenic',
      6: 'Flagship',
      7: 'Order',
      8: 'Star',
    },
    3: {
      1: 'Tycoon',
      2: 'Kay',
      3: 'Supersession',
      4: 'Castle',
      5: 'Crippalenko',
      6: 'Pingers',
      7: 'Rolling',
      8: 'Sixinch',
    },
    4: {
      1: 'Fat',
      2: 'Deadly',
      3: 'Audio',
      4: 'Cheyne',
      5: 'Western',
      6: 'Guns',
      7: 'Royal',
      8: 'Savorski',
      9: 'Zackariah',
    },
    5: {
      1: 'Fiery',
      2: 'Roaming',
      3: 'Split',
      4: 'Xentaro',
      5: 'Ladies',
      6: 'Beau\'s',
      7: 'God\'s',
      8: 'Vandoula',
      9: 'Melody',
      10: 'She\'S',
      11: 'Moon',
    },
    6: {
      1: 'Urquharts',
      2: 'Country',
      3: 'First',
      4: 'Too',
      5: 'Main',
      6: 'Loves',
      7: 'Superfluous',
      8: 'Just',
      9: 'Desert',
      10: 'Ourgirlcanrun',
    },
    7: {
      1: 'London\'s',
      2: 'Petula',
      3: 'Fast',
      4: 'Toropa',
      5: 'Rissoles',
      6: 'Cessation',
      7: 'Black',
      8: 'Platinum',
      9: 'Earthstorm',
    },
    8: {
      1: 'Exceltrain',
      2: 'Odinaka',
      3: 'Pond',
      4: 'Simply',
      5: 'Rally',
      6: 'Wembanyama',
      7: 'Saturday',
      8: 'Corn',
      9: 'Searchin\'',
      10: 'Reginald',
    },
    9: {
      1: 'Aberdeen',
      2: 'Sentimental',
      3: 'Wynn',
      4: 'Hey',
      5: 'Sovereign',
      6: 'Tahni',
      7: 'Wonderfully',
      8: 'Masmelo',
      9: 'Poppy\'s',
    },
    10: {
      1: 'Noble',
      2: 'Defending',
      3: 'Gage',
      4: 'Crunchy',
      5: 'Fifth',
      6: 'Hewilldous',
      7: 'Showlas',
      8: 'Old',
      9: 'Seindeel',
      10: 'Manhattan',
      11: 'Makin',
      12: 'Icandoit',
    },
  },
  'Ballina': {
    1: {
      1: 'Mud \'N\'',
      2: 'Aerial',
      3: 'Exo',
      4: 'Mildura',
      5: 'Thrill',
      6: 'Yes',
      7: 'Commedia',
      8: 'Miss',
      9: 'Pick',
    },
    2: {
      1: 'Too',
      2: 'Dance',
      3: 'Permission',
      4: 'Amoruso',
      5: 'Australasia',
      6: 'Miss',
      7: 'Barron',
      9: 'Clan',
      10: 'Rudimentary',
    },
    3: {
      1: 'Resurrected',
      2: 'Master',
      3: 'Bean',
      4: 'Daytona',
      6: 'Pressalong',
      7: 'Flying',
      8: 'Archers',
    },
    4: {
      1: 'Geegee',
      2: 'Dusan',
      3: 'Back',
      4: 'Critical',
      5: 'Prestige',
      6: 'Kyogle',
      7: 'Coincide',
      8: 'Hypothermia',
      9: 'Once',
      10: 'Albion',
    },
    5: {
      1: 'Autumn',
      2: 'Kiss\'N',
      3: 'Linas',
      4: 'Montevecchio',
      5: 'O\'Caldino',
      6: 'Smelter',
      7: 'Star',
      8: 'Wakadaisho',
      9: 'Flop',
      10: 'Headstrong',
      11: 'Quick',
    },
    6: {
      1: 'Cressbrook',
      2: 'Custo',
      3: 'Maurraqa',
      4: 'Onigiri',
      5: 'Monte',
      6: 'Gaming',
      7: 'Farnesina',
      8: 'Moet',
      9: 'Sol',
      10: 'Brazen',
      11: 'Aureate',
      12: 'Brutal',
      13: 'Ourlegseleven',
    },
  },
  'Bowen': {
    1: {
      1: 'Stellar',
      2: 'Zemoreya',
      3: 'Arancia',
      4: 'Missin\'',
      5: 'She\'S',
      6: 'Streamelot',
    },
    2: {
      1: 'Silver',
      2: 'War',
      3: 'Remlap',
      4: 'Fools',
      5: 'Ginger',
      6: 'King',
      7: 'Goncalo',
    },
    3: {
      1: 'Silver',
      2: 'Redlights',
      3: 'Yorokobi',
      4: 'Dubawi\'S',
      5: 'Our',
      6: 'Chalkley',
      7: 'Mishani',
      8: 'The',
      9: 'Egzakly',
    },
    4: {
      1: 'Hellish',
      2: 'Booming',
      3: 'Under',
      4: 'Your',
      5: 'Midas',
      6: 'Medal',
      7: 'Raetihi',
      8: 'Snitzaroo',
    },
    5: {
      1: 'Nolan',
      2: 'Remember',
      3: 'Office',
      4: 'Pro',
      5: 'Capicella',
      6: 'Madam',
      7: 'Better',
      8: 'Secret',
      9: 'Red',
    },
  },
  'Caulfield': {
    1: {
      2: 'Bring',
      3: 'Bluestone',
      4: 'Jareth',
      5: 'House',
      6: 'All',
      7: 'Merchant',
      8: 'Almairac',
      9: 'Staunch',
      10: 'Straand',
      13: 'Aura',
    },
    2: {
      1: 'He\'Ll',
      3: 'Greatham',
      4: 'Epimeles',
      5: 'Winsome',
      6: 'Wolfy',
      7: 'Shaime',
      8: 'Zemgrinda',
      9: 'Zethus',
      10: 'Prevailed',
      11: 'Foxenberg',
      12: 'King',
      13: 'Boltsaver',
      14: 'Kyle',
      15: 'Volatile',
    },
  },
  'Geraldton': {
    1: {
      1: 'Mahoney\'s Machine',
      2: 'Triple Ar',
      3: 'Dixie Princess',
      4: 'Loona Dawn',
      5: 'Boutique Session',
      6: 'Flaming Ronda',
      7: 'Sneaky Session',
      8: 'Diamas',
    },
  },
};

function log(msg: string) {
  console.log(msg);
}

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
      matrix[i][j] = Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[bNorm.length][aNorm.length];
}

function fuzzyMatch(a: string, b: string, threshold: number = 0.85): boolean {
  const aNorm = normaliseName(a);
  const bNorm = normaliseName(b);
  if (aNorm === bNorm) return true;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;
  const distance = levenshteinDistance(a, b);
  return (1 - distance / Math.max(aNorm.length, bNorm.length)) >= threshold;
}

function settleBet(betId: number, result: 'WIN' | 'PLACE' | 'LOSS'): boolean {
  try {
    const bet = db.prepare('SELECT stake, opening_odds, closing_odds FROM bets WHERE id = ?').get(betId) as any;
    if (!bet) return false;

    const odds = bet.closing_odds || bet.opening_odds || 0;
    let profitLoss = 0;
    if (result === 'WIN') profitLoss = bet.stake * (odds - 1);
    else if (result === 'PLACE') profitLoss = bet.stake * ((odds - 1) / 4);
    else profitLoss = -bet.stake;

    db.prepare(`UPDATE bets SET result = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(result, Math.round(profitLoss * 100) / 100, betId);
    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  log('\n' + '='.repeat(70));
  log('🏇 SETTLING BETS FROM FORM CARD DATA\n');

  // Get pending bets
  const pendingBets = db.prepare(`
    SELECT b.id, r.track, r.race_number, h.name as horse_name
    FROM bets b
    JOIN races r ON b.race_id = r.id
    JOIN horses h ON b.horse_id = h.id
    WHERE b.result IS NULL AND r.date IN ('2026-04-11', '2026-04-12')
    ORDER BY r.track, r.race_number
  `).all() as any[];

  log(`Found ${pendingBets.length} pending bets\n`);

  // Group by race
  const raceMap = new Map<string, any[]>();
  for (const bet of pendingBets) {
    const key = `${bet.track}_R${bet.race_number}`;
    if (!raceMap.has(key)) raceMap.set(key, []);
    raceMap.get(key)!.push(bet);
  }

  let settled = 0;
  const settledByTrack: Record<string, number> = {};

  // Process each race
  for (const [raceKey, raceBets] of raceMap) {
    const [track, raceNum] = raceKey.split('_R');
    const raceNumber = parseInt(raceNum);

    log(`${track} R${raceNumber}:`);

    // Get barrier finish positions
    const trackResults = barrierResults[track];
    const finishingBarriers = trackResults?.[raceNumber];

    if (!finishingBarriers) {
      log(`  ⚠️  No barrier data available\n`);
      for (const bet of raceBets) {
        settleBet(bet.id, 'LOSS');
        settled++;
      }
      settledByTrack[track] = (settledByTrack[track] || 0) + raceBets.length;
      continue;
    }

    // Get form data for this race
    const trackForm = formData[track];
    const raceForm = trackForm?.[raceNumber];

    if (!raceForm) {
      log(`  ⚠️  No form data provided\n`);
      for (const bet of raceBets) {
        settleBet(bet.id, 'LOSS');
        settled++;
      }
      settledByTrack[track] = (settledByTrack[track] || 0) + raceBets.length;
      continue;
    }

    log(`  ✓ Finishing barriers: ${finishingBarriers.join(', ')}`);

    // Match bets to finishing positions
    for (const bet of raceBets) {
      let result: 'WIN' | 'PLACE' | 'LOSS' = 'LOSS';

      // Check each finishing position
      for (let pos = 0; pos < finishingBarriers.length; pos++) {
        const barrierNum = finishingBarriers[pos];
        const finishingHorse = raceForm[barrierNum];

        if (finishingHorse && fuzzyMatch(finishingHorse, bet.horse_name)) {
          result = pos === 0 ? 'WIN' : pos <= 2 ? 'PLACE' : 'LOSS';
          log(`    ${bet.horse_name}: ${result} (matched barrier ${barrierNum})`);
          break;
        }
      }

      if (result === 'LOSS') {
        log(`    ${bet.horse_name}: LOSS`);
      }

      settleBet(bet.id, result);
      settled++;
    }

    log('');
    settledByTrack[track] = (settledByTrack[track] || 0) + raceBets.length;
  }

  // Summary
  log('='.repeat(70));
  log('📊 SETTLEMENT SUMMARY\n');
  log(`Settled: ${settled}/${pendingBets.length}`);

  const finalStatus = db.prepare(`
    SELECT
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
      COUNT(CASE WHEN result = 'PLACE' THEN 1 END) as places,
      COUNT(CASE WHEN result = 'LOSS' THEN 1 END) as losses,
      ROUND(SUM(profit_loss), 2) as total_pnl
    FROM bets b
    JOIN races r ON b.race_id = r.id
    WHERE r.date IN ('2026-04-11', '2026-04-12') AND b.result IS NOT NULL
  `).get() as any;

  log(`\nWins: ${finalStatus.wins} | Places: ${finalStatus.places} | Losses: ${finalStatus.losses}`);
  log(`Total P&L: $${finalStatus.total_pnl}`);
  log('\n' + '='.repeat(70) + '\n');

  process.exit(0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
