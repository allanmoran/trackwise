/**
 * KB Feedback Routes
 * Updates horse/jockey/trainer career statistics from settled bets
 * Feeds race results back into the knowledge base for model improvement
 */

import express from 'express';
import db from '../db.js';

const router = express.Router();

/**
 * Update career stats for a horse from settled bets
 */
function updateHorseStats(horseId, horseName) {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as career_bets,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as career_wins,
      SUM(CASE WHEN result IN ('WIN', 'PLACE') THEN 1 ELSE 0 END) as career_places,
      SUM(stake) as career_stake,
      SUM(CASE WHEN result = 'WIN' THEN (return_amount - stake) ELSE (profit_loss) END) as career_profit
    FROM bets
    WHERE horse_id = ? AND result IS NOT NULL
  `).get(horseId);

  if (!stats || stats.career_bets === 0) {
    return null;
  }

  const strikeRate = stats.career_bets > 0 ? stats.career_wins / stats.career_bets : 0;
  const placeRate = stats.career_bets > 0 ? stats.career_places / stats.career_bets : 0;
  const roi = stats.career_stake > 0 ? stats.career_profit / stats.career_stake : 0;

  // Update form score based on recent performance
  const recentBets = db.prepare(`
    SELECT result
    FROM bets
    WHERE horse_id = ? AND result IS NOT NULL
    ORDER BY settled_at DESC
    LIMIT 10
  `).all(horseId);

  let formScore = Math.round(strikeRate * 100);
  if (recentBets.length > 0) {
    const recentWins = recentBets.filter(b => b.result === 'WIN').length;
    const recentForm = recentWins / recentBets.length;
    // Weight recent form 60%, overall rate 40%
    formScore = Math.round(strikeRate * 40 + recentForm * 60);
  }

  // Update class rating based on average odds
  const avgOdds = db.prepare(`
    SELECT AVG(closing_odds || opening_odds) as avg_odds
    FROM bets
    WHERE horse_id = ? AND result IS NOT NULL
  `).get(horseId);

  let classRating = 5;
  if (avgOdds?.avg_odds) {
    // Lower odds = better horse = lower class number
    const odds = avgOdds.avg_odds;
    classRating = Math.max(1, Math.min(10, Math.round(11 - Math.log(odds) * 2)));
  }

  db.prepare(`
    UPDATE horses
    SET
      career_wins = ?,
      career_places = ?,
      career_bets = ?,
      career_stake = ?,
      career_return = ?,
      strike_rate = ?,
      place_rate = ?,
      roi = ?,
      form_score = ?,
      class_rating = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    stats.career_wins || 0,
    stats.career_places || 0,
    stats.career_bets,
    stats.career_stake || 0,
    stats.career_stake + stats.career_profit || 0,
    strikeRate,
    placeRate,
    roi,
    formScore,
    classRating,
    horseId
  );

  return {
    horse: horseName,
    bets: stats.career_bets,
    wins: stats.career_wins,
    strikeRate: (strikeRate * 100).toFixed(1),
    roi: (roi * 100).toFixed(1)
  };
}

/**
 * Update career stats for a jockey from settled bets
 */
function updateJockeyStats(jockeyId, jockeyName) {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as career_bets,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as career_wins,
      SUM(CASE WHEN result IN ('WIN', 'PLACE') THEN 1 ELSE 0 END) as career_places,
      SUM(stake) as career_stake,
      SUM(CASE WHEN result = 'WIN' THEN (return_amount - stake) ELSE (profit_loss) END) as career_profit
    FROM bets
    WHERE jockey_id = ? AND result IS NOT NULL
  `).get(jockeyId);

  if (!stats || stats.career_bets === 0) {
    return null;
  }

  const strikeRate = stats.career_bets > 0 ? stats.career_wins / stats.career_bets : 0;
  const placeRate = stats.career_bets > 0 ? stats.career_places / stats.career_bets : 0;
  const roi = stats.career_stake > 0 ? stats.career_profit / stats.career_stake : 0;

  // Determine tier based on strike rate
  let tier = 'C';
  if (strikeRate > 0.30) tier = 'A';
  else if (strikeRate > 0.22) tier = 'B';

  // Recent form: last 20 bets
  const recentBets = db.prepare(`
    SELECT result
    FROM bets
    WHERE jockey_id = ? AND result IS NOT NULL
    ORDER BY settled_at DESC
    LIMIT 20
  `).all(jockeyId);

  let recentForm = strikeRate;
  if (recentBets.length > 0) {
    recentForm = recentBets.filter(b => b.result === 'WIN').length / recentBets.length;
  }

  db.prepare(`
    UPDATE jockeys
    SET
      career_wins = ?,
      career_places = ?,
      career_bets = ?,
      career_stake = ?,
      career_return = ?,
      strike_rate = ?,
      place_rate = ?,
      roi = ?,
      tier = ?,
      recent_form = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    stats.career_wins || 0,
    stats.career_places || 0,
    stats.career_bets,
    stats.career_stake || 0,
    stats.career_stake + stats.career_profit || 0,
    strikeRate,
    placeRate,
    roi,
    tier,
    recentForm,
    jockeyId
  );

  return {
    jockey: jockeyName,
    bets: stats.career_bets,
    wins: stats.career_wins,
    strikeRate: (strikeRate * 100).toFixed(1),
    roi: (roi * 100).toFixed(1),
    tier
  };
}

/**
 * Update career stats for a trainer from settled bets
 */
function updateTrainerStats(trainerId, trainerName) {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as career_bets,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as career_wins,
      SUM(CASE WHEN result IN ('WIN', 'PLACE') THEN 1 ELSE 0 END) as career_places,
      SUM(stake) as career_stake,
      SUM(CASE WHEN result = 'WIN' THEN (return_amount - stake) ELSE (profit_loss) END) as career_profit
    FROM bets
    WHERE trainer_id = ? AND result IS NOT NULL
  `).get(trainerId);

  if (!stats || stats.career_bets === 0) {
    return null;
  }

  const strikeRate = stats.career_bets > 0 ? stats.career_wins / stats.career_bets : 0;
  const placeRate = stats.career_bets > 0 ? stats.career_places / stats.career_bets : 0;
  const roi = stats.career_stake > 0 ? stats.career_profit / stats.career_stake : 0;

  // Determine tier based on strike rate
  let tier = 'C';
  if (strikeRate > 0.32) tier = 'A';
  else if (strikeRate > 0.24) tier = 'B';

  // Recent form: last 20 bets
  const recentBets = db.prepare(`
    SELECT result
    FROM bets
    WHERE trainer_id = ? AND result IS NOT NULL
    ORDER BY settled_at DESC
    LIMIT 20
  `).all(trainerId);

  let recentForm = strikeRate;
  if (recentBets.length > 0) {
    recentForm = recentBets.filter(b => b.result === 'WIN').length / recentBets.length;
  }

  db.prepare(`
    UPDATE trainers
    SET
      career_wins = ?,
      career_places = ?,
      career_bets = ?,
      career_stake = ?,
      career_return = ?,
      strike_rate = ?,
      place_rate = ?,
      roi = ?,
      tier = ?,
      recent_form = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    stats.career_wins || 0,
    stats.career_places || 0,
    stats.career_bets,
    stats.career_stake || 0,
    stats.career_stake + stats.career_profit || 0,
    strikeRate,
    placeRate,
    roi,
    tier,
    recentForm,
    trainerId
  );

  return {
    trainer: trainerName,
    bets: stats.career_bets,
    wins: stats.career_wins,
    strikeRate: (strikeRate * 100).toFixed(1),
    roi: (roi * 100).toFixed(1),
    tier
  };
}

/**
 * POST /api/kb/update-from-results
 * Update all horse/jockey/trainer stats from settled bets
 */
router.post('/update-from-results', (req, res) => {
  try {
    console.log('\n🔄 Updating KB from race results...');

    // Get all horses with settled bets
    const horses = db.prepare(`
      SELECT DISTINCT h.id, h.name
      FROM horses h
      JOIN bets b ON h.id = b.horse_id
      WHERE b.result IS NOT NULL
    `).all();

    const updatedHorses = [];
    for (const horse of horses) {
      const updated = updateHorseStats(horse.id, horse.name);
      if (updated) {
        updatedHorses.push(updated);
      }
    }

    console.log(`  ✅ Updated ${updatedHorses.length} horses`);

    // Get all jockeys with settled bets
    const jockeys = db.prepare(`
      SELECT DISTINCT j.id, j.name
      FROM jockeys j
      JOIN bets b ON j.id = b.jockey_id
      WHERE b.result IS NOT NULL
    `).all();

    const updatedJockeys = [];
    for (const jockey of jockeys) {
      const updated = updateJockeyStats(jockey.id, jockey.name);
      if (updated) {
        updatedJockeys.push(updated);
      }
    }

    console.log(`  ✅ Updated ${updatedJockeys.length} jockeys`);

    // Get all trainers with settled bets
    const trainers = db.prepare(`
      SELECT DISTINCT t.id, t.name
      FROM trainers t
      JOIN bets b ON t.id = b.trainer_id
      WHERE b.result IS NOT NULL
    `).all();

    const updatedTrainers = [];
    for (const trainer of trainers) {
      const updated = updateTrainerStats(trainer.id, trainer.name);
      if (updated) {
        updatedTrainers.push(updated);
      }
    }

    console.log(`  ✅ Updated ${updatedTrainers.length} trainers`);

    // Calculate summary
    const settledStats = db.prepare(`
      SELECT
        COUNT(*) as total_bets,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'PLACE' THEN 1 ELSE 0 END) as places,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
        SUM(stake) as total_stake,
        SUM(profit_loss) as total_profit
      FROM bets WHERE result IS NOT NULL
    `).get();

    const roi = settledStats.total_stake > 0
      ? ((settledStats.total_profit / settledStats.total_stake) * 100).toFixed(1)
      : 0;

    const summary = `${updatedHorses.length}h, ${updatedJockeys.length}j, ${updatedTrainers.length}t | ${settledStats.wins}W ${settledStats.places}P ${settledStats.losses}L | ROI: ${roi}%`;

    res.json({
      success: true,
      message: 'KB updated from race results',
      summary,
      horses: updatedHorses.length,
      jockeys: updatedJockeys.length,
      trainers: updatedTrainers.length,
      stats: {
        totalBets: settledStats.total_bets,
        wins: settledStats.wins,
        places: settledStats.places,
        losses: settledStats.losses,
        totalStake: settledStats.total_stake,
        totalProfit: settledStats.total_profit,
        roi: parseFloat(roi)
      }
    });

  } catch (err) {
    console.error('KB update error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update KB',
      error: err.message
    });
  }
});

/**
 * GET /api/kb/update-status
 * Show which performers improved/declined from latest results
 */
router.get('/update-status', (req, res) => {
  try {
    const topHorses = db.prepare(`
      SELECT name, strike_rate, roi, form_score, updated_at
      FROM horses
      WHERE career_bets > 0
      ORDER BY roi DESC
      LIMIT 5
    `).all();

    const topJockeys = db.prepare(`
      SELECT name, tier, strike_rate, roi, updated_at
      FROM jockeys
      WHERE career_bets > 0
      ORDER BY roi DESC
      LIMIT 5
    `).all();

    const topTrainers = db.prepare(`
      SELECT name, tier, strike_rate, roi, updated_at
      FROM trainers
      WHERE career_bets > 0
      ORDER BY roi DESC
      LIMIT 5
    `).all();

    res.json({
      success: true,
      topHorses,
      topJockeys,
      topTrainers
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
