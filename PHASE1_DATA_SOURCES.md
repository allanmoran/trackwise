# Phase 1: Available Data Sources for Strategy Enhancement

## Current Status (April 11, 2026)
- ✅ 71 bets placed using Strategy V2 (form-based picks with filters)
- ✅ Running Phase 1 test WITHOUT pre-race CLV validation
- 🔄 Waiting for races to complete to measure actual ROI
- 📊 Will run `analyze-clv-strategy.ts` at end of day to validate form model

---

## Data Sources Discovered

### 1. Punters.com.au - Free Racing Tips
**URL:** https://www.punters.com.au/free-racing-tips/

**What's Available:**
- Expert picks organized by track and race
- Tip rankings (1st, 2nd, 3rd recommendations)
- Detailed form analysis for each race
- Track, race number, horse name structured data

**Challenge:** Heavily JavaScript-rendered, requires Puppeteer evaluation

**Use Case for Phase 2:**
- Cross-validate form picks against expert tips
- If both form model + expert tip recommend same horse → boost confidence
- Consensus filtering (only place if form + expert agree)

**Implementation Effort:** Medium (needs refined DOM evaluation)

---

### 2. Punters.com.au - Form Guide
**URL:** https://www.punters.com.au/form-guide/

**What's Available:**
- Horse historical form (wins, places, shows)
- Track-specific performance
- Distance preferences
- Jockey/trainer statistics
- Recent form trends
- Speed ratings
- Weight/handicap data

**Challenge:** Large page (3.2MB), requires parsing complex data structure

**Use Case for Phase 2:**
- Extract jockey/trainer win rates (critical for Phase 2 hybrid model)
- Horse weight/handicap analysis
- Track-specific ratings
- Form trend indicators

**Implementation Effort:** High (large dataset, complex structure)
**Impact:** CRITICAL for Phase 2 (70% weight in jockey/trainer features)

---

### 3. Punters.com.au - Odds Comparison
**URL:** https://www.punters.com.au/odds-comparison/horse-racing/

**What's Available:**
- Multi-bookmaker odds aggregation
- Ladbrokes, Sportsbet, TAB, Neds, BlueBet, etc.
- Real-time odds updates
- Line movement tracking
- Best odds identification

**Challenge:** JavaScript-rendered with dynamic data loading

**Use Case for Phase 1 NOW:**
- Replace Racing API as market odds source (more reliable, free)
- Better CLV validation using aggregated market odds
- Detect line movements (market consensus)

**Use Case for Phase 2:**
- Track which bookmaker moves odds fastest
- Identify steamed odds (sharp money)
- Use best odds across all books for CLV calculation

**Implementation Effort:** Medium (JavaScript evaluation needed)
**Impact:** HIGH (solves CLV market odds problem)

---

### 4. Punters.com.au - Forum
**URL:** https://www.punters.com.au/forum/horse-racing/

**What's Available:**
- Community tips and discussions
- Betting sentiment/consensus
- Expert member insights
- Tipster track records
- Crowd wisdom

**Challenge:** Unstructured discussion format

**Use Case for Future:**
- Sentiment analysis (is community backing the pick?)
- Crowd consensus confidence
- Contrarian opportunity detection

**Implementation Effort:** Very High (NLP required)
**Impact:** Low (noisy signal)

---

### 5. Sportsbet Form (Current Integration)
**URL:** https://www.sportsbetform.com.au/{track-id}/{race-id}/

**What's Available:**
- Form card data (barriers, weights, odds)
- Jockey/trainer info
- Recent form
- Speed ratings
- Track conditions

**Current Use:**
- Primary source for picks (parsed via proxy.ts)
- Opening odds for CLV calculation
- Confidence scoring

**Status:** ✅ Fully integrated

---

### 6. Racing.com (Alternative)
**URL:** https://www.racing.com/form/{date}/{track}/race/{num}

**What's Available:**
- Alternative form source
- Historical race results
- Trainer/jockey stats

**Status:** ⚠️ Exploratory (tried Racing API, requires paid add-on for Australia)

---

## Recommended Implementation Priority

### Phase 1 (NOW - Validate CLV hypothesis with 71 bets)
1. ✅ Keep current form-based picks
2. ✅ CLV logging with whatever odds available
3. ✅ Run analysis at EOD to measure ROI

### Phase 2 (After Phase 1 validation)
**Priority 1: Form Guide Data (Jockey/Trainer Stats)**
- Extract from Punters form guide
- Implement jockey win rate features (60-70% of model)
- Implement trainer win rate features
- Test hybrid model: 30% form + 70% jockey/trainer

**Priority 2: Odds Comparison Integration**
- Replace Racing API with Punters odds comparison
- Use average odds across bookmakers for CLV
- Implement line movement tracking
- Better market validation

**Priority 3: Expert Tips Cross-Validation**
- Extract Punters expert tips
- Use as confidence booster (if expert + form agree)
- Implement consensus filtering

---

## Technical Approach for Extraction

### JavaScript-Heavy Pages (Tips, Form Guide, Odds)
```typescript
// Pattern for Puppeteer-based extraction:
1. Load page with 'domcontentloaded' wait
2. Wait 2-3 seconds for JS rendering
3. Use page.evaluate() to run extraction in browser context
4. Access rendered DOM via document.querySelectorAll()
5. Parse structured data from CSS classes

// Challenges:
- Some data may be lazy-loaded (need to scroll)
- Dynamic IDs (no stable selectors)
- Heavy CSS-in-JS (data in class names)
```

### Punters Odds Comparison (Most Valuable)
```typescript
// This page has multi-bookmaker odds
// Strategy: Extract from both visible text AND rendered DOM
// Fall back to bookmaker-specific scraping if Punters is too complex:
//   - Sportsbet: sportsbetform.com.au (already scraping)
//   - Ladbrokes: theloot.com.au or ladbrokes.com.au
//   - TAB: tab.com.au (has anti-bot protection, difficult)
```

---

## Alternative: Use Existing APIs

### Option A: Sports Data APIs
- **TheSportsDB** - Has Australian racing (free tier limited)
- **RapidAPI** - Various sports betting APIs (paid)
- **StatsBomb** - Historical data only

### Option B: Bookmaker Direct Scraping
- Sportsbet: ✅ Currently working (sportsbetform.com.au)
- Ladbrokes: 🟡 Feasible (loot.com.au, some anti-bot protection)
- Tab: ❌ Heavy anti-bot (headless browser detection)

### Option C: Third-party Odds Aggregators
- BetVisor (paid API)
- OddsFeed (paid, requires credentials)
- Betfair API (paid, complex)

---

## Data Available TODAY

For the 71 bets already placed:
1. ✅ Opening odds (Sportsbet)
2. ✅ Form picks data
3. ✅ Confidence scores
4. ✅ Jockey/trainer names
5. ✅ Kelly stakes

After races complete:
1. 📊 Closing odds (from Sportsbet or TAB post-race)
2. 📊 Results (WIN/PLACE/LOSS)
3. 📊 Profit/Loss calculations
4. 📊 CLV validation metrics

---

## Quick Win: Form Guide Features (No Scraping)

Until we solve Punters scraping, we can enhance picks with **manual form guide lookups**:
1. User copies form guide stats for top picks
2. Paste into TrackWise as "manual overrides"
3. System weights these features higher (70%) than form confidence (30%)
4. Test hybrid model on existing 71 bets retroactively

This lets us test Phase 2 hypothesis without waiting for scraping implementation.

---

## Summary

| Source | Difficulty | Impact | Timeline |
|--------|-----------|--------|----------|
| Sportsbet Form | ✅ Done | Current picks | NOW |
| Punters Tips | 🟡 Medium | Confidence boost | Phase 2-3 |
| Punters Odds | 🟡 Medium | Market validation | Phase 2-NOW |
| Form Guide Stats | 🔴 Hard | Critical for Phase 2 | Phase 2 |
| Manual Input | ✅ Easy | Test Phase 2 now | TODAY |

**Recommended Next Step:** Use 71 bets to test Phase 2 manually (user enters jockey/trainer stats), then build automated scraping if results validate hypothesis.
