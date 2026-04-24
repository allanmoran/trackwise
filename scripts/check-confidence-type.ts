import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

(async () => {
  const cols = await sql.unsafe(`
    SELECT column_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns 
    WHERE table_name = 'bets' AND column_name = 'confidence'
  `);
  console.log('Column definition:', JSON.stringify(cols, null, 2));
  
  const sample = await sql`SELECT id, horse, confidence, odds FROM bets LIMIT 1`;
  console.log('\nSample bet:', JSON.stringify(sample, null, 2));
  
  await sql.end();
})();
