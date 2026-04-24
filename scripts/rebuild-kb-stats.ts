#!/usr/bin/env node
/**
 * Rebuild knowledge base statistics from kelly_logs
 * Updates jockey_stats, trainer_stats, and horse_stats tables
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '');

async function rebuildStats() {
  try {
    console.log('[KB Stats] Rebuilding jockey, trainer, and horse statistics...\n');

    // Clear existing stats
    console.log('Clearing old statistics...');
    await sql`TRUNCATE TABLE jockey_stats`;
    await sql`TRUNCATE TABLE trainer_stats`;
    await sql`TRUNCATE TABLE horse_stats`;

    // Get jockey stats from kelly_logs
    console.log('Building jockey statistics...');
    const jockeys = await sql`
      SELECT
        jockey,
        COUNT(*) as total_runs,
        COUNT(CASE WHEN actual_result = 'WIN' THEN 1 END) as total_wins,
        COUNT(CASE WHEN actual_result = 'PLACE' THEN 1 END) as total_places
      FROM kelly_logs
      WHERE jockey IS NOT NULL AND jockey != ''
      GROUP BY jockey
      ORDER BY total_runs DESC
    `;

    for (const j of jockeys) {
      await sql`
        INSERT INTO jockey_stats (jockey_name, total_runs, total_wins, total_places)
        VALUES (${j.jockey}, ${j.total_runs}, ${j.total_wins}, ${j.total_places})
      `;
    }
    console.log(`  ✓ Inserted ${jockeys.length} jockeys\n`);

    // Get trainer stats from kelly_logs
    console.log('Building trainer statistics...');
    const trainers = await sql`
      SELECT
        trainer,
        COUNT(*) as total_runs,
        COUNT(CASE WHEN actual_result = 'WIN' THEN 1 END) as total_wins,
        COUNT(CASE WHEN actual_result = 'PLACE' THEN 1 END) as total_places
      FROM kelly_logs
      WHERE trainer IS NOT NULL AND trainer != ''
      GROUP BY trainer
      ORDER BY total_runs DESC
    `;

    for (const t of trainers) {
      await sql`
        INSERT INTO trainer_stats (trainer_name, total_runs, total_wins, total_places)
        VALUES (${t.trainer}, ${t.total_runs}, ${t.total_wins}, ${t.total_places})
      `;
    }
    console.log(`  ✓ Inserted ${trainers.length} trainers\n`);

    // Get horse stats from kelly_logs
    console.log('Building horse statistics...');
    const horses = await sql`
      SELECT
        horse_name,
        track,
        COUNT(*) as total_runs,
        COUNT(CASE WHEN actual_result = 'WIN' THEN 1 END) as total_wins,
        COUNT(CASE WHEN actual_result = 'PLACE' THEN 1 END) as total_places
      FROM kelly_logs
      WHERE horse_name IS NOT NULL AND horse_name != ''
      GROUP BY horse_name, track
      ORDER BY total_runs DESC
    `;

    for (const h of horses) {
      await sql`
        INSERT INTO horse_stats (horse_name, track, total_runs, total_wins, total_places)
        VALUES (${h.horse_name}, ${h.track}, ${h.total_runs}, ${h.total_wins}, ${h.total_places})
      `;
    }
    console.log(`  ✓ Inserted ${horses.length} horses\n`);

    console.log('✅ KB statistics rebuilt successfully!');
    console.log(`   Total: ${jockeys.length} jockeys, ${trainers.length} trainers, ${horses.length} horses`);
  } catch (err) {
    console.error('[Error]', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

rebuildStats();
