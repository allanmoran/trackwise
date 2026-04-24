/**
 * loader.js — downloads and parses ANZ thoroughbred historical CSVs
 * URL pattern: https://betfair-datascientists.github.io/data/assets/ANZ_Thoroughbreds_YYYY_MM.csv
 */
import axios from 'axios'
import Papa from 'papaparse'

const BASE_URL = 'https://betfair-datascientists.github.io/data/assets'

/** Generate YYYY_MM strings for 2025-03 through 2026-03 */
function getMonthRange() {
  const months = []
  let year = 2025
  let month = 3
  while (year < 2026 || (year === 2026 && month <= 3)) {
    months.push({ year, month: String(month).padStart(2, '0') })
    month++
    if (month > 12) { month = 1; year++ }
  }
  return months
}

/**
 * Normalise a raw CSV row — handles many possible column-name variations
 * from different Betfair dataset releases.
 */
function normalizeRow(raw) {
  // Lower-case every key for consistent lookup
  const r = {}
  for (const [k, v] of Object.entries(raw)) {
    r[k.toLowerCase().trim().replace(/[\s-]+/g, '_')] = v
  }

  const num = (...keys) => {
    for (const k of keys) if (r[k] !== undefined && r[k] !== '') return parseFloat(r[k]) || 0
    return 0
  }
  const int = (...keys) => {
    for (const k of keys) if (r[k] !== undefined && r[k] !== '') return parseInt(r[k]) || 0
    return 0
  }
  const str = (...keys) => {
    for (const k of keys) if (r[k]) return String(r[k]).trim()
    return ''
  }
  const bool = (...keys) => {
    for (const k of keys) {
      const v = r[k]
      if (v === undefined || v === '') continue
      return String(v).trim() === '1' || String(v).trim().toLowerCase() === 'true'
    }
    return false
  }

  return {
    horse:     str('horse_name', 'horse', 'name', 'selection_name', 'runner_name'),
    track:     str('venue', 'track', 'course', 'location', 'racecourse'),
    condition: str('track_condition', 'going', 'condition', 'surface', 'track_going'),
    raceClass: str('class', 'race_class', 'race_type', 'grade'),
    distance:  int('distance', 'dist', 'race_distance'),
    barrier:   int('barrier', 'draw', 'stall', 'gate'),
    runners:   int('runners', 'field_size', 'number_of_runners', 'number_runners', 'field'),
    bsp:       num('bsp', 'win_bsp', 'market_bsp', 'win_sp', 'sp'),
    placeBsp:  num('place_bsp', 'placebsp', 'place_sp', 'bsp_place', 'each_way_bsp'),
    win:       bool('win', 'win_result', 'win_bet_result', 'winner', 'winning'),
    place:     bool('place', 'place_result', 'place_bet_result', 'placed', 'in_the_money'),
    date:      str('date', 'date_of_meet', 'race_date', 'event_date'),
    marketId:  str('market_id', 'marketid'),
    selId:     str('selection_id', 'selectionid'),
  }
}

/** Fetch and parse a single month's CSV. Returns [] on any error. */
async function fetchMonth(year, month) {
  const url = `${BASE_URL}/ANZ_Thoroughbreds_${year}_${month}.csv`
  try {
    const resp = await axios.get(url, { timeout: 30_000, responseType: 'text' })
    const { data: rows, errors } = Papa.parse(resp.data, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    })
    if (errors.length) console.warn(`  ⚠ ${year}-${month} parse warnings (${errors.length})`)

    const valid = rows
      .map(normalizeRow)
      .filter(r => r.bsp > 0 && r.track)

    console.log(`  ✓ ${year}-${month} → ${valid.length.toLocaleString()} records`)
    return valid
  } catch (err) {
    if (err.response?.status === 404) {
      console.warn(`  – ${year}-${month} not available yet (404)`)
    } else {
      console.warn(`  – ${year}-${month} failed: ${err.message}`)
    }
    return []
  }
}

/** Load all months sequentially (polite to the host). Returns flat record array. */
export async function loadHistoricalData() {
  const months = getMonthRange()
  console.log(`Downloading ${months.length} monthly CSVs…`)
  const all = []
  for (const { year, month } of months) {
    const rows = await fetchMonth(year, month)
    all.push(...rows)
  }
  console.log(`Historical load complete — ${all.length.toLocaleString()} total records`)
  return all
}
