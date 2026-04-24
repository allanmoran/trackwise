# Sportsbet Form Scraper Workflow

## Overview
The form scraper integrates Sportsbet form URLs directly with the TrackWise Knowledge Base and prediction model.

**Pipeline**: 
```
User pastes Sportsbet form URLs 
  → Scraper extracts race + runner data 
  → Loads into KB 
  → ML predictor generates picks 
  → Bets placed automatically
```

## Quick Start

### 1. Load a Single Race

```bash
curl -X POST http://localhost:3001/api/form-scraper/load-race \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.sportsbetform.com.au/436044/3308955/"
  }'
```

**Response**:
```json
{
  "success": true,
  "raceId": 3535,
  "runnersLoaded": 14,
  "message": "Successfully loaded 14 runners"
}
```

### 2. Load Multiple Races (Batch)

```bash
curl -X POST http://localhost:3001/api/form-scraper/batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.sportsbetform.com.au/436044/3308955/",
      "https://www.sportsbetform.com.au/436045/3308956/",
      "https://www.sportsbetform.com.au/436046/3308957/"
    ]
  }'
```

### 3. View Today's Loaded Races

```bash
curl http://localhost:3001/api/form-scraper/today
```

**Response**:
```json
{
  "success": true,
  "date": "2026-04-12",
  "races": [
    {
      "id": 3535,
      "track": "Gundagai",
      "race_number": 1,
      "race_name": "MARGARET KEENAN MEMORIAL 3YO MAIDEN HANDICAP",
      "distance": 1000,
      "runners": 14,
      "runners_with_odds": 12
    }
  ],
  "totalRaces": 1
}
```

### 4. Generate Picks for Loaded Race

```bash
curl http://localhost:3001/api/races/3535/picks
```

**Response**:
```json
{
  "success": true,
  "picks": [
    {
      "rank": 1,
      "horse": "Red Baron",
      "jockey": "John Smith",
      "odds": 3.50,
      "predictedWinProbability": 22.5,
      "expectedValueWin": 0.325,
      "expectedValuePlace": 0.156,
      "recommendedBetType": "WIN",
      "recommendation": "STRONG_BUY"
    },
    ...
  ]
}
```

### 5. Place Bets on Top Picks

```bash
curl -X POST http://localhost:3001/api/bets/batch \
  -H "Content-Type: application/json" \
  -d '{
    "bets": [
      {
        "raceId": 3535,
        "horseId": 123,
        "jockeyId": 456,
        "stake": 50,
        "betType": "WIN"
      },
      {
        "raceId": 3535,
        "horseId": 124,
        "jockeyId": 457,
        "stake": 50,
        "betType": "WIN"
      }
    ]
  }'
```

## What Gets Extracted

### From Sportsbet Form URL:

✅ **Race Information**
- Track name
- Race number  
- Race name/conditions
- Distance
- Class (HANDICAP, MAIDEN, 3YO, etc.)
- Start time

✅ **Runner Information**
- Horse name
- Jockey name (if available)
- Trainer name (if available)
- Starting odds / Win probability
- Barrier (if available)
- Weight (if available)

## Data Flow

```
Sportsbet Form Page
    ↓
[Puppeteer scrapes HTML]
    ↓
Race Data + Runners List
    ↓
[Database INSERT/UPDATE]
    ↓
Knowledge Base Updated
    ↓
[ML Predictor analyzes]
    ↓
Picks with EV + Probabilities
    ↓
[Betting Engine filters]
    ↓
Placeable Bets
```

## Example: Full Workflow

```javascript
// 1. User pastes 3 Sportsbet form URLs
const urls = [
  "https://www.sportsbetform.com.au/436044/3308955/",
  "https://www.sportsbetform.com.au/436045/3308956/",
  "https://www.sportsbetform.com.au/436046/3308957/"
];

// 2. Batch load into KB
POST /api/form-scraper/batch { urls }
// Response: 3 races, 42 total runners loaded

// 3. View today's races
GET /api/form-scraper/today
// Returns: [Race 1: 14 runners, Race 2: 16 runners, Race 3: 12 runners]

// 4. Generate picks for each race
for each race:
  GET /api/races/{raceId}/picks
  // Filter: picks with EV > 0.15 and confidence > 75%
  
// 5. Place bets on top picks
POST /api/bets/batch
// Response: 8 bets placed, bank updated, picks displayed
```

## Current Limitations

### ❌ Known Issues
1. **HTML parsing fragile**: Page structure may vary
   - Some pages don't have odds in expected table format
   - Track names sometimes mixed with runner names
   
2. **Jockey/Trainer extraction**: Not reliably captured yet
   - Need better HTML patterns or different data source
   - Falls back to NULL, model still works but accuracy reduced

3. **Race name parsing**: May extract page title instead of race name
   - Need more robust heading detection

### ✅ Workarounds
1. Manually provide jockey/trainer data via KB API
2. Validate extracted odds before placing bets
3. Use form URL consistency (same site structure)

## Testing the Scraper

```bash
# Test a single URL
node test-sportsbet-form.js

# Expected output:
# 🏇 Scraping: https://www.sportsbetform.com.au/436044/3308955/
# 📍 Track: Gundagai R1
# 🏁 Distance: 1000m
# 👥 Extracted 14 runners
# 💾 Loading into Knowledge Base...
# ✅ Successfully loaded Gundagai R1
```

## Next Steps

### Phase 1: Improve HTML Parsing
- [ ] Test multiple Sportsbet form page layouts
- [ ] Add fallback patterns for different page structures
- [ ] Extract jockey/trainer reliably
- [ ] Capture barrier and weight info

### Phase 2: Frontend Integration
- [ ] Add URL input field to frontend
- [ ] Show scrape progress (loading spinners)
- [ ] Display loaded races before picks generation
- [ ] Real-time pick count as scraping completes

### Phase 3: Automation
- [ ] Auto-scrape daily race form at set time
- [ ] Cache results to avoid re-scraping
- [ ] Validate odds against live betting markets
- [ ] Alert on significant odds movements

### Phase 4: Production
- [ ] Rate limiting on Sportsbet scraping
- [ ] Proxy rotation for stability
- [ ] Error recovery and retry logic
- [ ] Logging and monitoring dashboard

## API Reference

### POST /api/form-scraper/load-race
Load a single race from Sportsbet form URL
**Body**: `{ "url": "https://..." }`
**Returns**: `{ raceId, runnersLoaded }`

### POST /api/form-scraper/batch
Load multiple races in batch
**Body**: `{ "urls": ["https://...", "https://..."] }`
**Returns**: `{ totalRaces, totalRunners, results[] }`

### GET /api/form-scraper/today
Get all today's loaded races with runner counts
**Returns**: `{ date, races[], totalRaces }`

### GET /api/races/{raceId}/picks
Generate ML-predicted picks for a race
**Returns**: `{ picks[] with EV, probability, recommendation }`

### POST /api/bets/batch
Place bets on multiple picks
**Body**: `{ bets[] with raceId, horseId, stake, betType }`
**Returns**: `{ placedCount, filtered[], duplicates[] }`
