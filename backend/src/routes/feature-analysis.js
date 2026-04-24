/**
 * Feature Analysis Routes
 * Analyze horses by their predictive features
 */

import express from 'express';
import db from '../db.js';
import { FeatureEngineer } from '../ml/feature-engineer.js';

const router = express.Router();

/**
 * GET /api/features/horse/:horseId
 * Get comprehensive feature analysis for a horse
 */
router.get('/horse/:horseId', (req, res) => {
  try {
    const horseId = parseInt(req.params.horseId);

    const horse = db.prepare(`
      SELECT id, name, strike_rate, career_wins, career_bets, form_score, class_rating
      FROM horses WHERE id = ?
    `).get(horseId);

    if (!horse) {
      return res.status(404).json({ error: 'Horse not found' });
    }

    const features = FeatureEngineer.generateFeatureVector(horseId, horse, null, null);

    res.json({
      success: true,
      horse,
      features
    });
  } catch (err) {
    console.error('Feature analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/features/distance/:horseId
 * Analyze distance preferences
 */
router.get('/distance/:horseId', (req, res) => {
  try {
    const horseId = parseInt(req.params.horseId);
    const prefs = FeatureEngineer.getDistancePreference(horseId);

    if (!prefs) {
      return res.json({ message: 'Insufficient data' });
    }

    res.json({
      success: true,
      distancePreference: prefs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/features/track/:horseId
 * Analyze track preferences
 */
router.get('/track/:horseId', (req, res) => {
  try {
    const horseId = parseInt(req.params.horseId);
    const prefs = FeatureEngineer.getTrackPreference(horseId);

    if (!prefs) {
      return res.json({ message: 'Insufficient data' });
    }

    res.json({
      success: true,
      trackPreference: prefs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/features/odds-efficiency/:horseId
 * Analyze BSP odds vs actual win rate
 */
router.get('/odds-efficiency/:horseId', (req, res) => {
  try {
    const horseId = parseInt(req.params.horseId);
    const efficiency = FeatureEngineer.getOddsEfficiency(horseId);

    if (!efficiency) {
      return res.json({ message: 'Insufficient bet data' });
    }

    res.json({
      success: true,
      oddsEfficiency: efficiency
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/features/high-confidence
 * Find horses with proven edges across multiple dimensions
 */
router.get('/high-confidence', (req, res) => {
  try {
    const minRaces = parseInt(req.query.minRaces || '20');
    const horses = FeatureEngineer.findHighConfidenceHorses(minRaces);

    res.json({
      success: true,
      count: horses.length,
      description: `Horses with ${minRaces}+ races and edges in 2+ dimensions`,
      horses
    });
  } catch (err) {
    console.error('High confidence analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/features/jockey-combo/:horseId/:jockeyId
 * Analyze jockey x horse combination
 */
router.get('/jockey-combo/:horseId/:jockeyId', (req, res) => {
  try {
    const horseId = parseInt(req.params.horseId);
    const jockeyId = parseInt(req.params.jockeyId);

    const combo = FeatureEngineer.getJockeyHorseCombination(horseId, jockeyId);

    if (!combo) {
      return res.json({ message: 'Insufficient combination data' });
    }

    res.json({
      success: true,
      jockeyCombo: combo
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/features/trainer-combo/:horseId/:trainerId
 * Analyze trainer x horse combination
 */
router.get('/trainer-combo/:horseId/:trainerId', (req, res) => {
  try {
    const horseId = parseInt(req.params.horseId);
    const trainerId = parseInt(req.params.trainerId);

    const combo = FeatureEngineer.getTrainerHorseCombination(horseId, trainerId);

    if (!combo) {
      return res.json({ message: 'Insufficient combination data' });
    }

    res.json({
      success: true,
      trainerCombo: combo
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/features/analyze-race
 * Analyze all runners in a race for feature-based picks
 */
router.post('/analyze-race', (req, res) => {
  try {
    const { raceId } = req.body;

    if (!raceId) {
      return res.status(400).json({ error: 'raceId required' });
    }

    const race = db.prepare(`
      SELECT id, track, race_number, distance, condition
      FROM races WHERE id = ?
    `).get(raceId);

    if (!race) {
      return res.status(404).json({ error: 'Race not found' });
    }

    const runners = db.prepare(`
      SELECT
        rr.id,
        rr.horse_id,
        h.name,
        h.strike_rate,
        h.career_bets,
        rr.jockey_id,
        rr.trainer_id,
        rr.starting_odds
      FROM race_runners rr
      JOIN horses h ON rr.horse_id = h.id
      WHERE rr.race_id = ?
      ORDER BY h.strike_rate DESC
    `).all(raceId);

    const analysis = runners.map(runner => {
      const features = FeatureEngineer.generateFeatureVector(
        runner.horse_id,
        runner,
        runner.jockey_id,
        runner.trainer_id
      );

      return {
        runner: runner.name,
        odds: runner.starting_odds,
        baseStrikeRate: (runner.strike_rate * 100).toFixed(1),
        careerBets: runner.career_bets,
        compositeScore: features?.compositeScore,
        edges: features?.features
      };
    });

    // Sort by composite score
    analysis.sort((a, b) => parseFloat(b.compositeScore) - parseFloat(a.compositeScore));

    res.json({
      success: true,
      race: {
        track: race.track,
        raceNumber: race.race_number,
        distance: race.distance,
        condition: race.condition
      },
      runners: analysis,
      topPicks: analysis.slice(0, 3)
    });
  } catch (err) {
    console.error('Race analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
