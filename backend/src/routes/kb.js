import express from 'express';
import db from '../db.js';

const router = express.Router();

// Get horse stats
router.get('/horses/:name', (req, res) => {
  try {
    const horse = db.prepare(`
      SELECT * FROM horses WHERE name = ?
    `).get(req.params.name);

    if (!horse) {
      return res.status(404).json({ error: 'Horse not found' });
    }

    res.json(horse);
  } catch (err) {
    console.error('Horse KB error:', err);
    res.status(500).json({ error: 'Failed to load horse data' });
  }
});

// Get jockey stats
router.get('/jockeys/:name', (req, res) => {
  try {
    const jockey = db.prepare(`
      SELECT * FROM jockeys WHERE name = ?
    `).get(req.params.name);

    if (!jockey) {
      return res.status(404).json({ error: 'Jockey not found' });
    }

    res.json(jockey);
  } catch (err) {
    console.error('Jockey KB error:', err);
    res.status(500).json({ error: 'Failed to load jockey data' });
  }
});

// Get trainer stats
router.get('/trainers/:name', (req, res) => {
  try {
    const trainer = db.prepare(`
      SELECT * FROM trainers WHERE name = ?
    `).get(req.params.name);

    if (!trainer) {
      return res.status(404).json({ error: 'Trainer not found' });
    }

    res.json(trainer);
  } catch (err) {
    console.error('Trainer KB error:', err);
    res.status(500).json({ error: 'Failed to load trainer data' });
  }
});

// Get stats
router.get('/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT stat_type, stat_key, bets, wins, places, stake, return_amount
      FROM kb_stats
      ORDER BY stat_type, stat_key
    `).all();

    res.json({ stats });
  } catch (err) {
    console.error('KB stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

export default router;
