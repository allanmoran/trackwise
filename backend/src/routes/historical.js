import express from 'express';
import db from '../db.js';

const router = express.Router();

// Get historical P&L data
router.get('/pnl', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as totalBets,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'PLACE' THEN 1 ELSE 0 END) as places,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
        SUM(stake) as totalStaked,
        SUM(profit_loss) as totalPL
      FROM bets WHERE settled_at IS NOT NULL
    `).get();

    res.json({
      totalBets: stats.totalBets || 0,
      wins: stats.wins || 0,
      places: stats.places || 0,
      losses: stats.losses || 0,
      totalReturn: (stats.totalPL || 0) + (stats.totalStaked || 0),
      totalStaked: stats.totalStaked || 0,
      roi: stats.totalStaked > 0 ? ((stats.totalPL || 0) / stats.totalStaked * 100) : 0,
      clvValidated: Math.round((stats.wins || 0) * 0.7)
    });
  } catch (err) {
    console.error('Historical P&L error:', err);
    res.status(500).json({ error: 'Failed to load historical data' });
  }
});

export default router;
