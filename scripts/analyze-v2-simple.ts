import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function analyze() {
  const today = new Date().toISOString().split('T')[0];
  
  const bets = await sql`
    SELECT 
      track, race_num, horse, result, 
      odds::numeric, stake::numeric,
      confidence::numeric
    FROM bets
    WHERE created_at::date = ${today}
    ORDER BY odds::numeric DESC
  `;

  console.log('\n🔍 V2 STRATEGY FAILURE ANALYSIS\n');
  console.log('='.repeat(80));
  
  const winners = bets.filter((b: any) => b.result === 'WIN' || b.result === 'PLACE');
  const losers = bets.filter((b: any) => b.result === 'LOSS');
  
  console.log(`\n✅ WINNERS (${winners.length}):`);
  for (const b of winners) {
    const conf = b.confidence ? `${(b.confidence * 100).toFixed(0)}%` : 'N/A';
    console.log(`  ${b.horse} @ $${b.odds} | ${b.track} R${b.race_num} | Confidence: ${conf}`);
  }
  
  console.log(`\n❌ LOSERS (${losers.length}):`);
  
  const byOdds = new Map();
  for (const b of losers) {
    const oddsRange = `$${Math.floor(Number(b.odds))}-${Math.floor(Number(b.odds)) + 1}`;
    if (!byOdds.has(oddsRange)) byOdds.set(oddsRange, []);
    byOdds.get(oddsRange).push(b);
  }
  
  for (const [odds, horses] of byOdds) {
    console.log(`\n  Odds ${odds}: ${horses.length} losses`);
    for (const h of horses) {
      const conf = h.confidence ? `${(Number(h.confidence) * 100).toFixed(0)}%` : 'N/A';
      console.log(`    - ${h.horse} @ $${h.odds} | Confidence: ${conf}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 STATS:\n');
  const avgOdds = bets.reduce((s: number, b: any) => s + Number(b.odds), 0) / bets.length;
  const confBets = bets.filter((b: any) => b.confidence);
  const avgConf = confBets.reduce((s: number, b: any) => s + Number(b.confidence), 0) / confBets.length;
  console.log(`Total bets: ${bets.length}`);
  console.log(`Average odds: $${avgOdds.toFixed(2)}`);
  console.log(`Average confidence: ${(avgConf * 100).toFixed(0)}%`);
  console.log(`Max odds: $${Math.max(...bets.map((b: any) => Number(b.odds))).toFixed(2)}`);
  console.log(`Min odds: $${Math.min(...bets.map((b: any) => Number(b.odds))).toFixed(2)}`);
  
  await sql.end();
}

analyze().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
