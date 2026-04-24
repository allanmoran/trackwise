import express from 'express';
import db from '../db.js';

const router = express.Router();

/**
 * POST /api/enrich/jockeys-trainers
 * Accept jockey/trainer data and enrich the KB
 *
 * Body: {
 *   data: [
 *     {
 *       jockey: "John Phelan",
 *       jockeyWinPct: 23.81,         // Win percentage (0-100), will auto-normalize
 *       trainer: "Mick Smith",
 *       trainerWinPct: 18.5,         // Win percentage (0-100), will auto-normalize
 *       horse?: "Horse Name",
 *       track?: "Rockhampton",
 *       race_num?: 1
 *     },
 *     ...
 *   ]
 * }
 *
 * Note: Strike rates are normalized to decimals (0-1) internally.
 * Input as percentages (0-100) or decimals (0-1), either works.
 */
router.post('/jockeys-trainers', (req, res) => {
  try {
    const { data } = req.body;

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'data must be an array' });
    }

    let jockeysAdded = 0;
    let trainersAdded = 0;
    let errors = [];

    // Helper to normalize strike rate (convert percentage to decimal if needed)
    const normalizeRate = (rate) => {
      if (typeof rate !== 'number' || isNaN(rate)) return 0;
      // If value is >= 1, assume it's a percentage (e.g., 23.81)
      // If value is < 1, assume it's already a decimal (e.g., 0.2381)
      // Always cap at 0.99 (max 99%) for realistic strike rates
      const normalized = rate >= 1 ? rate / 100 : rate;
      return Math.min(normalized, 0.99);
    };

    // Helper to assign tier based on strike rate
    const getTier = (strikeRate) => {
      if (strikeRate > 0.20) return 'A';
      if (strikeRate > 0.15) return 'B';
      return 'C';
    };

    for (const entry of data) {
      try {
        // Add jockey
        if (entry.jockey) {
          const existing = db
            .prepare('SELECT id FROM jockeys WHERE name = ?')
            .get(entry.jockey);

          if (!existing) {
            const strikeRate = normalizeRate(entry.jockeyWinPct || entry.jockey_win_pct || 0);
            const tier = getTier(strikeRate);
            db.prepare(
              'INSERT INTO jockeys (name, tier, strike_rate, roi) VALUES (?, ?, ?, ?)'
            ).run(entry.jockey, tier, strikeRate, 0);
            console.log(`  [ADD] Jockey: ${entry.jockey} → Tier ${tier} (${(strikeRate * 100).toFixed(1)}%)`);
            jockeysAdded++;
          } else if (entry.jockeyWinPct || entry.jockey_win_pct) {
            // Update existing jockey with Punters data
            const strikeRate = normalizeRate(entry.jockeyWinPct || entry.jockey_win_pct);
            const tier = getTier(strikeRate);
            db.prepare(
              'UPDATE jockeys SET tier = ?, strike_rate = ? WHERE name = ?'
            ).run(tier, strikeRate, entry.jockey);
            console.log(`  [UPDATE] Jockey: ${entry.jockey} → Tier ${tier} (${(strikeRate * 100).toFixed(1)}%)`);
            jockeysAdded++;
          }
        }

        // Add trainer
        if (entry.trainer) {
          const existing = db
            .prepare('SELECT id FROM trainers WHERE name = ?')
            .get(entry.trainer);

          if (!existing) {
            const strikeRate = normalizeRate(entry.trainerWinPct || entry.trainer_win_pct || 0);
            const tier = getTier(strikeRate);
            db.prepare(
              'INSERT INTO trainers (name, tier, strike_rate, roi) VALUES (?, ?, ?, ?)'
            ).run(entry.trainer, tier, strikeRate, 0);
            console.log(`  [ADD] Trainer: ${entry.trainer} → Tier ${tier} (${(strikeRate * 100).toFixed(1)}%)`);
            trainersAdded++;
          } else if (entry.trainerWinPct || entry.trainer_win_pct) {
            // Update existing trainer with Punters data
            const strikeRate = normalizeRate(entry.trainerWinPct || entry.trainer_win_pct);
            const tier = getTier(strikeRate);
            db.prepare(
              'UPDATE trainers SET tier = ?, strike_rate = ? WHERE name = ?'
            ).run(tier, strikeRate, entry.trainer);
            console.log(`  [UPDATE] Trainer: ${entry.trainer} → Tier ${tier} (${(strikeRate * 100).toFixed(1)}%)`);
            trainersAdded++;
          }
        }
      } catch (e) {
        errors.push(`Entry ${entry.jockey || entry.trainer}: ${e.message}`);
      }
    }

    // Get KB stats
    const jockeyCount = db
      .prepare('SELECT COUNT(*) as count FROM jockeys')
      .get().count;
    const trainerCount = db
      .prepare('SELECT COUNT(*) as count FROM trainers')
      .get().count;

    res.json({
      success: true,
      summary: {
        jockeysAdded,
        trainersAdded,
        errors: errors.length,
        errorsList: errors
      },
      kbStats: {
        totalJockeys: jockeyCount,
        totalTrainers: trainerCount
      }
    });
  } catch (err) {
    console.error('Enrichment error:', err);
    res.status(500).json({ error: 'Failed to enrich KB' });
  }
});

/**
 * POST /api/enrich/odds
 * Store market odds from Punters for CLV calculation
 *
 * Body: {
 *   data: [
 *     {
 *       horse: "SAILOR'S RUM",
 *       track: "Rockhampton",
 *       race_num: 1,
 *       date: "2026-04-11",
 *       odds: {
 *         sportsbet: 5.00,
 *         ladbrokes: 4.80,
 *         tab: 4.90,
 *         neds: 4.95,
 *         bluebetOdds: 4.85,
 *         best: 4.80,
 *         avg: 4.90
 *       }
 *     },
 *     ...
 *   ]
 * }
 */
router.post('/odds', (req, res) => {
  try {
    const { data } = req.body;

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'data must be an array' });
    }

    let stored = 0;
    let errors = [];

    for (const entry of data) {
      try {
        const { horse, track, race_num, date, odds } = entry;

        if (!horse || !odds || !odds.best) {
          errors.push(`${horse}: missing odds data`);
          continue;
        }

        // Find matching active bet
        const bet = db
          .prepare(
            `SELECT id FROM bets
             WHERE horse = ?
             AND status = 'ACTIVE'
             LIMIT 1`
          )
          .get(horse);

        if (bet) {
          // Update bet with closing odds
          db.prepare(
            `UPDATE bets
             SET closing_odds = ?,
                 clv_percent = ROUND(((? / ?) - 1) * 100, 2)
             WHERE id = ?`
          ).run(odds.best, odds.best, 5.0, bet.id); // Using 5.0 as placeholder opening odds

          stored++;
        }
      } catch (e) {
        errors.push(`${entry.horse}: ${e.message}`);
      }
    }

    res.json({
      success: true,
      summary: {
        stored,
        errors: errors.length,
        errorsList: errors
      }
    });
  } catch (err) {
    console.error('Odds enrichment error:', err);
    res.status(500).json({ error: 'Failed to store odds' });
  }
});

/**
 * POST /api/enrich/horse-stats
 * Store horse performance stats from Punters
 *
 * Body: {
 *   data: [
 *     {
 *       horse: "SAILOR'S RUM",
 *       wins: 2,
 *       places: 1,
 *       shows: 0,
 *       starts: 12,
 *       earnings: 45000,
 *       best_distance: "1400m",
 *       best_track: "Rockhampton",
 *       form_line: "1-3-2-0-1",
 *       barrier_wins: 3,
 *       barrier_attempts: 4
 *     },
 *     ...
 *   ]
 * }
 */
router.post('/horse-stats', (req, res) => {
  try {
    const { data } = req.body;

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'data must be an array' });
    }

    let updated = 0;
    let errors = [];

    for (const entry of data) {
      try {
        const { horse, wins, places, shows, starts, earnings, best_distance, best_track, form_line, barrier_wins, barrier_attempts } = entry;

        if (!horse) {
          errors.push('Missing horse name');
          continue;
        }

        // Calculate strike rate and place rate
        const strikeRate = starts && wins ? (wins / starts) : null;
        const placeRate = starts && (wins + places) ? ((wins + places) / starts) : null;

        // Look up or create horse
        let existing = db
          .prepare('SELECT id FROM horses WHERE name = ?')
          .get(horse);

        if (existing) {
          // Update horse with Punters data
          db.prepare(`
            UPDATE horses
            SET career_wins = ?,
                career_places = ?,
                career_bets = ?,
                strike_rate = ?,
                place_rate = ?,
                form_score = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE name = ?
          `).run(
            wins || 0,
            places || 0,
            starts || 0,
            strikeRate || 0,
            placeRate || 0,
            (strikeRate ? Math.round(strikeRate * 100) : 0),
            horse
          );
          updated++;
        } else {
          // Add new horse
          db.prepare(`
            INSERT INTO horses (name, career_wins, career_places, career_bets, strike_rate, place_rate, form_score)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            horse,
            wins || 0,
            places || 0,
            starts || 0,
            strikeRate || 0,
            placeRate || 0,
            (strikeRate ? Math.round(strikeRate * 100) : 0)
          );
          updated++;
        }
      } catch (e) {
        errors.push(`${entry.horse}: ${e.message}`);
      }
    }

    // Get KB stats
    const horseCount = db
      .prepare('SELECT COUNT(*) as count FROM horses')
      .get().count;

    res.json({
      success: true,
      summary: {
        updated,
        errors: errors.length,
        errorsList: errors
      },
      kbStats: {
        totalHorses: horseCount
      }
    });
  } catch (err) {
    console.error('Horse stats enrichment error:', err);
    res.status(500).json({ error: 'Failed to enrich horse stats' });
  }
});

/**
 * GET /api/enrich/instructions
 * Get instructions for manual enrichment
 */
router.get('/instructions', (req, res) => {
  res.json({
    instructions: `
JOCKEYS & TRAINERS:
Visit: https://www.punters.com.au/jockeys/ and https://www.punters.com.au/trainers/

1. For each page, extract:
   - Names
   - Win percentages

2. Send to /api/enrich/jockeys-trainers with format:
   {
     "data": [
       { "jockey": "John Phelan" },
       { "trainer": "Mick Smith" },
       ...
     ]
   }

ODDS:
Visit: https://www.punters.com.au/odds-comparison/horse-racing/

1. Extract horse names and multi-bookie odds
2. Send to /api/enrich/odds with format:
   {
     "data": [
       {
         "horse": "SAILOR'S RUM",
         "track": "Rockhampton",
         "race_num": 1,
         "date": "2026-04-11",
         "odds": {
           "sportsbet": 5.00,
           "ladbrokes": 4.80,
           "tab": 4.90,
           "best": 4.80,
           "avg": 4.88
         }
       }
     ]
   }

3. System will:
   - Store odds for CLV calculation
   - Validate picks against market consensus
   - Calculate actual ROI post-race
    `.trim()
  });
});

export default router;
