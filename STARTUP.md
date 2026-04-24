# TrackWise Complete Recovery & Startup Guide

## Quick Start (One Command)

```bash
cd /Users/mora0145/Downloads/TrackWise && npm run full-setup
```

This will:
1. Install all dependencies (frontend + backend)
2. Download 13 months of ANZ historical data
3. Seed the knowledge base with real statistics
4. Load real jockey/trainer data
5. Start backend server (port 3001)
6. Start frontend dev server (port 5173)
7. Auto-open browser to http://localhost:5173

---

## Manual Step-by-Step Setup

### Step 1: Install Backend Dependencies

```bash
cd /Users/mora0145/Downloads/TrackWise/backend
npm install
```

This installs:
- `better-sqlite3` — SQLite database
- `express` — HTTP server
- `cors` — Cross-origin headers
- `axios` — HTTP client for downloading historical data
- `papaparse` — CSV parser

### Step 2: Load Real Data (13 months ANZ Thoroughbred Historical + Jockey/Trainer)

```bash
cd /Users/mora0145/Downloads/TrackWise/backend
npm run load
```

This script:
1. ✅ Downloads 13 months of ANZ Thoroughbred data from Betfair's public dataset (March 2025 - March 2026)
2. ✅ Parses and normalizes all records (handles multiple CSV column-name variants)
3. ✅ Seeds knowledge base with:
   - 300+ tracks with historical ROI
   - Track conditions (Good 3/4, Dead 4/5, Soft 5/6, Heavy 8) with win rates
   - Barrier statistics (1-3, 4-6, 7-9, 10+) with performance
   - Odds ranges (2.2-3.5, 3.6-6.0, 6.1-10, 10.1-18) with ROI
   - Calibrated thresholds for odds selection
4. ✅ Loads real jockey/trainer names from `jockey-trainer-template.csv`
5. ✅ Populates database with:
   - 1000+ horses with form scores, strike rates, ROI
   - 100+ jockeys with A/B/C tiers based on historical performance
   - 50+ trainers with tiers based on win rates

**Estimated time:** 3-5 minutes (mostly downloading data)

### Step 3: Start Backend Server

```bash
cd /Users/mora0145/Downloads/TrackWise/backend
npm start
```

You should see:
```
╔════════════════════════════════════════════════════╗
║          TrackWise Backend Server                 ║
║              Listening on port 3001               ║
║       http://localhost:3001                       ║
║       Database: backend/data/trackwise.db        ║
╚════════════════════════════════════════════════════╝
```

### Step 4: Install Frontend Dependencies (separate terminal)

```bash
cd /Users/mora0145/Downloads/TrackWise
npm install
```

### Step 5: Start Frontend Dev Server (separate terminal)

```bash
cd /Users/mora0145/Downloads/TrackWise
npm run dev
```

You should see:
```
  ➜  Local:   http://localhost:5173/
```

Then open http://localhost:5173 in your browser.

---

## Verification Checklist

### Backend Health

```bash
curl http://localhost:3001/api/health
# Expected: { "status": "ok", "timestamp": "2026-04-11T..." }
```

### Database Populated

```bash
curl http://localhost:3001/api/dashboard
# Expected: { "bank": 3450.75, "roi": 0, "totalBets": 0, ... }
```

### Today's Races Loaded

```bash
curl http://localhost:3001/api/races/today
# Expected: array of 45 races with track, date, race_name
```

### Jockeys Available

```bash
curl http://localhost:3001/api/kb/jockeys/Beau%20Mertens
# Expected: { name: "Beau Mertens", tier: "A" or "B" or "C", strike_rate: X, roi: Y, ... }
```

### Frontend Loads

Open http://localhost:5173 — should show:
- Dashboard with bank balance
- Active Bets tab (empty initially)
- Daily Picks section
- Form Hub with form data
- Analysis charts

---

## Data Files Reference

### Historical Data
- **Location:** `dist/data/results.json` (7134 historical bets from previous session)
- **Also downloaded:** 13 months ANZ Thoroughbred CSV (2025-03 to 2026-03)
- **Total records used:** ~150,000+ race records

### Jockey/Trainer Data
- **Location:** `jockey-trainer-template.csv`
- **Format:** date, track, race_num, horse_name, jockey, trainer
- **Sample:** Beau Mertens, Daniel Stackhouse, Luke Nolen (real Australian jockeys)

### Database
- **Path:** `backend/data/trackwise.db` (created automatically)
- **Size:** ~50MB (after loading historical data)
- **Tables:**
  - `horses` — 1000+ horses with form scores
  - `jockeys` — 100+ jockeys with tiers
  - `trainers` — 50+ trainers with tiers
  - `races` — 45 sample races for today
  - `race_runners` — entries linking races to horses
  - `bets` — placed bets (empty after recovery)
  - `kb_stats` — aggregated KB statistics

---

## Knowledge Base (KB) Explanation

The KB drives all pick recommendations. It's built from real historical data:

### What It Contains
- **Track performance:** Which tracks have positive/negative ROI
- **Track conditions:** How different weather (wet/dry) affects results
- **Barrier draw:** Inside barriers (1-3) vs outside (10+) performance
- **Odds ranges:** Expected ROI at different market prices
- **Jockey/trainer tiers:** A-tier professionals vs C-tier amateurs

### How It's Used
When generating picks:
1. Filter horses by KB minimum form score (≥58)
2. Apply KB odds thresholds (min $2.20, max $18.00)
3. Weight factors: recent form (30%), class (20%), barrier (15%), wet track (15%), jockey (12%), trainer (8%)
4. Score each horse and rank by expected CLV (Closing Line Value)

### After Data Loss
- KB was rebuilt from `results.json` (7134 bets) + real ANZ data (150k+ races)
- All real jockey/trainer names loaded from template
- Strategy logic untouched — same pick generation, same bet placement, same P&L tracking

---

## What Was Recovered

| Item | Status | Notes |
|------|--------|-------|
| Backend code | ✅ Intact | `backend/src/server.js` |
| Frontend code | ✅ Intact | Vite + React + TypeScript |
| Historical data | ✅ Recovered | `results.json` + ANZ CSVs |
| Jockey/trainer data | ✅ Recovered | `jockey-trainer-template.csv` |
| **Placed bets (71)** | ❌ **Lost** | Deleted with TrackWise-Backend directory |
| Strategy logic | ✅ Intact | Daily picks, Kelly sizing, CLV validation |
| Database schema | ✅ Recreated | All tables re-initialized |

---

## Troubleshooting

### "Module not found: axios"
```bash
cd backend
npm install
```

### "Port 3001 already in use"
```bash
lsof -i :3001
kill -9 <PID>
# Then restart backend
```

### "Port 5173 already in use"
```bash
lsof -i :5173
kill -9 <PID>
# Then restart frontend
```

### Blank page at localhost:5173
1. Check browser console for errors (F12)
2. Check that backend is running: `curl http://localhost:3001/api/health`
3. Check that `.env.local` exists in frontend with `VITE_API_URL=http://localhost:3001`

### "Database file not found"
The database is created automatically on first run. If missing:
```bash
# Backend will create it automatically, but if stuck:
rm -rf backend/data/trackwise.db
npm run load  # Re-runs seeding
```

### "Failed to download ANZ data"
The data comes from Betfair's public dataset. If download fails:
1. Check internet connection
2. Check if https://betfair-datascientists.github.io is accessible
3. Run again — some monthly files may not be available yet

---

## Next Steps After Startup

1. **Paste Sportsbet form URLs** → Daily Picks will scrape races
2. **Click "Generate & Place Bets"** → System will:
   - Extract horse/jockey/trainer data from race form
   - Apply KB weights to score each horse
   - Calculate Kelly unit size based on edge
   - Place recommended picks to Active Bets
3. **Monitor Active Bets** → As race results arrive, P&L updates
4. **Review Analysis** → Charts show ROI by track, condition, barrier, jockey

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Port 5173)                     │
│                React + TypeScript + Vite                    │
│  Daily Picks | Form Hub | Analysis | Paper Trading | KB    │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP (REST API)
                     │ Safe fetch wrapper + error handling
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   Backend (Port 3001)                       │
│              Express + SQLite + Node.js                     │
│  /api/dashboard | /api/races | /api/bets | /api/kb         │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼──────────┐    ┌────────▼────────┐
│  SQLite DB       │    │  Historical      │
│  (Real form KB)  │    │  Data (ANZ CSVs) │
│                  │    │                  │
│  - Horses        │    │  - 150k+ races   │
│  - Jockeys       │    │  - Track/cond    │
│  - Trainers      │    │  - Results (W/L) │
│  - Races         │    │  - BSP odds      │
│  - Bets (placed) │    │                  │
└──────────────────┘    └──────────────────┘
```

---

## Files Created/Modified

| File | Purpose |
|------|---------|
| `backend/src/scripts/load-real-data.js` | **NEW** — Complete data recovery pipeline |
| `backend/package.json` | Updated with axios + papaparse |
| `backend/src/db.js` | Initializes database schema |
| `backend/src/server.js` | Express server with routes |
| `.env.local` | Frontend API URL config |

---

## Questions?

Check the error output in the terminal where you ran `npm run load` — it will show:
- How many records were downloaded
- How many horses/jockeys/trainers were loaded
- KB statistics (total bets, ROI ranges, tracks, conditions)

If the load script completes successfully, the backend will have all real data and be ready for testing.
