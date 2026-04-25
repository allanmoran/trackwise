/**
 * PHASE 2A: Ensemble Predictor - 3 Sub-Models
 *
 * Combines three independent prediction models:
 * - Form Model (45%): Recent form, momentum, condition fit
 * - Market Model (35%): Odds, odds movement, field strength
 * - KB Model (20%): Knowledge base stats, historical performance
 */

import db from '../db.js';
import { RacePredictor } from './predictor.js';

export class EnsemblePredictor {
  /**
   * Form-based sub-model
   * Uses recent form vector, track condition fit, distance preference
   */
  static formModelScore(horseId, raceId) {
    const horse = db.prepare('SELECT * FROM horses WHERE id = ?').get(horseId);
    if (!horse) return 0;

    let score = 0;

    // Recent form vector (strongest signal)
    const formVector = RacePredictor.getWeightedFormVector(horseId);
    score += formVector * 0.50; // 50% of form model

    // Track condition fit
    const race = db.prepare('SELECT track_condition, distance FROM races WHERE id = ?').get(raceId);
    if (race?.track_condition) {
      const conditionStats = db.prepare(`
        SELECT COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins, COUNT(*) as total
        FROM race_runners rr
        JOIN races r ON rr.race_id = r.id
        WHERE rr.horse_id = ? AND r.track_condition = ?
      `).get(horseId, race.track_condition);

      if (conditionStats?.total > 2) {
        const conditionWR = conditionStats.wins / conditionStats.total;
        score += Math.min(0.30, conditionWR * 0.30);
      }
    }

    // Distance preference
    if (race?.distance) {
      const distanceStats = db.prepare(`
        SELECT COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins, COUNT(*) as total
        FROM race_runners rr
        JOIN races r ON rr.race_id = r.id
        WHERE rr.horse_id = ? AND r.distance = ?
      `).get(horseId, race.distance);

      if (distanceStats?.total > 0) {
        const distanceWR = distanceStats.wins / distanceStats.total;
        score += Math.min(0.20, distanceWR * 0.20);
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Market-based sub-model
   * Uses current odds, odds movement, avg_odds, field strength
   */
  static marketModelScore(horseId, raceId) {
    const runner = db.prepare(`
      SELECT starting_odds, closing_odds FROM race_runners
      WHERE horse_id = ? AND race_id = ?
    `).get(horseId, raceId);

    const horse = db.prepare('SELECT avg_odds FROM horses WHERE id = ?').get(horseId);
    if (!runner || !horse) return 0;

    let score = 0;

    // Starting odds (inverse = implied probability)
    if (runner.starting_odds && runner.starting_odds > 0) {
      const impliedProb = 1.0 / runner.starting_odds;
      score += Math.min(0.40, impliedProb * 0.40);
    }

    // Odds movement (positive if shortened)
    if (runner.starting_odds && runner.closing_odds) {
      const drift = (runner.closing_odds - runner.starting_odds) / runner.starting_odds;
      if (drift < 0) { // Odds shortened = positive signal
        score += Math.min(0.25, Math.abs(drift) * 0.25);
      }
    }

    // Average odds track record
    if (horse.avg_odds && horse.avg_odds > 0) {
      const avgImplied = 1.0 / horse.avg_odds;
      score += Math.min(0.35, avgImplied * 0.35);
    }

    return Math.min(1.0, score);
  }

  /**
   * KB (Knowledge Base) sub-model
   * Uses KB stats for track/distance/barrier combinations
   */
  static kbModelScore(horseId, raceId) {
    const race = db.prepare('SELECT track, distance FROM races WHERE id = ?').get(raceId);
    const runner = db.prepare('SELECT barrier FROM race_runners WHERE horse_id = ? AND race_id = ?').get(horseId, raceId);

    if (!race || !runner) return 0;

    let score = 0;

    // Track win rate from KB
    const trackStats = db.prepare(`
      SELECT COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins, COUNT(*) as total
      FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE rr.horse_id = ? AND r.track = ?
    `).get(horseId, race.track);

    if (trackStats?.total > 0) {
      const trackWR = trackStats.wins / trackStats.total;
      score += Math.min(0.45, trackWR * 0.45);
    }

    // Barrier performance at track+distance
    if (runner.barrier) {
      const barrierStats = db.prepare(`
        SELECT COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins, COUNT(*) as total
        FROM race_runners rr
        JOIN races r ON rr.race_id = r.id
        WHERE rr.horse_id = ? AND r.track = ? AND rr.barrier = ?
      `).get(horseId, race.track, runner.barrier);

      if (barrierStats?.total > 1) {
        const barrierWR = barrierStats.wins / barrierStats.total;
        score += Math.min(0.35, barrierWR * 0.35);
      }
    }

    // Distance stats at this track
    const distanceStats = db.prepare(`
      SELECT COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins, COUNT(*) as total
      FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE rr.horse_id = ? AND r.track = ? AND r.distance = ?
    `).get(horseId, race.track, race.distance);

    if (distanceStats?.total > 0) {
      const distanceWR = distanceStats.wins / distanceStats.total;
      score += Math.min(0.20, distanceWR * 0.20);
    }

    return Math.min(1.0, score);
  }

  /**
   * Ensemble prediction with dynamic weights
   */
  static predict(horseId, raceId, openingOdds) {
    const formScore = this.formModelScore(horseId, raceId);
    const marketScore = this.marketModelScore(horseId, raceId);
    const kbScore = this.kbModelScore(horseId, raceId);

    // Get dynamic weights from DB (with fallback defaults)
    const weights = db.prepare(`
      SELECT model_name, weight FROM model_weights
      WHERE model_name IN ('form', 'market', 'kb')
      ORDER BY model_name
    `).all();

    let formWeight = 0.45, marketWeight = 0.35, kbWeight = 0.20;

    for (const w of weights) {
      if (w.model_name === 'form') formWeight = w.weight;
      else if (w.model_name === 'market') marketWeight = w.weight;
      else if (w.model_name === 'kb') kbWeight = w.weight;
    }

    // Normalize weights
    const total = formWeight + marketWeight + kbWeight;
    const normalizedWeights = {
      form: formWeight / total,
      market: marketWeight / total,
      kb: kbWeight / total
    };

    // Weighted ensemble
    const ensembleScore = (
      formScore * normalizedWeights.form +
      marketScore * normalizedWeights.market +
      kbScore * normalizedWeights.kb
    );

    return Math.min(1.0, Math.max(0, ensembleScore));
  }
}

export default EnsemblePredictor;
