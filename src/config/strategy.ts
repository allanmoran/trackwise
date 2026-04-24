// src/config/strategy.ts
// All tunable strategy parameters. Tweak here, re-run npm run engine, compare ROI curves.

export const STRATEGY = {
  bankroll: {
    start:   200,
    unitPct: 0.015,  // 1.5% of bank — more conservative with high-variance high-odds bets
    minUnit: 2,
    maxUnit: 25,
  },
  filters: {
    metroOnly:      true,
    metroTracks:    [
      'Randwick', 'Caulfield', 'Moonee Valley', 'Mornington',
      'Eagle Farm', 'Ascot',
    ],
    maxModelRank:   2,    // top-2 model picks only (was 3)
    minDistance:    1200, // metres
    maxDistance:    1800,
    minFieldSize:   8,    // runners in race
    maxFieldSize:   14,
    minClass:       'BM64', // reject Maiden, CL1, CL2, BM58, BM55
  },
  selection: {
    minScore:             65,
    minOdds:              11.5,
    maxOdds:              18.0,
    ewOddsMin:            11.5,
    minScoreGap:          5,
    lossStreakThreshold:  4,
    lossStreakScoreBonus: 8,
  },
  staking: {
    winPct:             0.60,  // more WIN exposure — 15% margin makes place dividends poor value
    placePct:           0.40,
    stakeMultiplierMin: 0.7,
    stakeMultiplierMax: 1.4,
  },
  learning: {
    recalibrationInterval:   10,
    weightBounds:            { min: 0.05, max: 0.35 },
    thresholdAdjustmentRate: 0.1,
  },
  weights: {
    recentForm:  0.30,
    classRating: 0.20,
    barrier:     0.15,
    wetTrack:    0.15,
    jockeyTier:  0.12,
    trainerTier: 0.08,
  },
} as const;

// ── V1 Validated ──────────────────────────────────────────────────────────────
// DO NOT overwrite validated presets. Add new versions (V2, V3) for variations.

export const STRATEGY_V1_VALIDATED = {
  name: "V1 Validated — 40k+ race convergence",
  version: "1.0",
  validatedAt: "2026-03-26",
  performance: {
    sustainedROI: "5-12%",
    targetBand: "5-10%",
    sampleSize: "40,000+ races",
    bookmakerMargin: 0.15,
  },
  staking: {
    winPct:   0.60,
    placePct: 0.40,
    unitPct:  0.015,  // 1.5% of bank
    minUnit:  2,
    maxUnit:  25,
  },
  selection: {
    minOdds:              1.80,
    maxOdds:              18.0,
    minScore:             65,
    evFilterThreshold:    1.25,
    lossStreakThreshold:  4,
    lossStreakScoreBonus: 8,
  },
  market: {
    bookmakerMargin:          0.85,
    scoreToProbCoefficient:   0.12,
    scoreToProbVariance:      [-0.04, 0.07] as [number, number],
    accountRestrictionActive: true,
  },
  filters: {
    metroOnly:    false,
    minDistance:  0,
    maxDistance:  9999,
    minFieldSize: 0,
    maxFieldSize: 99,
    minClass:     '',
    maxModelRank: 3,
  },
} as const;

// ── V2 — Metro filtered with quality gates ────────────────────────────────────

export const STRATEGY_V2 = {
  name: "V2 — Metro filtered with quality gates",
  version: "2.0",
  updatedAt: "2026-03-29",

  // ── Venue filter ──────────────────────────────
  metroOnly: true,
  metroTracks: [
    'Flemington', 'Caulfield', 'Moonee Valley',
    'Randwick', 'Rosehill', 'Warwick Farm',
    'Eagle Farm', 'Doomben',
    'Morphettville',
    'Ascot', 'Belmont',
  ] as string[],

  // ── Race quality gates ────────────────────────
  minDistance:     1200,
  maxDistance:     1800,
  minFieldSize:    8,
  maxFieldSize:    14,
  minClass:        'BM64',
  minCareerStarts: 4,   // not in feed — shown as info only

  // ── Model filters ─────────────────────────────
  maxModelRank: 2,

  // ── EV filters ────────────────────────────────
  minEV:   1.25,
  minOdds: 11.50,
  maxOdds: 18.00,

  // ── Staking ───────────────────────────────────
  unitPct:  0.025,   // 2.5% of bank (V1 was 1.5%)
  minUnit:  2,
  maxUnit:  25,
  winPct:   0.60,
  placePct: 0.40,

  // ── Odds movement ─────────────────────────────
  trackOddsMovement: true,
  preferDrifting:    true,
  driftingBonus:     0.05,
} as const;

// ── Active strategy ────────────────────────────────────────────────────────────
// Change this to STRATEGY_V1_VALIDATED to revert to V1 behaviour.
export const ACTIVE_STRATEGY = STRATEGY_V2;
