# Punters Data Extraction Strategy

## Overview
TrackWise can be dramatically improved by systematically extracting data from Punters.com.au.

## Data Sources & Value

### 1. **Jockeys Stats** (https://www.punters.com.au/jockeys/)
**What you get:**
- Jockey name
- Total rides
- Total wins
- Win percentage (overall)
- Win % by track
- Win % by distance
- Recent form (last 20 rides)

**How to use:**
- 70% weight in Phase 2 hybrid model
- Filter picks: only include jockeys with >15% win rate
- Boost confidence if jockey is in top 20

**Effort to extract:** Medium (table parsing)
**Value:** CRITICAL

**Example:**
```
Beau Mertens: 245 rides, 45 wins, 18.4% win rate
- Rockhampton: 32 rides, 8 wins, 25%
- Caulfield: 28 rides, 3 wins, 10.7%
```

---

### 2. **Trainers Stats** (https://www.punters.com.au/trainers/)
**What you get:**
- Trainer name
- Total runners
- Total wins
- Win percentage (overall)
- Win % by track
- Win % by distance
- Stable size

**How to use:**
- 20-30% weight in Phase 2 hybrid model
- Filter picks: only include trainers with >12% win rate at track
- Combine with jockey data for synergy scoring

**Effort to extract:** Medium (table parsing)
**Value:** CRITICAL

**Example:**
```
Mick Price & Michael Kent Jnr: 1,203 runners, 156 wins, 13%
- Rockhampton: 45 runners, 8 wins, 17.8%
- Caulfield: 134 runners, 22 wins, 16.4%
```

---

### 3. **Horse Stats** (https://www.punters.com.au/stats/horses/)
**What you get:**
- Horse name
- Career wins/places/shows
- Win rate
- Career earnings
- Last 5 runs (form line)
- Best distance
- Best track
- Barrier statistics

**How to use:**
- Validate/replace Betfair form scores
- Identify horses with form trend (improving/declining)
- Barrier bias adjustment
- Distance preferences

**Effort to extract:** High (complex page, pagination)
**Value:** HIGH (enriches existing data)

**Example:**
```
SAILOR'S RUM: 12 starts, 2 wins, 1 place, 16.7% win rate
- Best distance: 1400m
- Best track: Rockhampton (2W from 3)
- Last 5: 1-3-2-0-1 (improving)
- Barrier 2: 3 wins from 4
```

---

### 4. **Racing Results** (https://www.punters.com.au/racing-results/)
**What you get:**
- Historical race outcomes
- Winner, place getters
- Odds (opening/closing/TAB)
- Track condition
- Race distance
- Prizemoney

**How to use:**
- Validate form model accuracy (did favorites win?)
- Build historical dataset of actual CLV
- Identify market biases
- Calculate jockey/trainer win rates from race data

**Effort to extract:** Very High (large dataset, pagination, historical)
**Value:** VERY HIGH (validates entire strategy)

**Use case:**
```
After placing bets:
- Scrape results pages
- Match your bets against actual winners
- Calculate actual ROI vs predicted
- Validate CLV hypothesis
```

---

### 5. **Odds Comparison** (https://www.punters.com.au/odds-comparison/horse-racing/)
**What you get:**
- Real-time odds from all bookmakers
- Sportsbet, Ladbrokes, TAB, Neds, BlueBet, etc.
- Best odds
- Average/consensus odds
- Line movements (if tracked over time)

**How to use:**
- CLV calculation (replace Racing API)
- Market consensus (if 7+ bookmakers agree, market is confident)
- Identify mismatch: if your pick < consensus odds, value exists
- Track bookmaker behavior (do TAB move first?)

**Effort to extract:** Medium (JavaScript rendering, table parsing)
**Value:** CRITICAL (solves market odds problem)

**Example:**
```
SAILOR'S RUM: 4.80 (Sportsbet) vs 4.50 (Ladbrokes) vs 4.70 (TAB)
- Best: 4.50
- Average: 4.67
- If we're backing at 5.00: +7.1% CLV vs market
```

---

### 6. **Track Statistics** (https://www.punters.com.au/tracks/)
**What you get:**
- Track name
- Track records by trainer
- Track records by jockey
- Track conditions (firm/good/soft/heavy)
- Track bias (favor speed/stamina)
- Meeting schedule

**How to use:**
- Identify track specialists (jockeys/trainers who dominate specific venues)
- Adjust picks for track condition
- Avoid jockeys/trainers with poor track records
- Track bias adjustments (if soft track favors early speed, adjust pick confidence)

**Effort to extract:** Medium (multiple pages per track)
**Value:** MEDIUM (useful for filtering)

---

## Implementation Priority

### Phase 2A (Immediate - 1 week)
**Focus: Get jockey/trainer stats into KB**
1. Scrape Punters jockeys page → extract win % by track/distance
2. Scrape Punters trainers page → extract win % by track/distance
3. Store in `jockey_stats` and `trainer_stats` tables
4. Use in pick generation (filter + weighting)
5. Test Phase 2 hybrid model on 50+ new bets

**Expected impact:** +5-15% ROI improvement

### Phase 2B (Week 2)
**Focus: Enhance horse data**
1. Scrape Punters horse stats → extract form trends, best track/distance
2. Enrich existing 33k horses with Punters data
3. Add distance preference feature
4. Add track preference feature

**Expected impact:** Additional +2-5% improvement

### Phase 2C (Week 3)
**Focus: Market data & validation**
1. Scrape Odds Comparison → get multi-bookie consensus
2. Replace Racing API with Punters odds
3. Calculate accurate CLV for each bet
4. Validate Phase 1 + Phase 2 performance

**Expected impact:** Better CLV confidence, reduced variance

### Phase 3 (Ongoing)
**Focus: Historical validation**
1. Scrape 6-12 months of Racing Results
2. Calculate actual jockey/trainer win rates
3. Compare to Punters published stats
4. Identify changing form (form-up vs form-down trainers)

**Expected impact:** Confidence in jockey/trainer stats, early detection of form changes

---

## How to Extract (Given Puppeteer Limitations)

### Option A: Frontend Browser (Easiest)
1. User visits Punters page in browser
2. Click "Extract Data" button in TrackWise
3. JavaScript extracts table data
4. Submit to `/api/enrich/*` endpoints
5. System stores in KB

**Pros:** No server-side browser needed, user controls scope
**Cons:** Manual, one page at a time

### Option B: Manual Copy/Paste (Reliable)
1. User visits Punters page
2. Selects and copies table data
3. Pastes into TrackWise "Import" dialog
4. System parses CSV and stores

**Pros:** Works 100%, no scraping issues
**Cons:** Labor-intensive, tedious

### Option C: Server-Side via Cheerio (Best)
1. Create Node.js script that:
   - Fetches Punters pages via axios
   - Parses HTML with cheerio (no browser needed)
   - Extracts table data
   - Stores in KB

**Pros:** Fully automated, can run on schedule
**Cons:** May need user-agent rotation if Punters blocks

---

## Quick Win: Start with Jockeys

Let me show you the highest-impact, easiest extraction:

**Jockeys Page** (https://www.punters.com.au/jockeys/)
- Already a simple table
- Easy to parse
- 70% of Phase 2 weight
- Would give immediate +5-10% ROI boost if extracted

**What we'd store:**
```
name | total_rides | total_wins | win_pct | rockhampton_pct | caulfield_pct | recent_form
Beau Mertens | 245 | 45 | 18.4% | 25% | 10.7% | +3 (improving)
Daniel Stackhouse | 189 | 31 | 16.4% | 22% | 14% | -2 (declining)
...
```

**Pick filtering would then be:**
- Skip jockeys <15% overall win rate
- Skip jockeys <20% at specific track
- Boost confidence if jockey trending up
- Check recent 5 rides for form

---

## APIs Available

Some good news: Punters may have undocumented APIs.

Try these in browser console:
```javascript
// Check if Punters has API
fetch('https://www.punters.com.au/api/jockeys')
  .then(r => r.json())
  .then(console.log)

fetch('https://www.punters.com.au/api/trainers')
  .then(r => r.json())
  .then(console.log)

fetch('https://www.punters.com.au/api/horse-stats')
  .then(r => r.json())
  .then(console.log)
```

If these work, extraction becomes trivial.

---

## Summary

**What we can get from Punters:**

| Data | Effort | Value | Phase |
|------|--------|-------|-------|
| Jockey stats | 🟢 Easy | 🔴 CRITICAL | 2A |
| Trainer stats | 🟢 Easy | 🔴 CRITICAL | 2A |
| Horse stats | 🟡 Medium | 🟡 HIGH | 2B |
| Odds comparison | 🟡 Medium | 🔴 CRITICAL | 2C |
| Track stats | 🟡 Medium | 🟡 MEDIUM | 2B |
| Racing results | 🔴 Hard | 🔴 CRITICAL | 3 |

**Recommendation:**
1. Start with **Jockeys** (highest ROI/effort ratio)
2. Add **Trainers** (same effort, equal value)
3. Then **Odds Comparison** (unlocks CLV)
4. Then **Horse Stats** (refinement)
5. Then **Racing Results** (validation)

**Expected total improvement:** +15-25% ROI vs Phase 1
