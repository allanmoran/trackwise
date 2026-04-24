/**
 * Feature Engineering for Horse Racing Predictions
 *
 * Extracts meaningful features from historical data:
 * - Distance preferences (win rate at different distances)
 * - Track preferences (win rate at specific tracks)
 * - Track condition preferences (firm/good/soft/heavy)
 * - Race type preferences (maiden/benchmark/handicap)
 * - Class level performance
 * - BSP vs actual win rate (identify overpriced/underpriced horses)
 * - Jockey x Horse combinations
 * - Trainer x Horse combinations
 */

import db from '../db.js';

export class FeatureEngineer {
  /**
   * Calculate distance preference for a horse
   * Returns win rate at specific distances
   */
  static getDistancePreference(horseId) {
    const distanceStats = db.prepare(`
      SELECT
        r.distance,
        COUNT(*) as races,
        SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN rr.result IN ('WIN', 'PLACE') THEN 1 ELSE 0 END) as places
      FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE rr.horse_id = ? AND rr.result IS NOT NULL
      GROUP BY r.distance
      ORDER BY races DESC
    `).all(horseId);

    if (distanceStats.length === 0) return null;

    // Find best distance
    const best = distanceStats.reduce((max, d) =>
      (d.races >= 3 && (d.wins / d.races) > (max.wins / max.races)) ? d : max
    );

    return {
      bestDistance: best.distance,
      winRateAtBest: best.races > 0 ? (best.wins / best.races) : 0,
      racesAtBest: best.races,
      allDistances: distanceStats.map(d => ({
        distance: d.distance,
        races: d.races,
        winRate: d.races > 0 ? (d.wins / d.races).toFixed(3) : 0,
        placeRate: d.races > 0 ? (d.places / d.races).toFixed(3) : 0
      }))
    };
  }

  /**
   * Calculate track preference for a horse
   */
  static getTrackPreference(horseId) {
    const trackStats = db.prepare(`
      SELECT
        r.track,
        COUNT(*) as races,
        SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN rr.result IN ('WIN', 'PLACE') THEN 1 ELSE 0 END) as places
      FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE rr.horse_id = ? AND rr.result IS NOT NULL
      GROUP BY r.track
      ORDER BY races DESC
    `).all(horseId);

    if (trackStats.length === 0) return null;

    const best = trackStats.reduce((max, t) =>
      (t.races >= 2 && (t.wins / t.races) > (max.wins / max.races)) ? t : max
    );

    return {
      bestTrack: best.track,
      winRateAtBest: best.races > 0 ? (best.wins / best.races) : 0,
      racesAtBest: best.races,
      allTracks: trackStats.map(t => ({
        track: t.track,
        races: t.races,
        winRate: t.races > 0 ? (t.wins / t.races).toFixed(3) : 0,
        placeRate: t.races > 0 ? (t.places / t.races).toFixed(3) : 0
      }))
    };
  }

  /**
   * Calculate win rate by race type/condition
   */
  static getRaceTypePreference(horseId) {
    const typeStats = db.prepare(`
      SELECT
        r.race_type,
        r.condition,
        COUNT(*) as races,
        SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins
      FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE rr.horse_id = ? AND rr.result IS NOT NULL
      GROUP BY r.race_type, r.condition
      ORDER BY races DESC
    `).all(horseId);

    if (typeStats.length === 0) return null;

    return typeStats.map(t => ({
      raceType: t.race_type,
      condition: t.condition,
      races: t.races,
      winRate: t.races > 0 ? (t.wins / t.races).toFixed(3) : 0,
      sampleSize: t.races >= 3 ? 'adequate' : 'small'
    }));
  }

  /**
   * Identify overpriced/underpriced horses
   * Compare BSP odds to actual win rate
   */
  static getOddsEfficiency(horseId, minRaces = 10) {
    const betsData = db.prepare(`
      SELECT
        COUNT(*) as total_bets,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
        AVG(opening_odds) as avg_opening_odds,
        AVG(closing_odds) as avg_closing_odds
      FROM bets
      WHERE horse_id = ? AND result IS NOT NULL
    `).get(horseId);

    if (!betsData || betsData.total_bets < minRaces) {
      return null;
    }

    const actualWinRate = betsData.wins / betsData.total_bets;
    const impliedWinRate = 1 / betsData.avg_opening_odds;
    const efficiency = (actualWinRate / impliedWinRate) * 100;

    return {
      totalBets: betsData.total_bets,
      actualWins: betsData.wins,
      actualWinRate: (actualWinRate * 100).toFixed(1),
      impliedWinRate: (impliedWinRate * 100).toFixed(1),
      efficiency: efficiency.toFixed(1),
      assessment: efficiency > 110 ? 'UNDERPRICED' : efficiency < 90 ? 'OVERPRICED' : 'FAIRLY_PRICED',
      avgOpeningOdds: betsData.avg_opening_odds?.toFixed(2),
      avgClosingOdds: betsData.avg_closing_odds?.toFixed(2)
    };
  }

  /**
   * Jockey x Horse combination performance
   * Some jockeys ride certain horses better
   */
  static getJockeyHorseCombination(horseId, jockeyId) {
    const combo = db.prepare(`
      SELECT
        COUNT(*) as races,
        SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
        h.name as horse,
        j.name as jockey
      FROM race_runners rr
      JOIN horses h ON rr.horse_id = h.id
      JOIN jockeys j ON rr.jockey_id = j.id
      WHERE rr.horse_id = ? AND rr.jockey_id = ? AND rr.result IS NOT NULL
    `).get(horseId, jockeyId);

    if (!combo || combo.races < 2) return null;

    return {
      horse: combo.horse,
      jockey: combo.jockey,
      races: combo.races,
      wins: combo.wins,
      winRate: (combo.wins / combo.races).toFixed(3),
      sampleSize: combo.races >= 5 ? 'good' : 'small'
    };
  }

  /**
   * Trainer x Horse combination performance
   */
  static getTrainerHorseCombination(horseId, trainerId) {
    const combo = db.prepare(`
      SELECT
        COUNT(*) as races,
        SUM(CASE WHEN rr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
        h.name as horse,
        t.name as trainer
      FROM race_runners rr
      JOIN horses h ON rr.horse_id = h.id
      JOIN trainers t ON rr.trainer_id = t.id
      WHERE rr.horse_id = ? AND rr.trainer_id = ? AND rr.result IS NOT NULL
    `).get(horseId, trainerId);

    if (!combo || combo.races < 2) return null;

    return {
      horse: combo.horse,
      trainer: combo.trainer,
      races: combo.races,
      wins: combo.wins,
      winRate: (combo.wins / combo.races).toFixed(3),
      sampleSize: combo.races >= 5 ? 'good' : 'small'
    };
  }

  /**
   * Generate comprehensive feature vector for a horse
   * Used as input to ML model
   */
  static generateFeatureVector(horseId, horseData, jockeyId, trainerId) {
    if (!horseData) return null;

    const baseStrikeRate = horseData.strike_rate || 0.15;
    const distancePrefs = this.getDistancePreference(horseId);
    const trackPrefs = this.getTrackPreference(horseId);
    const oddsEff = this.getOddsEfficiency(horseId);
    const jockeyCombo = this.getJockeyHorseCombination(horseId, jockeyId);
    const trainerCombo = this.getTrainerHorseCombination(horseId, trainerId);

    // Calculate composite score
    let compositeScore = baseStrikeRate * 100;

    // Boost for distance preference (if significant)
    if (distancePrefs && distancePrefs.bestDistance) {
      const distBoost = parseFloat(distancePrefs.winRateAtBest) / baseStrikeRate;
      compositeScore *= Math.min(1.2, distBoost); // Max 20% boost
    }

    // Boost for track preference (if significant)
    if (trackPrefs && trackPrefs.bestTrack) {
      const trackBoost = parseFloat(trackPrefs.winRateAtBest) / baseStrikeRate;
      compositeScore *= Math.min(1.15, trackBoost); // Max 15% boost
    }

    // Boost for proven jockey combo
    if (jockeyCombo && parseFloat(jockeyCombo.winRate) > baseStrikeRate) {
      compositeScore *= 1.08; // 8% boost
    }

    // Boost for proven trainer combo
    if (trainerCombo && parseFloat(trainerCombo.winRate) > baseStrikeRate) {
      compositeScore *= 1.08; // 8% boost
    }

    return {
      horseId,
      baseStrikeRate: (baseStrikeRate * 100).toFixed(1),
      compositeScore: Math.min(100, compositeScore).toFixed(1),
      distancePreference: distancePrefs,
      trackPreference: trackPrefs,
      oddsEfficiency: oddsEff,
      jockeyCombo,
      trainerCombo,
      features: {
        hasDistanceEdge: distancePrefs && parseFloat(distancePrefs.winRateAtBest) > baseStrikeRate,
        hasTrackEdge: trackPrefs && parseFloat(trackPrefs.winRateAtBest) > baseStrikeRate,
        jockeyComboEdge: jockeyCombo && parseFloat(jockeyCombo.winRate) > baseStrikeRate,
        trainerComboEdge: trainerCombo && parseFloat(trainerCombo.winRate) > baseStrikeRate,
        oddsEdge: oddsEff && oddsEff.assessment === 'UNDERPRICED'
      }
    };
  }

  /**
   * Find horses with proven edges across multiple dimensions
   */
  static findHighConfidenceHorses(minRaces = 20) {
    const horses = db.prepare(`
      SELECT id, name, strike_rate, career_bets
      FROM horses
      WHERE career_bets >= ?
      ORDER BY strike_rate DESC
      LIMIT 50
    `).all(minRaces);

    const confident = [];

    for (const horse of horses) {
      const distPrefs = this.getDistancePreference(horse.id);
      const trackPrefs = this.getTrackPreference(horse.id);
      const oddsEff = this.getOddsEfficiency(horse.id, 5);

      let edgeCount = 0;
      if (distPrefs && parseFloat(distPrefs.winRateAtBest) > horse.strike_rate * 1.2) edgeCount++;
      if (trackPrefs && parseFloat(trackPrefs.winRateAtBest) > horse.strike_rate * 1.2) edgeCount++;
      if (oddsEff && oddsEff.assessment === 'UNDERPRICED') edgeCount++;

      if (edgeCount >= 2) {
        confident.push({
          horse: horse.name,
          horseId: horse.id,
          baseStrikeRate: (horse.strike_rate * 100).toFixed(1),
          edgeCount,
          edges: {
            distance: distPrefs ? 'YES' : 'NO',
            track: trackPrefs ? 'YES' : 'NO',
            odds: oddsEff?.assessment || 'NO'
          }
        });
      }
    }

    return confident.sort((a, b) => b.edgeCount - a.edgeCount);
  }
}

export default FeatureEngineer;
