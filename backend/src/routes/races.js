import express from 'express';
import db from '../db.js';
import RacePredictor from '../ml/predictor.js';

const router = express.Router();

router.get('/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const races = db.prepare(`
      SELECT id, track, race_number, race_name, distance, condition, prize_pool
      FROM races
      WHERE date = ?
      ORDER BY track, race_number
    `).all(today);

    res.json({ success: true, races: races || [] });
  } catch (err) {
    console.error('Races error:', err);
    res.status(500).json({ error: 'Failed to load races' });
  }
});

// Generate picks for a specific race using ML prediction model
router.get('/:id/picks', async (req, res) => {
  try {
    const raceId = parseInt(req.params.id);

    // Get race details
    const race = db.prepare(`
      SELECT id, track, date, race_number, race_name, distance, condition
      FROM races
      WHERE id = ?
    `).get(raceId);

    if (!race) {
      return res.status(404).json({ error: 'Race not found' });
    }

    // Use ML predictor to generate picks with probabilities and EV
    const allPicks = RacePredictor.generatePicksWithPredictions(raceId);

    if (!allPicks || allPicks.length === 0) {
      return res.json({ success: true, picks: [], filtered: 0 });
    }

    // EV Filter: Only return picks with positive expected value
    // Note: EV values in picks are decimals (e.g., 0.10 = 10% EV)
    const EV_THRESHOLD = 0.10; // 10% edge minimum (more selective with realistic probabilities)
    const picks = allPicks.filter(pick => {
      const pickEV = Math.max(pick.ev_win || -999, pick.ev_place || -999);
      return pickEV >= EV_THRESHOLD;
    });

    const filtered = allPicks.length - picks.length;
    if (filtered > 0) {
      console.log(`[PICKS] ${race.track} R${race.race_number}: Filtered out ${filtered} picks with EV < ${(EV_THRESHOLD).toFixed(2)} (decimal) or ${(EV_THRESHOLD * 100).toFixed(1)}%`);
    }

    // Try to fetch live Sportsbet odds from Racing.com TAB (as proxy)
    let tabOdds = {};
    try {
      const raceKey = `${race.track}-R${race.race_number}`;
      // Fetch TAB odds which closely match Sportsbet closing odds
      const response = await fetch(`http://localhost:3000/api/odds/racenet?track=${encodeURIComponent(race.track)}&raceNum=${race.race_number}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.odds) {
          tabOdds = data.odds[raceKey] || {};
        }
      }
    } catch (err) {
      // Continue without live odds if fetch fails
      console.warn('Failed to fetch live odds for race', err.message);
    }

    // Format picks for response with live odds merged in
    const formattedPicks = picks.map((pick, index) => {
      // Try to find live odds for this horse
      let liveOdds = pick.odds; // Default to DB odds if available

      if (tabOdds.runners) {
        const horseOdds = tabOdds.runners.find(r =>
          r.name?.toLowerCase() === pick.horse.toLowerCase()
        );
        if (horseOdds?.price?.decimal) {
          liveOdds = horseOdds.price.decimal;
          // Update DB with live odds for future reference
          try {
            db.prepare(`
              UPDATE race_runners
              SET starting_odds = ?
              WHERE race_id = ? AND horse_id = (SELECT id FROM horses WHERE name = ? LIMIT 1)
            `).run(liveOdds, raceId, pick.horse);
          } catch (updateErr) {
            // Silently fail if update doesn't work
          }
        }
      }

      return {
        rank: index + 1,
        raceId: race.id,
        track: race.track,
        raceNum: race.race_number,
        raceName: race.race_name,
        horse: pick.horse,
        jockey: pick.jockey,
        trainer: pick.trainer,
        odds: liveOdds || pick.odds || 0,
        predictedWinProbability: pick.predicted_win_prob,
        expectedValueWin: pick.ev_win,
        expectedValuePlace: pick.ev_place,
        recommendedBetType: pick.best_bet,
        recommendation: pick.recommendation,
        stats: {
          distance: race.distance,
          condition: race.condition,
        }
      };
    });

    res.json({
      success: true,
      picks: formattedPicks,
      stats: {
        total: allPicks.length,
        qualified: picks.length,
        filtered: filtered,
        filterReason: `EV < ${(EV_THRESHOLD * 100).toFixed(1)}%`
      }
    });
  } catch (err) {
    console.error('Picks generation error:', err);
    res.status(500).json({ error: 'Failed to generate picks' });
  }
});

export default router;
