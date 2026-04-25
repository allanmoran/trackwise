import express from 'express';
import db from '../db.js';
import { CommissionManager } from '../utils/commission-manager.js';
import ComplianceMonitor from '../ml/compliance-monitor.js';
import ABTester from '../ml/ab-tester.js';

const router = express.Router();

// Simple debug helper
const debug = {
  log: (msg) => console.log(`[BETS] ${msg}`),
  warn: (msg) => console.warn(`[BETS] ⚠️  ${msg}`),
  error: (msg) => console.error(`[BETS] ❌ ${msg}`)
};

// Endpoint: Calculate Quarter Kelly stake (using existing CommissionManager)
router.post('/calculate-stake', (req, res) => {
  try {
    const { confidence, odds, bankroll = 1000, commission = null } = req.body;

    if (!confidence || !odds) {
      return res.status(400).json({ error: 'confidence and odds required' });
    }

    // Use existing CommissionManager for Kelly calculation with commission adjustment
    const kellyResult = CommissionManager.adjustKellyForCommission(odds, confidence, commission);

    // Extract Quarter Kelly as percentage and convert to stake
    const quarterKellyPercent = parseFloat(kellyResult.kelly.quarterKelly);
    const quarterKellyFraction = quarterKellyPercent / 100;
    const optimalStake = Math.round(quarterKellyFraction * bankroll * 100) / 100;

    res.json({
      success: true,
      confidence,
      odds,
      bankroll,
      kellyCalculation: kellyResult,
      optimalStake: Math.max(10, Math.min(optimalStake, bankroll * 0.5)), // Min $10, max 50% bankroll
      recommendation: optimalStake === 0 ? 'SKIP' : optimalStake < 50 ? 'SMALL_BET' : optimalStake < 200 ? 'MEDIUM_BET' : 'LARGE_BET'
    });
  } catch (err) {
    console.error('Kelly calculation error:', err);
    res.status(500).json({ error: 'Failed to calculate stake' });
  }
});

// Get active bets
router.get('/active', (req, res) => {
  try {
    const bets = db.prepare(`
      SELECT
        b.id, b.horse_id, b.jockey_id, b.trainer_id,
        COALESCE(h.name, 'Unknown') as horse,
        COALESCE(j.name, 'Unknown') as jockey,
        COALESCE(t.name, 'Unknown') as trainer,
        COALESCE(r.track, 'Unknown') as track,
        COALESCE(r.date, date('now')) as date,
        COALESCE(r.race_number, 0) as race_num,
        COALESCE(r.race_time, '') as race_time,
        b.stake, b.opening_odds as odds, b.bet_type,
        b.confidence,
        b.placed_at
      FROM bets b
      LEFT JOIN horses h ON b.horse_id = h.id
      LEFT JOIN jockeys j ON b.jockey_id = j.id
      LEFT JOIN trainers t ON b.trainer_id = t.id
      LEFT JOIN races r ON b.race_id = r.id
      WHERE b.status = 'ACTIVE'
      ORDER BY b.placed_at DESC
    `).all();

    const totalStake = bets.reduce((sum, bet) => sum + (bet.stake || 0), 0);

    res.json({ success: true, bets, totalStake });
  } catch (err) {
    console.error('Active bets error:', err);
    res.status(500).json({ error: 'Failed to load active bets' });
  }
});

// Get archived bets
router.get('/archive', (req, res) => {
  try {
    const bets = db.prepare(`
      SELECT
        b.id, b.horse_id, b.jockey_id, b.trainer_id,
        COALESCE(h.name, 'Unknown') as horse,
        COALESCE(j.name, 'Unknown') as jockey,
        COALESCE(t.name, 'Unknown') as trainer,
        COALESCE(r.track, 'Unknown') as track,
        COALESCE(r.date, date('now')) as date,
        COALESCE(r.race_number, 0) as race_num,
        COALESCE(r.race_time, '') as race_time,
        b.stake, b.opening_odds as odds, b.bet_type,
        b.result, b.profit_loss as pnl,
        b.confidence,
        b.placed_at, b.settled_at
      FROM bets b
      LEFT JOIN horses h ON b.horse_id = h.id
      LEFT JOIN jockeys j ON b.jockey_id = j.id
      LEFT JOIN trainers t ON b.trainer_id = t.id
      LEFT JOIN races r ON b.race_id = r.id
      WHERE b.settled_at IS NOT NULL
      ORDER BY b.settled_at DESC
      LIMIT 100
    `).all();

    const totalStake = bets.reduce((sum, bet) => sum + (bet.stake || 0), 0);
    const totalPnL = bets.reduce((sum, bet) => sum + (bet.pnl || 0), 0);

    res.json({ success: true, bets, totalStake, totalPnL });
  } catch (err) {
    console.error('Archive error:', err);
    res.status(500).json({ error: 'Failed to load archive' });
  }
});

// Place bets with validation and deduplication
router.post('/batch', (req, res) => {
  try {
    const { bets } = req.body;
    if (!Array.isArray(bets)) {
      return res.status(400).json({ error: 'bets must be an array' });
    }

    // PHASE 4A: Check drawdown limit before processing any bets
    const drawdownCheck = ComplianceMonitor.checkDrawdownLimit(7);
    if (drawdownCheck.triggered) {
      debug.warn(`Drawdown gate triggered: ${drawdownCheck.message}`);
      return res.status(400).json({
        error: 'BETTING_PAUSED',
        message: drawdownCheck.message,
        drawdownPercent: drawdownCheck.drawdownPercent,
        drawdownThreshold: drawdownCheck.drawdownThreshold,
        action: drawdownCheck.action
      });
    }

    // Apply strategy filters (TESTING MODE - relaxed filters)
    const MIN_CONFIDENCE = 20; // Lowered from 75 for testing
    const MAX_ODDS = 100.0; // Increased from 7.0 to allow higher odds testing
    const BLACKLIST_JOCKEYS = []; // Disabled for testing
    const BLACKLIST_TRAINERS = []; // Disabled for testing

    const inserted = [];
    const filtered = [];
    const duplicates = [];
    const stmt = db.prepare(`
      INSERT INTO bets (race_id, horse_id, jockey_id, trainer_id, bet_type, stake, opening_odds, closing_odds, ev_percent, clv_percent, confidence, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Dedup tracker: race_id + horse_id + jockey_id
    const placedBets = new Set();

    for (const bet of bets) {
      try {
        // Strategy filtering
        if (bet.confidence && bet.confidence < MIN_CONFIDENCE) {
          filtered.push(`${bet.horse}: confidence ${bet.confidence}% < ${MIN_CONFIDENCE}%`);
          continue;
        }

        // Determine odds - with fallback to KB-based estimation if none available
        let odds = bet.closing_odds || bet.opening_odds || bet.odds;

        // Reject negative odds immediately
        if (odds && odds < 0) {
          filtered.push(`${bet.horse}: odds ${odds} < 0 (invalid)`);
          continue;
        }

        // If still no odds, try to get from KB data
        if (!odds || odds <= 0) {
          try {
            const horse = db.prepare('SELECT strike_rate FROM horses WHERE name = ? LIMIT 1').get(bet.horse);
            if (horse && horse.strike_rate > 0) {
              // Estimate odds from win probability: odds = 1 / probability
              odds = 1 / Math.max(0.01, horse.strike_rate);
              debug.log(`[Odds] Estimated ${bet.horse} odds from KB: ${odds.toFixed(2)} (strike rate: ${(horse.strike_rate * 100).toFixed(1)}%)`);
            } else {
              odds = 2.0; // Conservative default
              debug.warn(`[Odds] No KB data for ${bet.horse}, using default 2.0`);
            }
          } catch (err) {
            odds = 2.0; // Conservative default
            debug.warn(`[Odds] KB lookup failed for ${bet.horse}, using default 2.0`);
          }
        }
        if (odds > MAX_ODDS && odds > 0) {
          filtered.push(`${bet.horse}: odds ${odds} > ${MAX_ODDS}`);
          continue;
        }

        if (bet.jockey && BLACKLIST_JOCKEYS.includes(bet.jockey)) {
          filtered.push(`${bet.horse}: jockey ${bet.jockey} blacklisted`);
          continue;
        }

        if (bet.trainer && BLACKLIST_TRAINERS.includes(bet.trainer)) {
          filtered.push(`${bet.horse}: trainer ${bet.trainer} blacklisted`);
          continue;
        }

        // Deduplication: check if same horse+jockey in same race already placed (in-memory)
        const dupKey = `${bet.race_id}|${bet.horse}|${bet.jockey}`;
        if (placedBets.has(dupKey)) {
          duplicates.push(`${bet.track} R${bet.race_num}: ${bet.horse} (${bet.jockey})`);
          continue;
        }
        placedBets.add(dupKey);

        // Also check database for existing bet (handles cross-request deduplication)
        const existingBet = db.prepare(`
          SELECT id FROM bets
          WHERE race_id = ? AND horse_id = (SELECT id FROM horses WHERE name = ? LIMIT 1)
          AND (jockey_id IS NULL OR jockey_id = (SELECT id FROM jockeys WHERE name = ? LIMIT 1))
          AND status = 'ACTIVE'
          LIMIT 1
        `).get(bet.race_id, bet.horse, bet.jockey || 'Unknown');

        if (existingBet) {
          duplicates.push(`${bet.horse} (${bet.jockey}) already bet in this race`);
          continue;
        }

        // Get or create horse/jockey/trainer
        let horseId = bet.horse_id;
        let jockeyId = bet.jockey_id;
        let trainerId = bet.trainer_id;

        if (!horseId && bet.horse) {
          db.prepare('INSERT OR IGNORE INTO horses (name) VALUES (?)').run(bet.horse);
          const horse = db.prepare('SELECT id FROM horses WHERE name = ?').get(bet.horse);
          horseId = horse?.id;
        }

        if (!jockeyId && bet.jockey) {
          db.prepare('INSERT OR IGNORE INTO jockeys (name) VALUES (?)').run(bet.jockey);
          const jockey = db.prepare('SELECT id FROM jockeys WHERE name = ?').get(bet.jockey);
          jockeyId = jockey?.id;
        }

        if (!trainerId && bet.trainer) {
          db.prepare('INSERT OR IGNORE INTO trainers (name) VALUES (?)').run(bet.trainer);
          const trainer = db.prepare('SELECT id FROM trainers WHERE name = ?').get(bet.trainer);
          trainerId = trainer?.id;
        }

        // EV Validation: Calculate expected value before placing
        // Note: EV_THRESHOLD is decimal (0.10 = 10% edge); betEV is also decimal
        const EV_THRESHOLD = 0.10; // 10% minimum edge (higher threshold for realistic probabilities)
        let betEV = null;
        let shouldPlace = true;

        if (bet.confidence && odds && odds > 0) {
          // EV = (Probability × Odds) - 1
          const probability = bet.confidence / 100; // Convert confidence % to decimal
          betEV = (probability * odds) - 1;

          // Check if EV meets threshold
          if (betEV < EV_THRESHOLD) {
            filtered.push(`${bet.horse}: EV ${(betEV * 100).toFixed(1)}% < ${(EV_THRESHOLD * 100).toFixed(1)}% (Prob: ${(probability * 100).toFixed(1)}%, Odds: ${odds.toFixed(2)})`);
            shouldPlace = false;
            debug.warn(`${bet.horse} EV insufficient: ${(betEV * 100).toFixed(1)}% (confidence ${bet.confidence}%, odds ${odds.toFixed(2)})`);
          } else {
            debug.log(`${bet.horse} EV qualified: +${(betEV * 100).toFixed(1)}% (confidence ${bet.confidence}%, odds ${odds.toFixed(2)})`);
          }
        } else if (bet.confidence && !odds) {
          // No odds to calculate EV - this was our earlier issue
          debug.warn(`${bet.horse} - Cannot validate EV: missing odds (confidence ${bet.confidence}%)`);
        }

        // Skip if EV doesn't meet threshold
        if (!shouldPlace) {
          continue;
        }

        // PHASE 3A & 3B: Dynamic stake sizing based on confidence & bankroll
        let finalStake = bet.stake || 100;
        if (!bet.stake || bet.stake === 'auto') {
          try {
            // Get live bankroll from database
            const bankrollResult = db.prepare(`
              SELECT 1000 + COALESCE(SUM(profit_loss), 0) as current_bank
              FROM bets
              WHERE status LIKE 'SETTLED%'
            `).get();
            const currentBankroll = bankrollResult?.current_bank || 1000;
            const startingBankroll = 1000;

            // PHASE 3B: Bankroll-aware adjustment factor
            const bankrollAdjustment = currentBankroll >= startingBankroll * 1.0 ? 1.0 :
                                      currentBankroll >= startingBankroll * 0.85 ? 0.75 :
                                      currentBankroll >= startingBankroll * 0.70 ? 0.50 : 0.0;

            if (bankrollAdjustment === 0) {
              debug.warn('Bankroll below 70% threshold - no new bets');
              continue;
            }

            // PHASE 3A: Confidence-tier Kelly multiplier
            const confidence = bet.confidence || 20;
            const confidenceMultiplier = confidence >= 35 ? 4.0 :
                                        confidence >= 25 ? 2.5 :
                                        confidence >= 18 ? 1.0 : 0.0;

            if (confidenceMultiplier === 0) {
              debug.log(`${bet.horse} below confidence threshold (${confidence}%)`);
              continue;
            }

            // Use CommissionManager for Quarter Kelly
            const kellyResult = CommissionManager.adjustKellyForCommission(odds, confidence);
            const quarterKellyPercent = parseFloat(kellyResult.kelly.quarterKelly);
            const quarterKellyFraction = (quarterKellyPercent / 100) * confidenceMultiplier * bankrollAdjustment;
            finalStake = Math.round(quarterKellyFraction * currentBankroll * 100) / 100;
            finalStake = Math.max(10, Math.min(finalStake, currentBankroll * 0.5));

            debug.log(`${bet.horse} Dynamic stake: $${finalStake} (bank=$${currentBankroll}, conf=${confidence}%, odds=${odds}, adj=${bankrollAdjustment})`);
          } catch (e) {
            finalStake = 100;
            debug.warn(`Stake calculation failed: ${e.message}, using default $100`);
          }
        }

        const result = stmt.run(
          bet.race_id || 0,
          horseId,
          jockeyId,
          trainerId,
          bet.bet_type || 'WIN',
          finalStake,
          bet.opening_odds || bet.odds,
          bet.closing_odds,
          betEV ? Math.round(betEV * 100) : (bet.ev_percent || 0), // Store as percentage (0.51 → 51)
          bet.clv_percent || 0,
          bet.confidence || 0,
          'ACTIVE'
        );

        inserted.push(result.lastInsertRowid);

        // PHASE 4C: Record A/B test assignment (post-hoc labeling)
        ABTester.recordAssignment(result.lastInsertRowid, bet.race_id || 0, horseId);
      } catch (e) {
        console.error('Individual bet insert error:', e);
      }
    }

    // PHASE 3C: Correlation hedging - log same-trainer correlations
    const raceTrainerMap = {};
    for (const bet of bets) {
      const key = `${bet.race_id}_${bet.trainer_id || 'unknown'}`;
      if (!raceTrainerMap[key]) raceTrainerMap[key] = [];
      raceTrainerMap[key].push(bet.horse);
    }
    const correlations = Object.entries(raceTrainerMap)
      .filter(([_, horses]) => horses.length > 1)
      .map(([key, horses]) => ({ race: key.split('_')[0], count: horses.length, horses: horses.join(', ') }));

    // PHASE 3D: Track selection scoring - get best performing tracks
    const trackScores = db.prepare(`
      SELECT r.track,
        COUNT(*) as bets,
        SUM(CASE WHEN b.result IN ('WIN', 'PLACE') THEN 1 ELSE 0 END) as hits,
        ROUND(SUM(b.profit_loss), 2) as pnl
      FROM bets b
      JOIN races r ON b.race_id = r.id
      WHERE b.placed_at > datetime('now', '-90 days') AND b.result IS NOT NULL
      GROUP BY r.track
      ORDER BY pnl DESC
      LIMIT 5
    `).all();

    const response = {
      success: true,
      placed: inserted.length,
      ids: inserted,
      filtered: filtered.length > 0 ? filtered : undefined,
      duplicates: duplicates.length > 0 ? duplicates : undefined,
      total_input: bets.length,
      phase3c_correlations: correlations.length > 0 ? correlations : undefined,
      phase3d_top_tracks: trackScores.length > 0 ? trackScores : undefined
    };

    console.log(`✅ Placed ${inserted.length}/${bets.length} bets (${filtered.length} filtered, ${duplicates.length} dupes)`);
    res.json(response);
  } catch (err) {
    console.error('Batch bets error:', err);
    res.status(500).json({ error: 'Failed to place bets' });
  }
});

// Mark bet result with calculated return amounts
router.post('/mark-result', (req, res) => {
  try {
    const { betId, result } = req.body;

    // Get bet to calculate return
    const bet = db.prepare('SELECT stake, opening_odds, closing_odds FROM bets WHERE id = ?').get(betId);
    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }

    const odds = bet.closing_odds || bet.opening_odds || 0;
    let returnAmount = 0;
    let profitLoss = 0;

    // Calculate returns based on result
    if (result === 'WIN') {
      returnAmount = bet.stake * odds;
      profitLoss = bet.stake * (odds - 1);
    } else if (result === 'PLACE') {
      const placeOdds = 1 + ((odds - 1) / 4);
      returnAmount = bet.stake * placeOdds;
      profitLoss = bet.stake * ((odds - 1) / 4);
    } else if (result === 'LOSS') {
      returnAmount = 0;
      profitLoss = -bet.stake;
    }

    db.prepare(`
      UPDATE bets
      SET result = ?, return_amount = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(result, returnAmount, profitLoss, betId);

    res.json({ success: true, returnAmount, profitLoss });
  } catch (err) {
    console.error('Mark result error:', err);
    res.status(500).json({ error: 'Failed to mark result' });
  }
});

// POST /api/bets/sportsbet - Alias to /batch for frontend compatibility
router.post('/sportsbet', (req, res) => {
  // Delegate to batch endpoint logic
  const batchReq = { body: { bets: req.body.bets || req.body } };
  const batchRes = {
    status: (code) => ({ json: (data) => res.status(code).json(data) }),
    json: (data) => res.json(data)
  };

  try {
    const { bets } = batchReq.body;
    if (!Array.isArray(bets)) {
      return res.status(400).json({ error: 'bets must be an array' });
    }

    const MIN_CONFIDENCE = 20;
    const MAX_ODDS = 100.0;
    const BLACKLIST_JOCKEYS = [];
    const BLACKLIST_TRAINERS = [];

    const inserted = [];
    const filtered = [];
    const duplicates = [];
    const stmt = db.prepare(`
      INSERT INTO bets (race_id, horse_id, jockey_id, trainer_id, bet_type, stake, opening_odds, closing_odds, ev_percent, clv_percent, confidence, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const placedBets = new Set();

    for (const bet of bets) {
      try {
        if (bet.confidence && bet.confidence < MIN_CONFIDENCE) {
          filtered.push(`${bet.horse}: confidence ${bet.confidence}% < ${MIN_CONFIDENCE}%`);
          continue;
        }

        let odds = bet.closing_odds || bet.opening_odds || bet.odds;

        // Reject negative odds immediately
        if (odds && odds < 0) {
          filtered.push(`${bet.horse}: odds ${odds} < 0 (invalid)`);
          continue;
        }

        if (!odds || odds <= 0) {
          try {
            const horse = db.prepare('SELECT strike_rate FROM horses WHERE name = ? LIMIT 1').get(bet.horse);
            if (horse && horse.strike_rate > 0) {
              odds = 1 / Math.max(0.01, horse.strike_rate);
            } else {
              odds = 2.0;
            }
          } catch (err) {
            odds = 2.0;
          }
        }
        if (odds > MAX_ODDS && odds > 0) {
          filtered.push(`${bet.horse}: odds ${odds} > ${MAX_ODDS}`);
          continue;
        }

        if (bet.jockey && BLACKLIST_JOCKEYS.includes(bet.jockey)) {
          filtered.push(`${bet.horse}: jockey ${bet.jockey} blacklisted`);
          continue;
        }

        if (bet.trainer && BLACKLIST_TRAINERS.includes(bet.trainer)) {
          filtered.push(`${bet.horse}: trainer ${bet.trainer} blacklisted`);
          continue;
        }

        const dupKey = `${bet.race_id}|${bet.horse}|${bet.jockey}`;
        if (placedBets.has(dupKey)) {
          duplicates.push(`${bet.track} R${bet.race_num}: ${bet.horse} (${bet.jockey})`);
          continue;
        }
        placedBets.add(dupKey);

        const existingBet = db.prepare(`
          SELECT id FROM bets
          WHERE race_id = ? AND horse_id = (SELECT id FROM horses WHERE name = ? LIMIT 1)
          AND (jockey_id IS NULL OR jockey_id = (SELECT id FROM jockeys WHERE name = ? LIMIT 1))
          AND status = 'ACTIVE'
          LIMIT 1
        `).get(bet.race_id, bet.horse, bet.jockey || 'Unknown');

        if (existingBet) {
          duplicates.push(`${bet.horse} (${bet.jockey}) already bet in this race`);
          continue;
        }

        let horseId = bet.horse_id;
        let jockeyId = bet.jockey_id;
        let trainerId = bet.trainer_id;

        if (!horseId && bet.horse) {
          db.prepare('INSERT OR IGNORE INTO horses (name) VALUES (?)').run(bet.horse);
          const horse = db.prepare('SELECT id FROM horses WHERE name = ?').get(bet.horse);
          horseId = horse?.id;
        }

        if (!jockeyId && bet.jockey) {
          db.prepare('INSERT OR IGNORE INTO jockeys (name) VALUES (?)').run(bet.jockey);
          const jockey = db.prepare('SELECT id FROM jockeys WHERE name = ?').get(bet.jockey);
          jockeyId = jockey?.id;
        }

        if (!trainerId && bet.trainer) {
          db.prepare('INSERT OR IGNORE INTO trainers (name) VALUES (?)').run(bet.trainer);
          const trainer = db.prepare('SELECT id FROM trainers WHERE name = ?').get(bet.trainer);
          trainerId = trainer?.id;
        }

        const EV_THRESHOLD = 0.10;
        let betEV = null;
        let shouldPlace = true;

        if (bet.confidence && odds && odds > 0) {
          const probability = bet.confidence / 100;
          betEV = (probability * odds) - 1;
          if (betEV < EV_THRESHOLD) {
            filtered.push(`${bet.horse}: EV ${(betEV * 100).toFixed(1)}% < ${(EV_THRESHOLD * 100).toFixed(1)}%`);
            shouldPlace = false;
          }
        }

        if (!shouldPlace) continue;

        let finalStake = bet.stake || 100;
        if (!bet.stake || bet.stake === 'auto') {
          finalStake = 100;
        }

        const result = stmt.run(
          bet.race_id || 0,
          horseId,
          jockeyId,
          trainerId,
          bet.bet_type || 'WIN',
          finalStake,
          bet.opening_odds || bet.odds,
          bet.closing_odds,
          betEV ? Math.round(betEV * 100) : (bet.ev_percent || 0),
          bet.clv_percent || 0,
          bet.confidence || 0,
          'ACTIVE'
        );

        inserted.push(result.lastInsertRowid);
      } catch (e) {
        console.error('Individual bet insert error:', e);
      }
    }

    const response = {
      success: true,
      placed: inserted.length,
      ids: inserted,
      filtered: filtered.length > 0 ? filtered : undefined,
      duplicates: duplicates.length > 0 ? duplicates : undefined,
      total_input: bets.length
    };

    console.log(`✅ [SPORTSBET] Placed ${inserted.length}/${bets.length} bets`);
    res.json(response);
  } catch (err) {
    console.error('Sportsbet error:', err);
    res.status(500).json({ error: 'Failed to place bets' });
  }
});

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
