import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function update() {
  console.log('\n📍 Gosford R1 - Updating Results\n');

  const results: Record<string, 'WIN' | 'PLACE' | 'LOSS'> = {
    'mortlake': 'WIN',
    'rita': 'PLACE',
    'pharoah': 'PLACE',
  };

  // Get Gosford R1 bets
  const bets = await sql`
    SELECT id, horse
    FROM bets
    WHERE track = 'Gosford' AND race_num = 1 AND result IS NULL
  `;

  console.log(`Found ${bets.length} pending bets for Gosford R1:\n`);

  for (const bet of bets) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    let result: 'WIN' | 'PLACE' | 'LOSS' | null = null;

    // Match to results
    for (const [resultName, placing] of Object.entries(results)) {
      if (norm(bet.horse).includes(norm(resultName)) || norm(resultName).includes(norm(bet.horse))) {
        result = placing;
        break;
      }
    }

    result = result || 'LOSS';

    await sql`
      UPDATE bets
      SET result = ${result}
      WHERE id = ${bet.id}
    `;

    console.log(`  ✅ ${bet.horse}: ${result}`);
  }

  console.log('\n');
  await sql.end();
}

update();
