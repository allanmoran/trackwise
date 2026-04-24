/**
 * Market Intelligence Engine
 * Real-time analysis of market movements, BSP prediction, and informed betting detection
 * Based on Betfair's market movement and BSP analysis research
 */

import db from '../db.js';

export class MarketIntelligence {
  /**
   * Analyze market movement patterns for a horse
   * Returns trend, momentum, and signal strength
   */
  static analyzeMarketMovement(horseId) {
    try {
      // Get historical price movements for this horse (when it won/placed)
      const movements = db.prepare(`
        SELECT
          rr.starting_odds as opening_odds,
          rr.closing_odds as final_odds,
          rr.result,
          r.race_time,
          r.distance
        FROM race_runners rr
        JOIN races r ON rr.race_id = r.id
        WHERE rr.horse_id = ? AND rr.result IS NOT NULL
        ORDER BY r.date DESC
        LIMIT 100
      `).all(horseId);

      if (movements.length < 5) {
        return {
          horseId,
          status: 'INSUFFICIENT_DATA',
          message: 'Need 5+ races to analyze movement patterns',
          samplesAvailable: movements.length
        };
      }

      // Calculate movement statistics
      const movementStats = movements.map(m => {
        if (!m.opening_odds || !m.final_odds) return null;
        return {
          priceChange: (m.final_odds - m.opening_odds),
          priceChangePercent: ((m.final_odds - m.opening_odds) / m.opening_odds) * 100,
          finalOdds: m.final_odds,
          openingOdds: m.opening_odds,
          result: m.result,
          direction: m.final_odds < m.opening_odds ? 'DOWN' : 'UP'
        };
      }).filter(x => x);

      // When this horse WON: what was average price movement?
      const winMovements = movementStats.filter(m => m.result === 'WIN');
      const lossMovements = movementStats.filter(m => m.result === 'LOSS');

      const avgWinMove = winMovements.length > 0
        ? winMovements.reduce((sum, m) => sum + m.priceChangePercent, 0) / winMovements.length
        : 0;

      const avgLossMove = lossMovements.length > 0
        ? lossMovements.reduce((sum, m) => sum + m.priceChangePercent, 0) / lossMovements.length
        : 0;

      // Market tendency: does price typically drop (into favorites) or rise?
      const avgAllMove = movementStats.reduce((sum, m) => sum + m.priceChangePercent, 0) / movementStats.length;

      // Price movement momentum: is it accelerating?
      const recentMoves = movementStats.slice(0, 10).map(m => m.priceChangePercent);
      const olderMoves = movementStats.slice(-10).map(m => m.priceChangePercent);

      const avgRecentMove = recentMoves.reduce((a, b) => a + b, 0) / recentMoves.length;
      const avgOlderMove = olderMoves.reduce((a, b) => a + b, 0) / olderMoves.length;
      const momentum = avgRecentMove - avgOlderMove;

      return {
        horseId,
        status: 'SUCCESS',
        samples: movementStats.length,
        averageMovement: avgAllMove.toFixed(2) + '%',
        movementWhenWon: avgWinMove.toFixed(2) + '%',
        movementWhenLost: avgLossMove.toFixed(2) + '%',
        recentMomentum: momentum.toFixed(2) + '%',
        trend: momentum > 0 ? 'ACCELERATING' : momentum < -0.5 ? 'DECELERATING' : 'STABLE',
        interpretation: this.interpretMarketMovement(avgWinMove, avgLossMove, momentum),
        samples: {
          total: movementStats.length,
          wins: winMovements.length,
          losses: lossMovements.length
        }
      };
    } catch (err) {
      return { horseId, status: 'ERROR', message: err.message };
    }
  }

  /**
   * Predict final BSP from opening odds using historical market dynamics
   */
  static predictBSP(horseId, openingOdds) {
    try {
      // Get historical BSP movements for this horse
      const movements = db.prepare(`
        SELECT
          rr.starting_odds as opening,
          rr.closing_odds as bsp,
          rr.result
        FROM race_runners rr
        WHERE rr.horse_id = ? AND rr.starting_odds IS NOT NULL
          AND rr.closing_odds IS NOT NULL AND rr.result IS NOT NULL
        ORDER BY rr.id DESC
        LIMIT 50
      `).all(horseId);

      if (movements.length < 5) {
        return {
          horseId,
          openingOdds,
          status: 'INSUFFICIENT_DATA',
          message: 'Need 5+ BSP samples to predict',
          fallback: openingOdds // Return opening odds as fallback
        };
      }

      // Calculate BSP movement factor: (BSP - Opening) / Opening
      const bspMovements = movements.map(m => {
        if (!m.opening || !m.bsp) return null;
        return {
          moveFactor: (m.bsp - m.opening) / m.opening,
          result: m.result,
          bsp: m.bsp,
          opening: m.opening
        };
      }).filter(x => x);

      // Different prediction for wins vs losses
      const winBSPs = bspMovements.filter(m => m.result === 'WIN');
      const lossBSPs = bspMovements.filter(m => m.result === 'LOSS');

      const avgWinFactor = winBSPs.length > 0
        ? winBSPs.reduce((sum, m) => sum + m.moveFactor, 0) / winBSPs.length
        : 0;

      const avgLossFactor = lossBSPs.length > 0
        ? lossBSPs.reduce((sum, m) => sum + m.moveFactor, 0) / lossBSPs.length
        : 0;

      const avgAllFactor = bspMovements.reduce((sum, m) => sum + m.moveFactor, 0) / bspMovements.length;

      // Prediction: opening * (1 + avgMoveFactor)
      const predictedBSP = openingOdds * (1 + avgAllFactor);

      // Confidence in prediction (lower variance = higher confidence)
      const variance = bspMovements.reduce((sum, m) =>
        sum + Math.pow(m.moveFactor - avgAllFactor, 2), 0
      ) / bspMovements.length;
      const stdDev = Math.sqrt(variance);
      const predictionConfidence = Math.max(20, Math.min(95, 90 - (stdDev * 100)));

      // Price range: ±1 std dev
      const lowerBound = Math.max(1.01, predictedBSP - (openingOdds * stdDev));
      const upperBound = predictedBSP + (openingOdds * stdDev);

      return {
        horseId,
        openingOdds: openingOdds.toFixed(2),
        predictedBSP: predictedBSP.toFixed(2),
        predictionRange: {
          lower: lowerBound.toFixed(2),
          upper: upperBound.toFixed(2)
        },
        confidence: predictionConfidence.toFixed(0) + '%',
        movement: {
          averageMoveFactor: (avgAllFactor * 100).toFixed(1) + '%',
          whenWon: (avgWinFactor * 100).toFixed(1) + '%',
          whenLost: (avgLossFactor * 100).toFixed(1) + '%'
        },
        samples: {
          total: bspMovements.length,
          wins: winBSPs.length,
          losses: lossBSPs.length
        },
        interpretation: this.interpretBSPPrediction(openingOdds, predictedBSP),
        status: 'SUCCESS'
      };
    } catch (err) {
      return { horseId, openingOdds, status: 'ERROR', message: err.message };
    }
  }

  /**
   * Detect informed betting signals in a race
   * The "#theyknow" phenomenon - when professionals reveal information
   */
  static detectInformedBetting(raceId) {
    try {
      const race = db.prepare(`
        SELECT id, track, race_number, distance
        FROM races WHERE id = ?
      `).get(raceId);

      if (!race) {
        return { raceId, status: 'NOT_FOUND', message: 'Race not found' };
      }

      // Get all runners in this race with odds
      const runners = db.prepare(`
        SELECT
          rr.id,
          rr.horse_id,
          h.name as horse,
          rr.starting_odds,
          rr.closing_odds,
          h.strike_rate,
          rr.result
        FROM race_runners rr
        JOIN horses h ON rr.horse_id = h.id
        WHERE rr.race_id = ?
        ORDER BY rr.starting_odds ASC
      `).all(raceId);

      if (runners.length < 4) {
        return { raceId, status: 'INSUFFICIENT_RUNNERS', message: 'Race not fully loaded' };
      }

      // Analyze each runner for informed betting signals
      const signals = runners.map(runner => {
        if (!runner.starting_odds || !runner.closing_odds) {
          return null;
        }

        const priceMove = runner.starting_odds - runner.closing_odds;
        const priceMovePercent = (priceMove / runner.starting_odds) * 100;
        const strikeRate = runner.strike_rate || 0;

        // Signal strength: large drop with good strike rate = informed backing
        const signalStrength = this.calculateSignalStrength(
          priceMovePercent,
          strikeRate,
          runner.result === 'WIN'
        );

        return {
          horseId: runner.horse_id,
          horse: runner.horse,
          openingOdds: runner.starting_odds?.toFixed(2),
          closingOdds: runner.closing_odds?.toFixed(2),
          priceMove: priceMove.toFixed(2),
          priceMovePercent: priceMovePercent.toFixed(1) + '%',
          strikeRate: (strikeRate * 100).toFixed(1) + '%',
          signalStrength,
          signalType: this.classifySignal(priceMovePercent, strikeRate),
          actualResult: runner.result,
          wasCorrect: this.wasSignalCorrect(signalStrength, runner.result)
        };
      }).filter(x => x);

      // Sort by signal strength (strongest first)
      signals.sort((a, b) => b.signalStrength - a.signalStrength);

      // Race-level analysis
      const strongSignals = signals.filter(s => s.signalStrength >= 70);
      const falseSignals = signals.filter(s => s.signalStrength >= 70 && !s.wasCorrect);

      return {
        success: true,
        raceId,
        race: {
          track: race.track,
          raceNumber: race.race_number,
          distance: race.distance
        },
        runners: runners.length,
        signals,
        summary: {
          strongSignalsCount: strongSignals.length,
          accuracyOfStrongSignals: strongSignals.length > 0
            ? (((strongSignals.length - falseSignals.length) / strongSignals.length) * 100).toFixed(1) + '%'
            : 'N/A',
          topSignal: signals[0],
          interpretation: this.interpretRaceSignals(signals, strongSignals)
        }
      };
    } catch (err) {
      return { raceId, status: 'ERROR', message: err.message };
    }
  }

  /**
   * Calculate signal strength (0-100)
   * Combination of price drop magnitude and strike rate
   */
  static calculateSignalStrength(priceMovePercent, strikeRate, wasWinner) {
    // Base: large price drop = stronger signal
    // Modifier: high strike rate = more trustworthy
    // Bonus: if horse actually won

    const dropSignal = Math.min(50, Math.abs(priceMovePercent)); // Max 50 points from drop
    const strikeRateSignal = (strikeRate * 100) * 0.4; // Max 40 points from strike rate
    const winnerBonus = wasWinner ? 10 : 0; // 10 points if horse won

    return Math.min(100, dropSignal + strikeRateSignal + winnerBonus);
  }

  /**
   * Classify the type of signal
   */
  static classifySignal(priceMovePercent, strikeRate) {
    if (priceMovePercent <= -10 && strikeRate > 0.30) {
      return 'STRONG_INFORMED_BACKING';
    } else if (priceMovePercent <= -5 && strikeRate > 0.25) {
      return 'MODERATE_INFORMED_BACKING';
    } else if (priceMovePercent >= 5 && strikeRate < 0.15) {
      return 'WITHDRAWAL_SIGNAL';
    } else if (priceMovePercent <= -2 || strikeRate > 0.20) {
      return 'WEAK_POSITIVE_SIGNAL';
    }
    return 'NO_SIGNAL';
  }

  /**
   * Was the signal correct? (Did the horse win/place?)
   */
  static wasSignalCorrect(signalStrength, result) {
    if (signalStrength < 50) return null; // Weak signal, ignore
    return result === 'WIN' || result === 'PLACE';
  }

  /**
   * Interpret market movement for a horse
   */
  static interpretMarketMovement(avgWinMove, avgLossMove, momentum) {
    let interpretation = [];

    if (avgWinMove < -2) {
      interpretation.push('When this horse WINS, price typically drops (market favors it)');
    } else if (avgWinMove > 2) {
      interpretation.push('When this horse WINS, price typically rises (contrarian edge)');
    }

    if (avgLossMove > 1) {
      interpretation.push('When this horse LOSES, price typically rises (market was bullish)');
    }

    if (Math.abs(momentum) > 1) {
      interpretation.push(`Trend is ${momentum > 0 ? 'accelerating' : 'decelerating'} (${Math.abs(momentum).toFixed(1)}% change)`);
    }

    if (interpretation.length === 0) {
      interpretation.push('Market movement patterns are relatively stable for this horse');
    }

    return interpretation.join(' | ');
  }

  /**
   * Interpret BSP prediction
   */
  static interpretBSPPrediction(openingOdds, predictedBSP) {
    const move = predictedBSP - openingOdds;
    const movePercent = (move / openingOdds) * 100;

    if (movePercent < -5) {
      return `Market expects this horse to shorten by ${Math.abs(movePercent).toFixed(1)}% (favorable for backing)`;
    } else if (movePercent > 5) {
      return `Market expects this horse to drift by ${movePercent.toFixed(1)}% (drifting value)`;
    } else {
      return `BSP expected near opening odds (stable market view)`;
    }
  }

  /**
   * Interpret race-level signals
   */
  static interpretRaceSignals(allSignals, strongSignals) {
    if (strongSignals.length === 0) {
      return 'No strong informed betting signals detected in this race';
    }

    const descriptions = strongSignals.slice(0, 3).map(s =>
      `${s.horse} shows strong signal (${s.signalStrength.toFixed(0)} strength)`
    );

    return descriptions.join('; ');
  }

  /**
   * Calculate confidence boost based on market signals
   * Used to adjust model confidence scores
   */
  static getConfidenceBoost(horseId, openingOdds, modelConfidence) {
    try {
      const movement = this.analyzeMarketMovement(horseId);
      const bspPred = this.predictBSP(horseId, openingOdds);

      let boost = 0;

      // Boost if recent momentum is accelerating in positive direction
      if (movement.status === 'SUCCESS' && movement.trend === 'ACCELERATING') {
        const momentum = parseFloat(movement.recentMomentum);
        if (momentum < 0) { // Price dropping = positive signal
          boost += Math.min(10, Math.abs(momentum) * 2);
        }
      }

      // Boost if BSP predicted to be better than opening odds
      if (bspPred.status === 'SUCCESS') {
        const predictedBSP = parseFloat(bspPred.predictedBSP);
        const confidence = parseFloat(bspPred.confidence);

        if (predictedBSP < openingOdds && confidence > 70) {
          const oddsGain = ((openingOdds - predictedBSP) / predictedBSP) * 100;
          boost += Math.min(15, oddsGain * 0.5);
        }
      }

      const boostedConfidence = Math.min(100, modelConfidence + boost);

      return {
        originalConfidence: modelConfidence,
        boost: boost.toFixed(1),
        boostedConfidence: boostedConfidence.toFixed(0),
        reason: boost > 0 ? this.getBoostReason(movement, bspPred) : 'No market signals detected'
      };
    } catch (err) {
      return {
        originalConfidence: modelConfidence,
        boost: '0',
        boostedConfidence: modelConfidence.toFixed(0),
        reason: 'Could not calculate market-based boost'
      };
    }
  }

  /**
   * Explain why confidence was boosted
   */
  static getBoostReason(movement, bspPred) {
    const reasons = [];

    if (movement.status === 'SUCCESS' && movement.trend === 'ACCELERATING') {
      reasons.push('Market momentum accelerating');
    }

    if (bspPred.status === 'SUCCESS') {
      const move = parseFloat(bspPred.movement.averageMoveFactor);
      if (move < -2) {
        reasons.push(`BSP typically tightens (${move.toFixed(1)}%)`);
      }
    }

    return reasons.length > 0 ? reasons.join(' + ') : 'Market signals present';
  }
}

export default MarketIntelligence;
