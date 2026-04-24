#!/usr/bin/env node
/**
 * Populate Knowledge Base by logging ALL runners from today's races
 * This aggressively builds the KB for better model validation
 * Usage: npx ts-node scripts/populate-kb.ts
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

import postgres from 'postgres';
import { getFormKnowledgeBase, scoreRunnerFromKB } from './race-entry-integration.js';

const sql = postgres(process.env.DATABASE_URL || '');

async function populateKB() {
  try {
    console.log(`[KB] Populating KB from all manual_races...`);

    // Get ALL races
    const races = await sql`
      SELECT date, track, race_num, race_time, runners
      FROM manual_races
      ORDER BY date DESC, race_num
    `;

    if (races.length === 0) {
      console.log('[KB] No races found for today');
      process.exit(0);
    }

    // Get KB stats
    const kb = await getFormKnowledgeBase(sql);
    if (!kb) {
      console.error('[KB] Failed to build knowledge base');
      process.exit(1);
    }

    let logged = 0;

    // Log EVERY runner from every race
    for (const race of races) {
      const runners = typeof race.runners === 'string' ? JSON.parse(race.runners) : race.runners;

      for (const runner of runners || []) {
        const { score } = scoreRunnerFromKB(runner, kb);

        // Calculate predicted odds from confidence
        const confidence = score;
        const predictedOdds = Math.max(1.01, 1 / (confidence / 100));

        // For population, we don't have closing odds yet
        // They'll be filled in when the user enters them
        await sql`
          INSERT INTO kelly_logs (date, track, race_num, horse_name, jockey, trainer,
                                 predicted_odds, kelly_stake, confidence)
          VALUES (${race.date}, ${race.track}, ${race.race_num}, ${runner.name},
                  ${runner.jockey || 'Unknown'}, ${runner.trainer || 'Unknown'},
                  ${predictedOdds}, 0, ${confidence})
        `;

        logged++;
      }
    }

    console.log(`[KB] ✓ Logged ${logged} runners from ${races.length} races`);
    console.log(`[KB] KB now contains: ${kb.totalRaces} races, ${Object.keys(kb.jockeyStats).length} jockeys, ${Object.keys(kb.trainerStats).length} trainers`);

    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('[KB] Error:', err);
    process.exit(1);
  }
}

populateKB();
