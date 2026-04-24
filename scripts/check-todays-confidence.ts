import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

(async () => {
  const today = new Date().toISOString().split('T')[0];
  const bets = await sql`
    SELECT id, horse, confidence, odds, created_at 
    FROM bets 
    WHERE created_at::date = ${today}
    LIMIT 3
  `;
  
  console.log('Today\'s bets:');
  for (const b of bets) {
    console.log(`${b.horse}: confidence=${b.confidence}, odds=${b.odds}`);
  }
  
  await sql.end();
})();
