/**
 * scripts/form-history.ts
 *
 * Accumulates form data and performance history over time.
 * Builds a knowledge base of:
 * - Individual horse performance by track/distance
 * - Jockey win rates and consistency
 * - Trainer win rates and specializations
 * - Speed ratings trends
 * - Barrier effectiveness
 *
 * This data informs long-term betting strategy refinement.
 */

import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '', {
  idle_timeout: 30,
  max_lifetime: 60 * 30,
  prepare: false,
});

// ── Initialize form history tables ──────────────────────────────────────────
export async function initFormHistoryTables() {
  try {
    // Form entries - historical record of every horse in every race we've recorded
    await sql`
      CREATE TABLE IF NOT EXISTS form_history (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        track TEXT NOT NULL,
        race_num INTEGER NOT NULL,
        horse_name TEXT NOT NULL,
        barrier INTEGER,
        weight DECIMAL(5, 2),
        jockey_name TEXT,
        trainer_name TEXT,
        odds DECIMAL(10, 2),
        speed_rating DECIMAL(5, 2),
        class_rating DECIMAL(5, 2),
        form_score INTEGER,
        result TEXT,
        pl DECIMAL(10, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, track, race_num, horse_name)
      );
    `;

    // Jockey cumulative stats
    await sql`
      CREATE TABLE IF NOT EXISTS jockey_performance (
        jockey_name TEXT PRIMARY KEY,
        total_rides INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        places INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        win_pct DECIMAL(5, 2) DEFAULT 0,
        avg_odds DECIMAL(10, 2),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Trainer cumulative stats
    await sql`
      CREATE TABLE IF NOT EXISTS trainer_performance (
        trainer_name TEXT PRIMARY KEY,
        total_rides INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        places INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        win_pct DECIMAL(5, 2) DEFAULT 0,
        avg_odds DECIMAL(10, 2),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Horse-specific records (track/distance performance)
    await sql`
      CREATE TABLE IF NOT EXISTS horse_track_performance (
        horse_name TEXT NOT NULL,
        track TEXT NOT NULL,
        distance_range TEXT,
        total_runs INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        places INTEGER DEFAULT 0,
        avg_odds DECIMAL(10, 2),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (horse_name, track)
      );
    `;

    // Daily horse ratings for trend analysis
    await sql`
      CREATE TABLE IF NOT EXISTS horse_speed_trends (
        horse_name TEXT NOT NULL,
        date TEXT NOT NULL,
        speed_rating DECIMAL(5, 2),
        class_rating DECIMAL(5, 2),
        track TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (horse_name, date)
      );
    `;

    console.log('[form-history] ✓ Form history tables initialized');
  } catch (err) {
    console.error('[form-history] Failed to initialize tables:', err);
    throw err;
  }
}

// ── Record form entry from a race ───────────────────────────────────────────
export async function recordFormEntry(entry: {
  date: string;
  track: string;
  raceNum: number;
  horseName: string;
  barrier?: number;
  weight?: number;
  jockeyName?: string;
  trainerName?: string;
  odds: number;
  speedRating?: number;
  classRating?: number;
  formScore?: number;
  result?: 'WIN' | 'PLACE' | 'LOSS';
  pl?: number;
}) {
  try {
    await sql`
      INSERT INTO form_history (
        date, track, race_num, horse_name, barrier, weight,
        jockey_name, trainer_name, odds, speed_rating, class_rating,
        form_score, result, pl
      ) VALUES (
        ${entry.date}, ${entry.track}, ${entry.raceNum}, ${entry.horseName},
        ${entry.barrier || null}, ${entry.weight || null},
        ${entry.jockeyName || null}, ${entry.trainerName || null},
        ${entry.odds}, ${entry.speedRating || null}, ${entry.classRating || null},
        ${entry.formScore || null}, ${entry.result || null}, ${entry.pl || null}
      )
      ON CONFLICT (date, track, race_num, horse_name) DO UPDATE SET
        barrier = ${entry.barrier || null},
        weight = ${entry.weight || null},
        jockey_name = ${entry.jockeyName || null},
        trainer_name = ${entry.trainerName || null},
        odds = ${entry.odds},
        speed_rating = ${entry.speedRating || null},
        class_rating = ${entry.classRating || null},
        form_score = ${entry.formScore || null},
        result = ${entry.result || null},
        pl = ${entry.pl || null}
    `;
  } catch (err) {
    console.error('[form-history] Failed to record form entry:', err);
  }
}

// ── Update jockey performance ───────────────────────────────────────────────
export async function updateJockeyStats(jockeyName: string, result: 'WIN' | 'PLACE' | 'LOSS', odds: number) {
  try {
    const existing = await sql`SELECT * FROM jockey_performance WHERE jockey_name = ${jockeyName}`;

    if (existing.length === 0) {
      // First entry for this jockey
      const wins = result === 'WIN' ? 1 : 0;
      const places = result === 'PLACE' ? 1 : 0;
      const losses = result === 'LOSS' ? 1 : 0;
      const winPct = (wins / 1) * 100;

      await sql`
        INSERT INTO jockey_performance (
          jockey_name, total_rides, wins, places, losses, win_pct, avg_odds
        ) VALUES (${jockeyName}, 1, ${wins}, ${places}, ${losses}, ${winPct}, ${odds})
      `;
    } else {
      // Update existing record
      const j = existing[0];
      const wins = j.wins + (result === 'WIN' ? 1 : 0);
      const places = j.places + (result === 'PLACE' ? 1 : 0);
      const losses = j.losses + (result === 'LOSS' ? 1 : 0);
      const total = j.total_rides + 1;
      const winPct = (wins / total) * 100;
      const avgOdds = ((j.avg_odds || 0) * j.total_rides + odds) / total;

      await sql`
        UPDATE jockey_performance
        SET
          total_rides = ${total},
          wins = ${wins},
          places = ${places},
          losses = ${losses},
          win_pct = ${parseFloat(winPct.toFixed(2))},
          avg_odds = ${parseFloat(avgOdds.toFixed(2))},
          updated_at = now()
        WHERE jockey_name = ${jockeyName}
      `;
    }
  } catch (err) {
    console.error('[form-history] Failed to update jockey stats:', err);
  }
}

// ── Update trainer performance ──────────────────────────────────────────────
export async function updateTrainerStats(trainerName: string, result: 'WIN' | 'PLACE' | 'LOSS', odds: number) {
  try {
    const existing = await sql`SELECT * FROM trainer_performance WHERE trainer_name = ${trainerName}`;

    if (existing.length === 0) {
      const wins = result === 'WIN' ? 1 : 0;
      const places = result === 'PLACE' ? 1 : 0;
      const losses = result === 'LOSS' ? 1 : 0;
      const winPct = (wins / 1) * 100;

      await sql`
        INSERT INTO trainer_performance (
          trainer_name, total_rides, wins, places, losses, win_pct, avg_odds
        ) VALUES (${trainerName}, 1, ${wins}, ${places}, ${losses}, ${winPct}, ${odds})
      `;
    } else {
      const t = existing[0];
      const wins = t.wins + (result === 'WIN' ? 1 : 0);
      const places = t.places + (result === 'PLACE' ? 1 : 0);
      const losses = t.losses + (result === 'LOSS' ? 1 : 0);
      const total = t.total_rides + 1;
      const winPct = (wins / total) * 100;
      const avgOdds = ((t.avg_odds || 0) * t.total_rides + odds) / total;

      await sql`
        UPDATE trainer_performance
        SET
          total_rides = ${total},
          wins = ${wins},
          places = ${places},
          losses = ${losses},
          win_pct = ${parseFloat(winPct.toFixed(2))},
          avg_odds = ${parseFloat(avgOdds.toFixed(2))},
          updated_at = now()
        WHERE trainer_name = ${trainerName}
      `;
    }
  } catch (err) {
    console.error('[form-history] Failed to update trainer stats:', err);
  }
}

// ── Close database connection ───────────────────────────────────────────────
export async function closeConnection() {
  await sql.end();
}
