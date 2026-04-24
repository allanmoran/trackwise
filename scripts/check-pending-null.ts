import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function checkPending() {
  const today = new Date().toISOString().split('T')[0];
  
  const pending = await sql`
    SELECT track, race_num, horse, result
    FROM bets
    WHERE result IS NULL AND created_at::date = ${today}
    ORDER BY track, race_num
  `;

  console.log(`\n📍 Pending bets (${pending.length} total):\n`);
  if (pending.length === 0) {
    console.log('✅ All bets have results!\n');
  } else {
    const byRace = new Map();
    for (const p of pending) {
      const key = `${p.track} R${p.race_num}`;
      if (!byRace.has(key)) byRace.set(key, []);
      byRace.get(key).push(p);
    }
    
    for (const [race, bets] of byRace) {
      console.log(`${race}: ${bets.length} bets`);
      for (const b of bets) {
        console.log(`  - ${b.horse}`);
      }
    }
  }
  
  await sql.end();
}

checkPending().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
