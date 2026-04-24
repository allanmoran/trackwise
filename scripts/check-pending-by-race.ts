import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function check() {
  const races = ['Taree R1', 'Gosford R1', 'Geraldton R1', 'Cairns R1'];

  for (const raceLabel of races) {
    const [track, raceStr] = raceLabel.split(' R');
    const raceNum = parseInt(raceStr);

    const bets = await sql`
      SELECT id, horse, odds, stake, result
      FROM bets
      WHERE track = ${track} AND race_num = ${raceNum}
      ORDER BY result
    `;

    console.log(`\n${track} R${raceNum}: ${bets.length} total`);
    for (const bet of bets) {
      console.log(`  ${bet.result || 'PENDING'}: ${bet.horse}`);
    }
  }

  await sql.end();
}

check();
