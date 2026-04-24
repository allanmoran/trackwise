import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET /api/session/bank - Get current bank balance from settled bets
router.get('/bank', (req, res) => {
  try {
    const result = db.prepare(`
      SELECT
        COALESCE(SUM(profit_loss), 0) as net_profit,
        COUNT(*) as total_settled,
        COALESCE(SUM(stake), 0) as total_wagered
      FROM bets
      WHERE status LIKE 'SETTLED%'
    `).get();

    const openBets = db.prepare(`
      SELECT COUNT(*) as active_count, COALESCE(SUM(stake), 0) as active_stake
      FROM bets WHERE status = 'ACTIVE'
    `).get();

    const initialBank = 1000;
    const currentBank = initialBank + (result?.net_profit || 0);

    res.json({
      success: true,
      bank: currentBank,
      initialBank,
      netProfit: result?.net_profit || 0,
      totalSettled: result?.total_settled || 0,
      totalWagered: result?.total_wagered || 0,
      activeBets: openBets?.active_count || 0,
      activeBetAmount: openBets?.active_stake || 0
    });
  } catch (err) {
    console.error('Bank balance error:', err);
    res.status(500).json({ error: 'Failed to get bank balance' });
  }
});

export default router;
