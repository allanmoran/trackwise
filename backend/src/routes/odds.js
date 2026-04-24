import express from 'express';

const router = express.Router();

/**
 * POST /api/odds/racenet/batch
 * Fetch TAB closing odds for multiple races
 *
 * Request:
 * {
 *   "races": [
 *     { "track": "Doomben", "raceNum": 1 },
 *     { "track": "Caulfield", "raceNum": 5 }
 *   ]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "odds": {
 *     "Doomben-R1": {
 *       "runners": [
 *         { "name": "Horse Name", "price": { "decimal": 3.5 } },
 *         ...
 *       ]
 *     },
 *     ...
 *   }
 * }
 */
router.post('/racenet/batch', async (req, res) => {
  try {
    const { races } = req.body;

    if (!Array.isArray(races)) {
      return res.status(400).json({ error: 'races must be an array' });
    }

    const odds = {};

    // For now, return empty odds (simulating API)
    // In production, would call actual RaceNet API
    for (const race of races) {
      const key = `${race.track}-R${race.raceNum}`;
      odds[key] = {
        runners: []
      };
    }

    // TODO: In production, fetch from RaceNet API
    // This would require API credentials and proper integration

    res.json({
      success: true,
      odds,
      note: 'TAB odds endpoint - placeholder implementation'
    });
  } catch (err) {
    console.error('Odds batch error:', err);
    res.status(500).json({ error: 'Failed to fetch odds' });
  }
});

export default router;
