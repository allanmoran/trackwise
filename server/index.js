/**
 * TrackWise data-ingestion server — localhost:3001
 *
 * Startup sequence:
 *   1. Download 13 months of ANZ thoroughbred CSVs
 *   2. Seed the KB from real BSP/win/place data
 *   3. Fetch today's Kash model ratings
 *   4. Serve everything over Express
 *
 * Endpoints:
 *   GET  /status             — loading state
 *   GET  /kb                 — seeded knowledge base (TrackWise KB schema)
 *   GET  /ratings/today      — today's Kash model rated prices
 *   GET  /historical/summary — win/place/ROI stats by track, condition, odds, field size
 *   POST /refresh            — re-fetches today's ratings
 */

import express from 'express'
import cors from 'cors'
import { loadHistoricalData } from './src/loader.js'
import { fetchTodayRatings } from './src/ratings.js'
import { seedKB, buildSummary } from './src/seeder.js'

const PORT = 3001

/* ─── In-memory state ────────────────────────────────────────────────────── */
const state = {
  ready:     false,
  loading:   true,
  error:     null,
  kb:        null,
  ratings:   null,
  summary:   null,
  startedAt: new Date().toISOString(),
  readyAt:   null,
}

/* ─── Express setup ──────────────────────────────────────────────────────── */
const app = express()
app.use(cors())
app.use(express.json())

// Middleware: return 503 while still loading (except /status)
app.use((req, res, next) => {
  if (!state.ready && req.path !== '/status') {
    return res.status(503).json({
      error:   'Server still initialising',
      loading: state.loading,
      started: state.startedAt,
    })
  }
  next()
})

/* ─── Routes ─────────────────────────────────────────────────────────────── */

app.get('/status', (_req, res) => {
  res.json({
    ready:      state.ready,
    loading:    state.loading,
    error:      state.error,
    startedAt:  state.startedAt,
    readyAt:    state.readyAt,
    kbVersion:  state.kb?.version ?? null,
    tracksLoaded:  state.kb ? Object.keys(state.kb.tracks).length : 0,
    ratingsCount:  state.ratings?.runners?.length ?? 0,
    lastRefresh:   state.ratings?.fetchedAt ?? null,
  })
})

app.get('/kb', (_req, res) => {
  res.json(state.kb)
})

app.get('/ratings/today', (_req, res) => {
  res.json(state.ratings)
})

app.get('/historical/summary', (_req, res) => {
  res.json(state.summary)
})

app.post('/refresh', async (_req, res) => {
  console.log('Manual refresh requested…')
  try {
    state.ratings = await fetchTodayRatings()
    res.json({ ok: true, refreshed: state.ratings.fetchedAt, runners: state.ratings.runners.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/* ─── Startup ────────────────────────────────────────────────────────────── */

async function init() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' TrackWise data-ingestion server starting…')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  try {
    // 1. Historical data
    const records = await loadHistoricalData()

    if (records.length === 0) {
      console.warn('⚠ No historical records loaded — using default KB')
    }

    // 2. Seed KB (synchronous once records are in memory)
    state.kb      = seedKB(records)
    state.summary = buildSummary(records)

    // 3. Today's ratings (non-blocking if it fails)
    state.ratings = await fetchTodayRatings()

    state.ready   = true
    state.loading = false
    state.readyAt = new Date().toISOString()

    const sysROI = state.kb.totalStaked > 0
      ? ((state.kb.totalReturn - state.kb.totalStaked) / state.kb.totalStaked * 100).toFixed(1)
      : '0.0'

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(` ✓ Ready — ${Object.keys(state.kb.tracks).length} tracks | KB v${state.kb.version} | Historical ROI: ${sysROI}%`)
    console.log(` ✓ Ratings: ${state.ratings.runners.length} runners for ${state.ratings.date}`)
    console.log(` ✓ Listening on http://localhost:${PORT}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } catch (err) {
    state.loading = false
    state.error   = err.message
    console.error('Init failed:', err)

    // Serve a minimal default KB so the React app can still function
    state.kb = defaultKB()
    state.summary = { generatedAt: new Date().toISOString(), totalRecords: 0, error: err.message }
    state.ratings = { date: new Date().toISOString().split('T')[0], runners: [], error: err.message }
    state.ready   = true
  }
}

function defaultKB() {
  return {
    tracks: {}, conditions: {},
    barriers:   { '1-3':{b:0,w:0,p:0,s:0,r:0},'4-6':{b:0,w:0,p:0,s:0,r:0},'7-9':{b:0,w:0,p:0,s:0,r:0},'10+':{b:0,w:0,p:0,s:0,r:0} },
    scoreBands: { '55-64':{b:0,w:0,p:0,s:0,r:0},'65-74':{b:0,w:0,p:0,s:0,r:0},'75-84':{b:0,w:0,p:0,s:0,r:0},'85+':{b:0,w:0,p:0,s:0,r:0} },
    betTypes:   { WIN:{b:0,w:0,p:0,s:0,r:0},PLACE:{b:0,w:0,p:0,s:0,r:0},'EACH-WAY':{b:0,w:0,p:0,s:0,r:0} },
    oddsRanges: { '2.2-3.5':{b:0,w:0,p:0,s:0,r:0},'3.6-6.0':{b:0,w:0,p:0,s:0,r:0},'6.1-10':{b:0,w:0,p:0,s:0,r:0},'10.1-18':{b:0,w:0,p:0,s:0,r:0} },
    weights: { recentForm:0.30, classRating:0.20, barrier:0.15, wetTrack:0.15, jockeyTier:0.12, trainerTier:0.08 },
    thresholds: { minScore:58, minOdds:2.2, maxOdds:18.0, ewOddsMin:4.5 },
    totalBets:0, totalStaked:0, totalReturn:0, consLosses:0, consWins:0, version:1,
  }
}

app.listen(PORT, () => {
  console.log(`Server process started, port ${PORT} open — loading data…`)
})

init()
