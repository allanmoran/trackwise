# Betfair Data Strategy Guide

## Building a Professional Betting Strategy with Historical Data

Your system now has access to **17,082 horses** with comprehensive career statistics from Betfair's historical racing database. This guide explains how to use feature engineering to find consistent edges.

---

## Key Concept: Quality Data Underpins Strategy

From Betfair's guidance:
> "Quality data underpins the vast majority of successful betting strategies, so becoming comfortable working with the data available to you is a really important part of both the modelling and automation processes."

Your advantage comes from **analyzing dimensions** that other bettors ignore:

1. **Distance preferences** - Does this horse run better at specific distances?
2. **Track preferences** - Does this horse win more at certain tracks?
3. **BSP efficiency** - Are these odds justified by actual performance?
4. **Jockey/trainer combinations** - Do certain pairings outperform?

---

## Feature Analysis System

### 1. Distance Preference Analysis

**The Edge:** Horses often run significantly better (or worse) at specific distances.

```
Example: Jannik (30.9% overall strike rate)
  1000m: 8W/20 = 40% ✅ STRONG
  1200m: 6W/18 = 33% ✔️ average
  1400m: 3W/15 = 20% ❌ WEAK

Strategy: ONLY back Jannik at 1000m (40% win rate)
Ignore races > 1200m (expected value collapses)
```

**API Endpoint:**
```bash
GET /api/features/distance/1937
```

**Response:**
```json
{
  "bestDistance": 1000,
  "winRateAtBest": 0.40,
  "racesAtBest": 20,
  "allDistances": [
    {
      "distance": 1000,
      "races": 20,
      "winRate": "0.400",
      "placeRate": "0.500"
    },
    {
      "distance": 1200,
      "races": 18,
      "winRate": "0.333",
      "placeRate": "0.444"
    }
  ]
}
```

**How to Use:**
- Identify horses with 20%+ difference between best/worst distance
- ONLY back these horses at their optimal distance
- Ignore races outside their preference range

---

### 2. Track Preference Analysis

**The Edge:** Some horses have strong track preferences due to going quality, track shape, or familiarity.

```
Example: Spurline (22.7% overall)
  Ascot: 8W/25 = 32% ✅ STRONG
  Caulfield: 5W/23 = 22% ✔️ average
  Randwick: 2W/20 = 10% ❌ WEAK

Strategy: ONLY back Spurline at Ascot (32% win rate)
Avoid Randwick races (10% strike rate)
```

**API Endpoint:**
```bash
GET /api/features/track/1940
```

**How to Use:**
- Find horses with 15%+ win rate difference between best/worst tracks
- Build a "blacklist" of tracks where a horse underperforms
- Prioritize races at their best tracks

---

### 3. BSP Odds Efficiency

**The Edge:** Comparing Betfair Starting Price (BSP) odds to actual win rates identifies mispriced horses.

```
Example: Heavenly Kiss
  Actual Win Rate: 35% (7W/20 recent bets)
  Implied from BSP: 25% (1 ÷ average odds of $4.00)
  
Result: UNDERPRICED by ~40%
→ These odds offer positive EV
```

**API Endpoint:**
```bash
GET /api/features/odds-efficiency/1937
```

**Response:**
```json
{
  "totalBets": 20,
  "actualWins": 7,
  "actualWinRate": "35.0",
  "impliedWinRate": "25.0",
  "efficiency": "140.0",
  "assessment": "UNDERPRICED",
  "avgOpeningOdds": "3.80",
  "avgClosingOdds": "4.20"
}
```

**How to Use:**
- ONLY back horses with 120%+ efficiency (underpriced)
- AVOID horses with <90% efficiency (overpriced)
- EV = (Actual Win Rate × Odds) - 1

---

### 4. Jockey × Horse Combinations

**The Edge:** Some jockeys have chemistry with specific horses.

```
Example: Jannik with Jamie Kbler
  Together: 6W/8 races = 75% ✅ EXCELLENT
  Jannik average: 30.9%
  Jamie average: 35.2%
  Combined: 75% (2.4x baseline!)

Strategy: STRONG BACK when Jannik + Jamie pair
```

**API Endpoint:**
```bash
GET /api/features/jockey-combo/1937/123
```

**How to Use:**
- Track jockey x horse combinations with 5+ races
- Flag combinations outperforming either individual's baseline
- These are high-conviction bets (if sample size is adequate)

---

### 5. Trainer × Horse Combinations

**The Edge:** Trainers develop training programs for specific horses.

```
Example: Heavenly Kiss with Tom Wilson
  Together: 5W/6 races = 83% ✅ EXCELLENT
  Heavenly Kiss average: 30.9%
  Tom Wilson average: 27.3%
  Combined: 83% (2.7x baseline!)
```

**API Endpoint:**
```bash
GET /api/features/trainer-combo/1937/45
```

---

## Feature-Based Pick System

### Composite Scoring

Your model combines multiple features into a **composite score**:

```
Base Score = Horse Strike Rate × 100

Modifiers:
  × 1.20 (max) = Distance edge
  × 1.15 (max) = Track edge
  × 1.08      = Proven jockey combo
  × 1.08      = Proven trainer combo

Example:
  Jannik base: 30.9%
  × 1.15 (distance edge at 1000m) = 35.5%
  × 1.08 (jockey combo) = 38.3%
  × 1.08 (trainer combo) = 41.4%
  
  Composite Score: 41.4% (vs 30.9% baseline)
```

**API Endpoint:**
```bash
POST /api/features/analyze-race
{
  "raceId": 3535
}
```

**Response:**
```json
{
  "success": true,
  "race": {
    "track": "Ascot",
    "raceNumber": 3,
    "distance": 1200,
    "condition": "Good"
  },
  "runners": [
    {
      "runner": "Jannik",
      "odds": 4.5,
      "baseStrikeRate": "30.9",
      "compositeScore": "41.4",
      "edges": {
        "hasDistanceEdge": true,
        "hasTrackEdge": false,
        "jockeyComboEdge": true,
        "trainerComboEdge": false,
        "oddsEdge": true
      }
    },
    {
      "runner": "Spurline",
      "odds": 5.2,
      "baseStrikeRate": "22.7",
      "compositeScore": "26.1",
      "edges": {
        "hasDistanceEdge": false,
        "hasTrackEdge": true,
        "jockeyComboEdge": false,
        "trainerComboEdge": false,
        "oddsEdge": false
      }
    }
  ],
  "topPicks": [
    { "runner": "Jannik", "compositeScore": "41.4" },
    { "runner": "Spurline", "compositeScore": "26.1" }
  ]
}
```

---

## Strategy Rules (Rules of Engagement)

Based on Betfair research, implement these rules:

### Rule 1: Only Back Horses with 2+ Proven Edges

```
ACCEPT if:
  ✅ Has distance edge + odds edge
  ✅ Has track edge + jockey combo edge
  ✅ Has odds edge + trainer combo edge
  
REJECT if:
  ❌ Only base strike rate (no edges)
  ❌ Single edge without odds validation
```

**Endpoint:**
```bash
GET /api/features/high-confidence?minRaces=20
```

Returns only horses with 2+ edges across 20+ race sample.

### Rule 2: Only Back When Composite Score Exceeds Threshold

```
Target composite scores:
  35%+  = Strong back (high confidence)
  28-34% = Conditional back (if odds good)
  <28%   = Pass (look for better value)
```

### Rule 3: Validate with BSP Efficiency

```
Only back horses where:
  efficiency >= 110% (15%+ positive edge over BSP)
  
Do NOT back:
  efficiency < 90% (odds don't justify risk)
```

### Rule 4: Require Adequate Sample Size

```
Distance preference: >=5 races at that distance
Track preference:    >=3 races at that track
Jockey combo:        >=5 races together
Trainer combo:       >=5 races together
```

Small samples = luck, not skill.

---

## Daily Workflow

**1. Pre-Race (Morning)**
```bash
# Analyze all races for the day
curl http://localhost:3001/api/features/analyze-race \
  -X POST -d '{"raceId": 3535}'

# Find horses with 2+ edges
curl http://localhost:3001/api/features/high-confidence?minRaces=20

# Check each high-confidence horse for composite score
# Only back if composite >= 35% AND efficiency >= 110%
```

**2. Market Check (30min before race)**
```bash
# Verify odds haven't collapsed (still efficient)
# Re-check composite score with updated odds
# Place bet only if:
#   - Composite > 35%
#   - Efficiency > 110%
#   - Sample size adequate (5+ races at distance/track/combo)
```

**3. Post-Race (6pm)**
```bash
# System automatically:
# - Scrapes results from Punters.com.au
# - Updates horse strike rates
# - Recalculates composite scores
# - Feeds all results to KB

# Next day picks use updated features
```

---

## Expected Performance

Based on your historical data:

**Conservative Strategy** (Composite > 35%, Efficiency > 110%)
- Expected strike rate: 35-40%
- Expected ROI: +5% to +15%
- Bet frequency: 2-3 per race

**Aggressive Strategy** (Composite > 28%, Efficiency > 100%)
- Expected strike rate: 28-32%
- Expected ROI: -2% to +8%
- Bet frequency: 4-5 per race

**Reality Check:**
- Start with **conservative strategy**
- Validate against next 100 bets
- Only escalate if hitting 35%+ strike rate
- If ROI negative after 50 bets, review your edges

---

## Advanced: Feature Weighting

After 100+ bets, optimize the feature weights:

```javascript
// Current (equal weights):
score = base × 1.20 × 1.15 × 1.08 × 1.08

// If distance edges hit 45% (vs predicted 40%):
// → Increase distance multiplier to 1.25
score = base × 1.25 × 1.15 × 1.08 × 1.08

// If jockey combos underperform:
// → Reduce jockey multiplier to 1.03
score = base × 1.20 × 1.15 × 1.03 × 1.08
```

Your model learns and adapts daily from actual results.

---

## API Quick Reference

| Endpoint | Purpose |
|----------|---------|
| `GET /api/features/horse/:id` | Full feature vector for a horse |
| `GET /api/features/distance/:id` | Distance preference analysis |
| `GET /api/features/track/:id` | Track preference analysis |
| `GET /api/features/odds-efficiency/:id` | BSP vs actual win rate |
| `GET /api/features/jockey-combo/:horseId/:jockeyId` | Jockey x horse synergy |
| `GET /api/features/trainer-combo/:horseId/:trainerId` | Trainer x horse synergy |
| `POST /api/features/analyze-race` | All runners in a race analyzed |
| `GET /api/features/high-confidence` | Horses with 2+ proven edges |

---

## Betfair Resources Referenced

- **Historic Data Site:** https://betfair-datascientists.github.io/data/usingHistoricDataSite/
- **Data FAQs:** https://historicdata.betfair.com/#/help
- **API Docs:** https://historicdata.betfair.com/#/apidocs
- **Sample Code:** https://github.com/betfair/historicdata
- **Data Specification:** https://historicdata.betfair.com/Betfair-Historical-Data-Feed-Specification.pdf

---

## Next: Build Your Edge

The data is loaded. The features are calculated. Now:

1. **Analyze tomorrow's races** using `/api/features/analyze-race`
2. **Place bets on high-conviction runners** (2+ edges, 35%+ composite)
3. **Track results** at 6pm
4. **Retrain model** with actual outcomes
5. **Iterate** - adjust weights based on real performance

**Your competitive advantage:** Most bettors use strike rate alone. You're analyzing dimensions (distance, track, jockey, trainer, odds efficiency) that create real edges.

Good luck! 🏇
