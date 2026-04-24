import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function analyze() {
  const today = new Date().toISOString().split('T')[0];
  
  const bets = await sql<any[]>`
    SELECT 
      track, race_num, horse, result, 
      odds::numeric, stake::numeric,
      confidence::numeric, speed_rating::numeric
    FROM bets
    WHERE created_at::date = ${today}
    ORDER BY odds::numeric DESC
  `;

  console.log('\n🔍 V2 STRATEGY FAILURE ANALYSIS\n');
  console.log('='.repeat(80));
  
  const winners = bets.filter(b => b.result === 'WIN' || b.result === 'PLACE');
  const losers = bets.filter(b => b.result === 'LOSS');
  
  console.log(`\n✅ WINNERS (${winners.length}):`);
  for (const b of winners) {
    const conf = b.confidence ? `${(b.confidence * 100).toFixed(0)}%` : 'N/A';
    const speed = b.speed_rating ? `${(b.speed_rating).toFixed(0)}` : 'N/A';
    console.log(`  ${b.horse} @ $${b.odds} | ${b.track} R${b.race_num} | Conf: ${conf} | Speed: ${speed}`);
  }
  
  console.log(`\n❌ LOSERS (${losers.length}):`);
  
  // Group by confidence/odds to find patterns
  const byOdds = new Map();
  for (const b of losers) {
    const oddsRange = `$${Math.floor(b.odds)}-${Math.floor(b.odds) + 1}`;
    if (!byOdds.has(oddsRange)) byOdds.set(oddsRange, []);
    byOdds.get(oddsRange).push(b);
  }
  
  for (const [odds, horses] of byOdds) {
    console.log(`\n  Odds ${odds}: ${horses.length} losses`);
    for (const h of horses) {
      const conf = h.confidence ? `${(h.confidence * 100).toFixed(0)}%` : 'N/A';
      const speed = h.speed_rating ? `${(h.speed_rating).toFixed(0)}` : 'N/A';
      console.log(`    - ${h.horse} @ $${h.odds} | Conf: ${conf} | Speed: ${speed}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 STATS:\n');
  const avgOdds = bets.reduce((s, b) => s + Number(b.odds), 0) / bets.length;
  const avgConf = bets.filter(b => b.confidence).reduce((s, b) => s + Number(b.confidence), 0) / bets.filter(b => b.confidence).length;
  console.log(`Average odds: $${avgOdds.toFixed(2)}`);
  console.log(`Average confidence: ${(avgConf * 100).toFixed(0)}%`);
  console.log(`Max odds: $${Math.max(...bets.map(b => Number(b.odds))).toFixed(2)}`);
  console.log(`Min odds: $${Math.min(...bets.map(b => Number(b.odds))).toFixed(2)}`);
  
  await sql.end();
}

analyze().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
