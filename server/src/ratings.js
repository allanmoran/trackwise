/**
 * ratings.js — fetches today's Betfair Kash model ratings
 * CSV endpoint: https://betfair-data-supplier-prod.herokuapp.com/api/widgets/kash-ratings-model/datasets
 */
import axios from 'axios'
import Papa from 'papaparse'

const RATINGS_BASE =
  'https://betfair-data-supplier-prod.herokuapp.com/api/widgets/kash-ratings-model/datasets'

/** Return today's date string as YYYY-MM-DD */
function todayStr() {
  return new Date().toISOString().split('T')[0]
}

/** Normalise a ratings CSV row */
function normalizeRatingsRow(raw) {
  const r = {}
  for (const [k, v] of Object.entries(raw)) {
    r[k.toLowerCase().trim().replace(/[\s-]+/g, '_')] = v
  }

  const str = (...keys) => {
    for (const k of keys) if (r[k]) return String(r[k]).trim()
    return ''
  }
  const num = (...keys) => {
    for (const k of keys) if (r[k] !== undefined && r[k] !== '') return parseFloat(r[k]) || 0
    return 0
  }

  return {
    marketId:   str('market_id', 'marketid', 'market'),
    selectionId: str('selection_id', 'selectionid', 'selection'),
    horse:      str('runner_name', 'horse_name', 'horse', 'name', 'selection_name'),
    venue:      str('venue', 'track', 'course', 'meeting'),
    raceTime:   str('race_time', 'time', 'event_time', 'start_time'),
    ratedPrice: num('rated_price', 'ratedprice', 'model_price', 'rating', 'modelled_price'),
    bsp:        num('bsp', 'betfair_sp', 'win_sp'),
    rank:       parseInt(r['rank'] || r['model_rank'] || 0),
  }
}

/**
 * Fetch today's Kash model ratings.
 * Returns { date, runners, fetchedAt, error? }
 */
export async function fetchTodayRatings(dateOverride) {
  const date = dateOverride || todayStr()
  const url = `${RATINGS_BASE}?date=${date}&presenter=RatingsPresenter&csv=true`

  try {
    console.log(`Fetching Kash ratings for ${date}…`)
    const resp = await axios.get(url, { timeout: 15_000, responseType: 'text' })

    const { data: rows, errors } = Papa.parse(resp.data, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    })
    if (errors.length) console.warn(`  ⚠ Ratings parse warnings (${errors.length})`)

    const runners = rows
      .map(normalizeRatingsRow)
      .filter(r => r.ratedPrice > 0)

    console.log(`  ✓ Ratings → ${runners.length} rated runners for ${date}`)
    return { date, runners, fetchedAt: new Date().toISOString() }
  } catch (err) {
    console.warn(`  – Ratings fetch failed for ${date}: ${err.message}`)
    return {
      date,
      runners: [],
      fetchedAt: new Date().toISOString(),
      error: err.message,
    }
  }
}
