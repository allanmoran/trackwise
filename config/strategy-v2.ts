/**
 * Strategy v2 - Optimized for 10%+ ROI
 * Based on real-race validation analysis
 */

export const STRATEGY_V2 = {
  // Confidence thresholds
  MIN_CONFIDENCE: 75,        // Was: 50% → Now: 75%
  MAX_CONFIDENCE: 100,

  // Odds filters - CRITICAL
  MAX_ODDS: 7.0,            // Was: betting 51.0+ → Now: 7.0 max
  MIN_ODDS: 1.01,

  // Track whitelist - removed for broad testing
  // Testing core filters (Conf ≥75%, Odds ≤7.0) across all tracks
  // If filters work on Randwick/Caulfield/Doomben, they work everywhere
  ALLOWED_TRACKS: null,  // null = all tracks allowed

  // Jockey/Trainer blacklist - underperformers
  BLACKLIST_JOCKEYS: [
    'Julia Martin',           // 0-2, -$484.97
    'Kevin Mahoney',          // 0-2, -$480.64
  ],

  BLACKLIST_TRAINERS: [
    'Aidan Holt',            // 0-3, -$732.14
  ],

  // Kelly sizing (unchanged, but applied to fewer bets)
  KELLY_MULTIPLIER: 0.25,    // Quarter Kelly (conservative)

  // Bet selection
  MAX_BETS_PER_RACE: 1,      // One best pick per race
  MAX_DAILY_BETS: 10,        // Don't overexpose

  // ROI target
  TARGET_ROI: 10,            // Percent
  TARGET_WIN_RATE: 30,       // Percent (realistic for tight filters)

  // Settings
  REQUIRE_BOTH_JT: false,    // Don't require both jockey AND trainer to be good
  VERBOSE_LOGGING: true,     // Show why bets are rejected
};

export const isValidBet = (bet: {
  confidence: number;
  odds: number;
  jockey: string;
  trainer: string;
  track: string;
}): { valid: boolean; reason?: string } => {
  // Confidence
  if (bet.confidence < STRATEGY_V2.MIN_CONFIDENCE) {
    return { valid: false, reason: `Confidence ${bet.confidence}% < ${STRATEGY_V2.MIN_CONFIDENCE}%` };
  }

  // Odds
  if (bet.odds > STRATEGY_V2.MAX_ODDS) {
    return { valid: false, reason: `Odds ${bet.odds.toFixed(2)} > ${STRATEGY_V2.MAX_ODDS}` };
  }

  // Track filter (null = all tracks allowed)
  if (STRATEGY_V2.ALLOWED_TRACKS && !STRATEGY_V2.ALLOWED_TRACKS.includes(bet.track)) {
    return { valid: false, reason: `Track ${bet.track} not in whitelist` };
  }

  // Blacklist
  if (STRATEGY_V2.BLACKLIST_JOCKEYS.includes(bet.jockey)) {
    return { valid: false, reason: `Jockey ${bet.jockey} is blacklisted` };
  }

  if (STRATEGY_V2.BLACKLIST_TRAINERS.includes(bet.trainer)) {
    return { valid: false, reason: `Trainer ${bet.trainer} is blacklisted` };
  }

  return { valid: true };
};
