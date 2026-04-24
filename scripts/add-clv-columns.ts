import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function addColumns() {
  try {
    console.log('[db] Adding CLV columns to kelly_logs...');
    
    // Add CLV tracking columns
    await sql`
      ALTER TABLE kelly_logs 
      ADD COLUMN IF NOT EXISTS opening_odds DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS closing_odds DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS clv_percent DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS closing_odds_source VARCHAR(20)
    `;
    
    // Also add to bets table for tracking at placement
    await sql`
      ALTER TABLE bets
      ADD COLUMN IF NOT EXISTS opening_odds DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS closing_odds DECIMAL(6,2)
    `;
    
    console.log('[db] ✓ CLV columns added successfully');
    
    // Verify columns exist
    const cols = await sql.unsafe(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'kelly_logs' 
      ORDER BY column_name
    `);
    console.log('[db] Kelly_logs columns:', cols.map((c: any) => c.column_name).join(', '));
    
    await sql.end();
  } catch (err) {
    console.error('[db] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

addColumns();
