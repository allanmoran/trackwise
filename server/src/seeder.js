/**
 * seeder.js — builds a KB object seeded from real historical BSP data.
 * Output schema matches TrackWise's initKB() exactly.
 *
 * Stakes are normalised to 1 unit per bet:
 *   s += 1        (always)
 *   r += bsp      (win)
 *   r += placeBsp (place but not win, for place/EW legs)
 *   r += 0        (loss)
 *
 * ROI = (r - s) / s   — identical formula used in the React app.
 */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

function eb() {
  return { b: 0, w: 0, p: 0, s: 0, r: 0 }
}

function upd(bucket, isWin, isPlace, bsp, placeBsp) {
  bucket.b++
  if (isWin)   bucket.w++
  if (isPlace) bucket.p++
  bucket.s += 1
  // Gross return (stake + profit) for a win-only $1 bet
  if (isWin)        bucket.r += bsp
  else if (isPlace) bucket.r += placeBsp
  // else: horse lost — returns 0
}

function combineBuckets(buckets) {
  return buckets.reduce(
    (acc, b) => ({ b: acc.b + b.b, w: acc.w + b.w, p: acc.p + b.p, s: acc.s + b.s, r: acc.r + b.r }),
    eb()
  )
}

function roi(bucket) {
  return bucket.s > 0 ? (bucket.r - bucket.s) / bucket.s : 0
}

function oddsKey(bsp) {
  if (bsp <= 3.5) return '2.2-3.5'
  if (bsp <= 6.0) return '3.6-6.0'
  if (bsp <= 10)  return '6.1-10'
  return '10.1-18'
}

function barrierKey(barrier) {
  if (barrier <= 3) return '1-3'
  if (barrier <= 6) return '4-6'
  if (barrier <= 9) return '7-9'
  return '10+'
}

/**
 * Map raw condition strings to the canonical labels used in TrackWise.
 * Returns null if unrecognised.
 */
function normaliseCondition(raw) {
  if (!raw) return null
  const s = raw.toString().toLowerCase().trim()
  if (/good\s*3|g3/.test(s))              return 'Good 3'
  if (/good\s*4|g4|^good$/.test(s))       return 'Good 4'
  if (/dead\s*4|d4/.test(s))              return 'Dead 4'
  if (/dead\s*5|d5|^dead$/.test(s))       return 'Dead 5'
  if (/soft\s*5|s5/.test(s))              return 'Soft 5'
  if (/soft\s*6|s6|^soft$/.test(s))       return 'Soft 6'
  if (/heavy|h8|hvy/.test(s))             return 'Heavy 8'
  return null
}

/* ─── KB seeder ─────────────────────────────────────────────────────────── */

export function seedKB(records) {
  // Start from the same defaults as initKB() in App.tsx
  const kb = {
    tracks:     {},
    conditions: {},
    barriers:   { '1-3': eb(), '4-6': eb(), '7-9': eb(), '10+': eb() },
    scoreBands: { '55-64': eb(), '65-74': eb(), '75-84': eb(), '85+': eb() },
    betTypes:   { WIN: eb(), PLACE: eb(), 'EACH-WAY': eb() },
    oddsRanges: { '2.2-3.5': eb(), '3.6-6.0': eb(), '6.1-10': eb(), '10.1-18': eb() },
    weights: {
      recentForm:  0.30,
      classRating: 0.20,
      barrier:     0.15,
      wetTrack:    0.15,
      jockeyTier:  0.12,
      trainerTier: 0.08,
    },
    thresholds: { minScore: 58, minOdds: 2.2, maxOdds: 18.0, ewOddsMin: 4.5 },
    totalBets: 0, totalStaked: 0, totalReturn: 0,
    consLosses: 0, consWins: 0, version: 1,
  }

  // Filter to records we can meaningfully use
  const valid = records.filter(
    r => r.bsp >= 2.2 && r.bsp <= 18 && r.placeBsp > 1.0
  )
  console.log(`Seeding KB from ${valid.length.toLocaleString()} valid records…`)

  for (const r of valid) {
    const isWin   = r.win
    const isPlace = r.place

    /* ── tracks ── */
    if (r.track) {
      if (!kb.tracks[r.track]) kb.tracks[r.track] = eb()
      upd(kb.tracks[r.track], isWin, isPlace, r.bsp, r.placeBsp)
    }

    /* ── conditions ── */
    const cond = normaliseCondition(r.condition)
    if (cond) {
      if (!kb.conditions[cond]) kb.conditions[cond] = eb()
      upd(kb.conditions[cond], isWin, isPlace, r.bsp, r.placeBsp)
    }

    /* ── barriers ── */
    if (r.barrier > 0) {
      upd(kb.barriers[barrierKey(r.barrier)], isWin, isPlace, r.bsp, r.placeBsp)
    }

    /* ── odds ranges ── */
    upd(kb.oddsRanges[oddsKey(r.bsp)], isWin, isPlace, r.bsp, r.placeBsp)

    /* ── betTypes — historical data is all WIN bets ── */
    upd(kb.betTypes.WIN, isWin, isPlace, r.bsp, r.placeBsp)

    kb.totalBets++
    kb.totalStaked += 1
    kb.totalReturn += isWin ? r.bsp : isPlace ? r.placeBsp : 0
  }

  /* ── Calibrate thresholds from odds-range ROI ── */
  {
    const r22 = roi(kb.oddsRanges['2.2-3.5'])
    const r36 = roi(kb.oddsRanges['3.6-6.0'])
    const r61 = roi(kb.oddsRanges['6.1-10'])
    const r10 = roi(kb.oddsRanges['10.1-18'])
    const sufficient = b => b.b >= 50

    // If medium odds beat favourites, nudge minOdds up
    if (sufficient(kb.oddsRanges['3.6-6.0']) && sufficient(kb.oddsRanges['2.2-3.5'])) {
      if (r36 > r22 + 0.03) kb.thresholds.minOdds = clamp(kb.thresholds.minOdds + 0.3, 2.2, 3.5)
    }
    if (sufficient(kb.oddsRanges['6.1-10']) && sufficient(kb.oddsRanges['3.6-6.0'])) {
      if (r61 > r36 + 0.05) kb.thresholds.minOdds = clamp(kb.thresholds.minOdds + 0.5, 2.2, 5.0)
    }

    // If long shots consistently lose, tighten maxOdds
    if (sufficient(kb.oddsRanges['10.1-18'])) {
      if (r10 < -0.20) kb.thresholds.maxOdds = 12.0
      else if (r10 < -0.12) kb.thresholds.maxOdds = 15.0
    }

    // Adjust E/W minimum from place-paying odds data
    if (sufficient(kb.oddsRanges['3.6-6.0']) && r36 > 0) {
      kb.thresholds.ewOddsMin = 4.0
    }
  }

  /* ── Calibrate weights from historical signal ── */
  {
    // Barrier: compare inner (1-3) ROI vs outer (10+)
    const inner = kb.barriers['1-3'], outer = kb.barriers['10+']
    if (inner.b >= 100 && outer.b >= 100) {
      const diff = roi(inner) - roi(outer)
      // diff > 0 → inside barriers outperform → increase barrier weight
      kb.weights.barrier = clamp(0.15 + diff * 0.4, 0.06, 0.28)
    }

    // Wet track: compare wet vs dry conditions
    const wetLabels = ['Dead 5', 'Soft 5', 'Soft 6', 'Heavy 8']
    const dryLabels = ['Good 3', 'Good 4', 'Dead 4']
    const wetBuckets = wetLabels.flatMap(l => kb.conditions[l] ? [kb.conditions[l]] : [])
    const dryBuckets = dryLabels.flatMap(l => kb.conditions[l] ? [kb.conditions[l]] : [])
    if (wetBuckets.length && dryBuckets.length) {
      const wb = combineBuckets(wetBuckets), db = combineBuckets(dryBuckets)
      if (wb.b >= 50 && db.b >= 50) {
        const spread = Math.abs(roi(wb) - roi(db))
        // High spread = wet-track specialisation matters more
        if (spread > 0.05) kb.weights.wetTrack = clamp(0.15 + spread * 0.4, 0.08, 0.28)
      }
    }

    // Normalise weights so they still sum to 1.0
    const wSum = Object.values(kb.weights).reduce((a, b) => a + b, 0)
    for (const k of Object.keys(kb.weights)) kb.weights[k] = +(kb.weights[k] / wSum).toFixed(4)
  }

  kb.version = 2  // flag: seeded from real historical data
  console.log(`KB seeded — v${kb.version}, ${Object.keys(kb.tracks).length} tracks, thresholds: minOdds=$${kb.thresholds.minOdds}, maxOdds=$${kb.thresholds.maxOdds}`)
  return kb
}

/* ─── Historical summary (for /historical/summary endpoint) ─────────────── */

export function buildSummary(records) {
  const byTrack     = {}
  const byCondition = {}
  const byOddsRange = {
    '2.2-3.5': eb(), '3.6-6.0': eb(), '6.1-10': eb(), '10.1-18': eb(),
  }
  const byFieldSize = { '5-8': eb(), '9-12': eb(), '13+': eb() }

  const valid = records.filter(r => r.bsp >= 1.5 && r.bsp <= 50)

  for (const r of valid) {
    const isWin   = r.win
    const isPlace = r.place

    if (r.track) {
      if (!byTrack[r.track]) byTrack[r.track] = eb()
      upd(byTrack[r.track], isWin, isPlace, r.bsp, r.placeBsp)
    }

    const cond = normaliseCondition(r.condition)
    if (cond) {
      if (!byCondition[cond]) byCondition[cond] = eb()
      upd(byCondition[cond], isWin, isPlace, r.bsp, r.placeBsp)
    }

    if (r.bsp >= 2.2 && r.bsp <= 18) {
      upd(byOddsRange[oddsKey(r.bsp)], isWin, isPlace, r.bsp, r.placeBsp)
    }

    if (r.runners > 0) {
      const fsKey = r.runners >= 13 ? '13+' : r.runners >= 9 ? '9-12' : '5-8'
      upd(byFieldSize[fsKey], isWin, isPlace, r.bsp, r.placeBsp)
    }
  }

  const fmt = (label, b) => ({
    label,
    bets:         b.b,
    wins:         b.w,
    places:       b.p,
    winStrike:    b.b > 0 ? +(b.w / b.b * 100).toFixed(1) : 0,
    placeStrike:  b.b > 0 ? +(b.p / b.b * 100).toFixed(1) : 0,
    roi:          b.s > 0 ? +((b.r - b.s) / b.s * 100).toFixed(2) : 0,
    avgWinOdds:   b.w > 0 ? +(b.r / b.w).toFixed(2) : 0,
  })

  return {
    generatedAt:   new Date().toISOString(),
    totalRecords:  records.length,
    validRecords:  valid.length,
    byTrack:       Object.entries(byTrack)
                     .filter(([, b]) => b.b >= 20)
                     .map(([k, v]) => fmt(k, v))
                     .sort((a, b) => b.roi - a.roi),
    byCondition:   Object.entries(byCondition)
                     .filter(([, b]) => b.b >= 10)
                     .map(([k, v]) => fmt(k, v))
                     .sort((a, b) => b.roi - a.roi),
    byOddsRange:   Object.entries(byOddsRange).map(([k, v]) => fmt(k, v)),
    byFieldSize:   Object.entries(byFieldSize).map(([k, v]) => fmt(k, v)),
  }
}
