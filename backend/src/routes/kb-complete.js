import express from 'express';
import db from '../db.js';

const router = express.Router();

// Get horse stats by name
router.get('/horses/:name', (req, res) => {
  try {
    const horse = db.prepare(`SELECT * FROM horses WHERE name = ?`).get(req.params.name);
    if (!horse) return res.status(404).json({ error: 'Horse not found' });
    res.json(horse);
  } catch (err) {
    console.error('Horse error:', err);
    res.status(500).json({ error: 'Failed to load horse' });
  }
});

// Get all horses
router.get('/horses', (req, res) => {
  try {
    const horses = db.prepare(`
      SELECT id, name, form_score, class_rating, strike_rate, roi
      FROM horses LIMIT 100
    `).all();
    res.json(horses);
  } catch (err) {
    console.error('Horses error:', err);
    res.status(500).json({ error: 'Failed to load horses' });
  }
});

// Get jockey stats by name
router.get('/jockeys/:name', (req, res) => {
  try {
    const jockey = db.prepare(`SELECT * FROM jockeys WHERE name = ?`).get(req.params.name);
    if (!jockey) return res.status(404).json({ error: 'Jockey not found' });
    res.json(jockey);
  } catch (err) {
    console.error('Jockey error:', err);
    res.status(500).json({ error: 'Failed to load jockey' });
  }
});

// Get all jockeys
router.get('/jockeys', (req, res) => {
  try {
    const jockeys = db.prepare(`
      SELECT id, name, tier, strike_rate, roi, recent_form
      FROM jockeys LIMIT 100
    `).all();
    res.json(jockeys);
  } catch (err) {
    console.error('Jockeys error:', err);
    res.status(500).json({ error: 'Failed to load jockeys' });
  }
});

// Get trainer stats by name
router.get('/trainers/:name', (req, res) => {
  try {
    const trainer = db.prepare(`SELECT * FROM trainers WHERE name = ?`).get(req.params.name);
    if (!trainer) return res.status(404).json({ error: 'Trainer not found' });
    res.json(trainer);
  } catch (err) {
    console.error('Trainer error:', err);
    res.status(500).json({ error: 'Failed to load trainer' });
  }
});

// Get all trainers
router.get('/trainers', (req, res) => {
  try {
    const trainers = db.prepare(`
      SELECT id, name, tier, strike_rate, roi, recent_form
      FROM trainers LIMIT 100
    `).all();
    res.json(trainers);
  } catch (err) {
    console.error('Trainers error:', err);
    res.status(500).json({ error: 'Failed to load trainers' });
  }
});

// Get KB stats
router.get('/stats', (req, res) => {
  try {
    const stats = {
      totalHorses: db.prepare('SELECT COUNT(*) as count FROM horses').get().count,
      totalJockeys: db.prepare('SELECT COUNT(*) as count FROM jockeys').get().count,
      totalTrainers: db.prepare('SELECT COUNT(*) as count FROM trainers').get().count,
      totalRaces: db.prepare('SELECT COUNT(*) as count FROM races').get().count,
    };
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Get probability score for a runner
router.get('/probability', (req, res) => {
  try {
    const { horse, jockey, trainer, track, odds } = req.query;

    // Get horse form score
    let horseScore = 60;
    if (horse) {
      const h = db.prepare('SELECT form_score FROM horses WHERE name = ?').get(horse);
      if (h) horseScore = h.form_score || 60;
    }

    // Get jockey tier bonus
    let jockeyBonus = 0;
    if (jockey) {
      const j = db.prepare('SELECT tier FROM jockeys WHERE name = ?').get(jockey);
      if (j) {
        jockeyBonus = j.tier === 'A' ? 5 : j.tier === 'B' ? 2 : 0;
      }
    }

    // Get trainer tier bonus
    let trainerBonus = 0;
    if (trainer) {
      const t = db.prepare('SELECT tier FROM trainers WHERE name = ?').get(trainer);
      if (t) {
        trainerBonus = t.tier === 'A' ? 3 : t.tier === 'B' ? 1 : 0;
      }
    }

    const score = Math.min(100, horseScore + jockeyBonus + trainerBonus);
    res.json({ score, recommendation: score >= 65 ? 'BACK' : score >= 55 ? 'MAYBE' : 'PASS' });
  } catch (err) {
    console.error('Probability error:', err);
    res.status(500).json({ error: 'Failed to calculate probability' });
  }
});

export default router;
