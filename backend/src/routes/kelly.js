import express from 'express';
import db from '../db.js';

const router = express.Router();

// Log Kelly calculation
router.post('/log', (req, res) => {
  try {
    const { date, horse, jockey, trainer, odds, clv, confidence, recommendation } = req.body;

    // Just log it for now - in a real system this would be stored
    console.log(`[KELLY] ${date} - ${horse} (${jockey}/${trainer}) @ ${odds} | CLV: ${clv}% | Confidence: ${confidence}% | ${recommendation}`);

    res.json({ success: true });
  } catch (err) {
    console.error('Kelly log error:', err);
    res.status(500).json({ error: 'Failed to log Kelly' });
  }
});

export default router;
