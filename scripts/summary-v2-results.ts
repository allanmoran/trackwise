import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function summarize() {
  const today = new Date().toISOString().split('T')[0];
  
  const bets = await sql`
    SELECT track, race_num, horse, result, odds::numeric, stake::numeric
    FROM bets
    WHERE created_at::date = ${today}
    ORDER BY track, race_num
  `;

  let totalStake = 0;
  let totalWins = 0;
  let totalPlaces = 0;
  let totalLosses = 0;
  let totalPnL = 0;

  const byRace = new Map();
  for (const b of bets) {
    const key = `${b.track} R${b.race_num}`;
    if (!byRace.has(key)) byRace.set(key, []);
    byRace.get(key).push(b);

    totalStake += Number(b.stake);
    
    if (b.result === 'WIN') {
      totalWins++;
      totalPnL += Number(b.stake) * (Number(b.odds) - 1);
    } else if (b.result === 'PLACE') {
      totalPlaces++;
      totalPnL += Number(b.stake) * ((Number(b.odds) - 1) * 0.25);
    } else {
      totalLosses++;
      totalPnL -= Number(b.stake);
    }
  }

  console.log('\n🏇 V2 STRATEGY RESULTS - April 10, 2026\n');
  console.log('='.repeat(60));
  console.log(`Total Races: ${byRace.size}`);
  console.log(`Total Bets: ${bets.length}`);
  console.log(`Total Stake: $${totalStake.toFixed(2)}`);
  console.log('');
  console.log(`Wins: ${totalWins}`);
  console.log(`Places: ${totalPlaces}`);
  console.log(`Losses: ${totalLosses}`);
  console.log('');
  console.log(`Total P&L: $${totalPnL.toFixed(2)}`);
  console.log(`ROI: ${((totalPnL / totalStake) * 100).toFixed(2)}%`);
  console.log('='.repeat(60));
  
  console.log('\n📊 Breakdown by Race:\n');
  for (const [race, raceBets] of byRace) {
    let raceWins = 0, racePlaces = 0, raceLosses = 0, racePnL = 0;
    for (const b of raceBets) {
      if (b.result === 'WIN') {
        raceWins++;
        racePnL += Number(b.stake) * (Number(b.odds) - 1);
      } else if (b.result === 'PLACE') {
        racePlaces++;
        racePnL += Number(b.stake) * ((Number(b.odds) - 1) * 0.25);
      } else {
        raceLosses++;
        racePnL -= Number(b.stake);
      }
    }
    const status = racePnL >= 0 ? '✅' : '❌';
    console.log(`${status} ${race} | ${raceWins}W ${racePlaces}P ${raceLosses}L | P&L: $${racePnL.toFixed(2)}`);
  }
  
  await sql.end();
}

summarize().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
