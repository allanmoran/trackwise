# KB Data Sources & Integration Guide

## Overview
This document consolidates all discovered data sources for enriching the TrackWise Knowledge Base with jockey, trainer, horse performance, and market data.

---

## 1. Punters.com.au - Primary Data Source

### A. Form Guide Data
**URL:** https://www.punters.com.au/form-guide/

**Available Data:**
- Horse historical performance (wins, places, shows)
- Track-specific win rates
- Distance preferences
- Recent form trends (last 5 runs)
- Weight and handicap information
- Speed ratings

**Jockey Data:**
- Jockey names (linked to horses)
- Jockey win rates at specific tracks
- Jockey performance on specific distances

**Trainer Data:**
- Trainer names (linked to horses)
- Trainer win rates by track
- Trainer win rates by distance
- Stable record (consecutive winners/runners)

**Use Case for KB:**
- Populate jockey win rate table (by track, distance, overall)
- Populate trainer win rate table
- Add horse historical performance metrics
- Track form trends for confidence modeling

**Extraction Method:**
```typescript
// Puppeteer with DOM evaluation
page.evaluate(() => {
  // Access rendered form guide data via DOM
  // Parse trainer/jockey names from card headers
  // Extract stats from tables/progress bars
})
```

**Integration Priority:** 🔴 HIGH - Critical for Phase 2 hybrid model

---

### B. Odds Comparison
**URL:** https://www.punters.com.au/odds-comparison/horse-racing/

**Available Data:**
- Multi-bookmaker odds (Sportsbet, Ladbrokes, TAB, Neds, BlueBet, etc.)
- Best odds across all bookmakers
- Average implied probabilities
- Line movements

**Use Case for KB:**
- Market consensus probabilities (alternative to form model)
- Line movement tracking (steamed odds detection)
- Best available odds for CLV calculation
- Bookmaker-specific line bias (which books move first?)

**Extraction Method:**
```typescript
// Puppeteer evaluation + text parsing
page.evaluate(() => {
  // Find race containers
  // Extract horse names and odds by bookmaker
  // Calculate best + average odds
})
```

**Integration Priority:** 🟡 MEDIUM - Improves CLV validation accuracy

---

### C. Free Racing Tips
**URL:** https://www.punters.com.au/free-racing-tips/

**Available Data:**
- Expert picks (ranked by confidence: Best Bet, Strong Pick, Good Value)
- Detailed race analysis for each pick
- Expert reasoning/form analysis
- Track record of expert picks (if available)

**Use Case for KB:**
- Consensus scoring (if form + expert tip match → boost confidence)
- Expert pick archive (track expert accuracy over time)
- Alternative validation source (cross-validate form picks)

**Extraction Method:**
```typescript
// Puppeteer DOM evaluation
page.evaluate(() => {
  // Parse expert tip cards
  // Extract horse names by rank (1st tip, 2nd tip, 3rd tip)
  // Get associated analysis text
})
```

**Integration Priority:** 🟡 MEDIUM - Useful for confidence validation

---

### D. Forum & Community Data
**URL:** https://www.punters.com.au/forum/horse-racing/

**Available Data:**
- Community betting tips
- Crowd sentiment (which horses are favored by community)
- Tipster commentary and reasoning
- Form discussions

**Use Case for KB:**
- Sentiment scoring (if community backs horse, boost confidence?)
- Community tipster tracking (who are the reliable tippers?)
- Contrarian signals (if everyone backs one horse, are they wrong?)

**Extraction Priority:** 🔵 LOW - Noisy signal, requires NLP

---

## 2. Sportsbet Form (Current Primary Source)

**URL:** https://www.sportsbetform.com.au/{track-id}/{race-id}/

**Current Integration:** ✅ Fully operational

**Available Data:**
- Form card (barriers, weights, odds)
- Jockey/trainer names
- Recent form (last 5 runs)
- Speed ratings
- Track condition notes

**KB Status:**
- ✅ Horse names logged
- ✅ Opening odds logged
- ✅ Jockey/trainer logged (from form parsing)
- ✅ Race metadata logged

**Code Location:** `scripts/proxy.ts` line ~2823 (`/api/parse-sportsbet` endpoint)

---

## 3. Racing.com - Alternative Form Source

**URL:** https://www.racing.com/form/{date}/{track}/race/{num}

**Available Data:**
- Race results and form guides
- Trainer/jockey information
- Historical performance data
- Track condition information

**Status:** 🟡 Partial (attempted Racing API, requires paid add-on for Australia)

**Alternative:** Manual scraping of racing.com form pages (feasible with Puppeteer)

---

## 4. Live Market Data Sources

### Sportsbet (Current)
**URL:** https://www.sportsbetform.com.au/ (opening odds)

**Integration:** ✅ Existing
**Type:** Opening/initial odds only

### Ladbrokes
**URL:** https://www.loot.com.au/

**Integration:** ⚠️ Exploratory (anti-bot detection)
**Type:** Live + closing odds
**Use:** Market odds for CLV calculation

### TAB (Tabcorp)
**URL:** https://www.tab.com.au/

**Integration:** ❌ Difficult (heavy anti-bot protection)
**Type:** Official Australian betting exchange
**Note:** May require headless=false or additional bypass techniques

---

## 5. Strategy V2 Performance Data

### Current Metrics Collected
- ✅ Form confidence scores
- ✅ Opening odds (Sportsbet)
- ✅ Kelly stakes (Quarter Kelly)
- ✅ Jockey/trainer (from form)
- ✅ Track and race metadata
- ✅ Bet results (WIN/PLACE/LOSS)

### KB Tables for V2 Analysis
```sql
-- Existing tables with Phase 1 data:
- kelly_logs (bet-level performance data)
  - opening_odds, closing_odds, clv_percent
  - confidence, kelly_stake
  - result (WIN/PLACE/LOSS)
  
- bets (active tracking)
  - horse, jockey, trainer
  - odds, stake
  - result, pnl
  
- races (race metadata)
  - track, race_num, date
  - conditions, distance
```

---

## 6. Data Enrichment Templates

### Jockey/Trainer CSV Template
Used with `enrich-kb` script to populate jockey/trainer win rates:

```csv
date,track,race_num,horse_name,jockey,trainer
2026-04-11,Rockhampton,1,Sailor's Rum,J. Phelan,M. Smith
2026-04-11,Rockhampton,1,Answering,B. Johnson,T. Brown
2026-04-11,Rockhampton,3,Presocratics,K. Lee,P. Davis
```

**Sources for filling this:**
1. Punters.com.au form guide (automatic extraction)
2. Sportsbet form pages (manual entry)
3. Racing.com form sections (manual entry)
4. RaceNet.com.au (manual entry)

---

## 7. Phase 2 Hybrid Model - Data Requirements

### For 30% Form Component
- ✅ Form confidence score (already calculated)
- ✅ Horse recent form trend
- ✅ Track-specific ratings

### For 70% Jockey/Trainer Component (NEW)
- ⚠️ Jockey win rate (by track, distance, overall)
- ⚠️ Trainer win rate (by track, distance, overall)
- ⚠️ Jockey-Trainer combination performance

**To Fill:** Extract from Punters form guide data

---

## 8. Implementation Roadmap

### Phase 1 (Currently Running - April 11, 2026)
- ✅ Use Sportsbet form picks
- ✅ Apply Strategy V2 filters
- ✅ Place bets without pre-race market odds
- 📊 Measure actual ROI → validates form model

### Phase 2 (After Phase 1 Validation)
**IF ROI > +5%:**
1. Extract jockey/trainer data from Punters
2. Build jockey/trainer win rate tables
3. Implement hybrid model (30% form + 70% jockey/trainer)
4. Test on new batch of races
5. Measure improvement vs Phase 1

**IF ROI ≤ +5%:**
1. Collect 100+ bets before Phase 2
2. Or pivot to Punters expert tips consensus
3. Or rebuild with market-based features

---

## 9. Data Quality Standards

### Horse Names
- **Source:** Sportsbet form (authoritative)
- **Format:** UPPERCASE with proper spacing
- **Matching:** Case-insensitive comparison allowed
- **Special:** Handle hyphens, apostrophes consistently

**Examples:**
- ✅ `SAILOR'S RUM` (good)
- ✅ `LAUBERHORN` (good)
- ❌ `Sailor's Rum` (inconsistent case)
- ❌ `SAILORS RUM` (missing apostrophe)

### Jockey/Trainer Names
- **Source:** Punters form guide or Sportsbet form
- **Format:** Full names (no abbreviations)
- **Consistency:** Same person = same name across all records
- **Examples:**
  - ✅ `Mick Price & Michael Kent Jnr` (formal full name)
  - ❌ `M. Price` (abbreviated)
  - ❌ `Michael Price` (different name for same person)

### Odds Data
- **Format:** Decimal (e.g., 2.50, 4.75)
- **Source:** Sportsbet opening, market closing
- **Precision:** Two decimal places minimum
- **Range:** 1.01 to 100.0+

### Dates
- **Format:** YYYY-MM-DD (ISO 8601)
- **Source:** Race date, not entry date
- **Example:** `2026-04-11`

---

## 10. Quick Reference

### To Extract Jockey/Trainer from Punters
1. Go to https://www.punters.com.au/form-guide/
2. Find your track/race
3. Read trainer/jockey names from runner cards
4. Enter into jockey-trainer-data.csv
5. Run: `npm run enrich-kb jockey-trainer-data.csv`

### To Get Odds Comparison Data
1. Go to https://www.punters.com.au/odds-comparison/horse-racing/
2. Find your horse/race
3. Note best odds across bookmakers
4. Use for CLV calculation

### To Get Expert Tips
1. Go to https://www.punters.com.au/free-racing-tips/
2. Find your race
3. Note which horses are recommended (1st, 2nd, 3rd picks)
4. Cross-validate against form picks

---

## 11. Known Limitations & Workarounds

### Limitation: Punters pages are JavaScript-heavy
**Workaround:** Use Puppeteer with `page.evaluate()` for DOM access

### Limitation: TAB.com.au blocks automated access
**Workaround:** Use Punters odds comparison instead (aggregates TAB + others)

### Limitation: Racing API (Racing Labs) requires paid add-on for Australia
**Workaround:** Manual form extraction from racing.com or Sportsbet

### Limitation: Horse name variations across sources
**Workaround:** Implement fuzzy matching (Levenshtein distance) for KB lookups

---

## 12. Testing & Validation

### Before Adding to KB
1. **Data source is reachable** (test Puppeteer load)
2. **Data structure is parseable** (test extraction)
3. **Data matches format standards** (horse/jockey/trainer/odds)
4. **Sample of 5+ records verified** (manual spot-check)

### After Adding to KB
1. **KB query returns correct records** (SELECT * WHERE source='punters')
2. **Stats recalculated accurately** (avg CLV, jockey win rate, etc.)
3. **Phase 2 model uses new data** (hybrid model improves ROI)

---

## Summary Table

| Source | Type | Integration | Priority | Status |
|--------|------|-------------|----------|--------|
| Sportsbet Form | Form Data | ✅ Complete | Core | 🟢 Live |
| Punters Form Guide | Jockey/Trainer Stats | ⚠️ Exploratory | HIGH | 🟡 Planned |
| Punters Odds Comparison | Market Odds | ⚠️ Exploratory | MEDIUM | 🟡 Planned |
| Punters Expert Tips | Expert Consensus | ⚠️ Exploratory | MEDIUM | 🟡 Planned |
| Racing.com | Alternative Form | ⚠️ Exploratory | LOW | 🟡 Planned |
| TAB Direct | Official Betting | ❌ Blocked | MEDIUM | 🔴 Difficult |

---

**Last Updated:** April 11, 2026
**Next Review:** After Phase 1 results (EOD April 11)
**Owner:** TrackWise Strategy Team
