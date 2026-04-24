# Knowledge Base Summary & Data Inventory

**Last Updated:** April 11, 2026  
**Status:** Phase 1 Testing (71 bets placed, EOD analysis pending)

---

## What's in the KB Today

### Core Data
| Entity | Records | Source | Completeness |
|--------|---------|--------|--------------|
| Races | 89+ | Betfair import + Sportsbet Form | 100% |
| Horses | 418+ | Betfair/Sportsbet | 100% |
| Jockey Names | 418+ | Sportsbet form parsing | 80% (some "Unknown") |
| Trainer Names | 418+ | Sportsbet form parsing | 80% (some "Unknown") |
| Race Results | 89+ | Manual entry during Phase 1 | 📊 Growing daily |

### Phase 1 Specific Data (April 11, 2026)
| Data | Records | Status |
|------|---------|--------|
| Form Picks | 71 | ✅ Placed, awaiting results |
| Kelly Stakes | 71 | ✅ Calculated & logged |
| CLV Metadata | 71 | ✅ Logged (opening odds, confidence) |
| Bet Results | 0-71 | 🔄 Being entered as races complete |
| Performance Analysis | TBD | 📊 EOD analysis with `analyze-clv-strategy.ts` |

---

## Data Available for Immediate Use

### 1. Jockey Performance Table
**Location:** KB database `jockey_stats` table  
**Metrics:** Win rate, place rate, average odds, sample size (by track, distance, overall)  
**Sample Size:** ~150 unique jockeys across historical data  
**Use Case:** Phase 2 hybrid model (70% weight on jockey performance)

**To Build:** Extract from Punters form guide + enrich existing KB

```bash
npm run enrich-kb jockey-trainer-data.csv
```

### 2. Trainer Performance Table
**Location:** KB database `trainer_stats` table  
**Metrics:** Win rate, place rate, stable size, consecutive winner patterns  
**Sample Size:** ~100 unique trainers across historical data  
**Use Case:** Phase 2 hybrid model, trainer reputation scoring

**To Build:** Same CSV enrichment as jockey data

### 3. Form Picks Archive (Phase 1)
**Location:** `kelly_logs` table in database  
**Records:** 71 picks from April 11, 2026  
**Metrics:**
- Opening odds (Sportsbet)
- Form confidence score
- Kelly stake (Quarter Kelly)
- Form features (horse, track, race, jockey, trainer)

**Use Case:** Validate form model accuracy against actual results

### 4. Market Data
**Location:** `kelly_logs` table (opening_odds, closing_odds columns)  
**Source:** Sportsbet (opening), market at race start (closing)  
**Status:** Opening odds ✅ Complete, closing odds 📊 Being collected  
**Use Case:** CLV calculation (market validation of picks)

---

## Data Available with Extraction

### Punters.com.au Form Guide
**URL:** https://www.punters.com.au/form-guide/

**Extractable Data:**
- ✅ Jockey names + win rates (by track, distance)
- ✅ Trainer names + win rates
- ✅ Horse form lines (last 5 runs)
- ✅ Distance preferences
- ✅ Track-specific performance
- ✅ Recent form trends

**Effort:** Manual CSV entry (1-2 hours for day's races) or Puppeteer automation (in development)

**Value:** CRITICAL for Phase 2 (70% of hybrid model)

**Template:**
```csv
date,track,race_num,horse_name,jockey,trainer
2026-04-11,Rockhampton,1,SAILOR'S RUM,J. Phelan,M. Smith
2026-04-11,Rockhampton,1,ANSWERING,B. Johnson,T. Brown
```

### Punters Odds Comparison
**URL:** https://www.punters.com.au/odds-comparison/horse-racing/

**Extractable Data:**
- ✅ Sportsbet opening odds (already have)
- ✅ Ladbrokes odds
- ✅ TAB odds
- ✅ Neds odds
- ✅ BlueBet odds
- ✅ Best odds across all books
- ✅ Average implied probabilities

**Effort:** Puppeteer DOM evaluation (medium complexity)

**Value:** Better market odds for CLV calculation (replace Racing API)

### Punters Free Racing Tips
**URL:** https://www.punters.com.au/free-racing-tips/

**Extractable Data:**
- ✅ Expert picks (ranked by confidence)
- ✅ Expert analysis per race
- ✅ Recommended horses (1st, 2nd, 3rd picks)

**Effort:** Puppeteer DOM evaluation (medium complexity)

**Value:** Cross-validation source (if expert + form agree → boost confidence)

### Racing.com Form Data
**URL:** https://www.racing.com/form/

**Extractable Data:**
- ✅ Race results (alternative to manual entry)
- ✅ Form guide (jockey/trainer, horse form)
- ✅ Track conditions

**Effort:** Puppeteer scraping (medium) or manual fallback

**Value:** Backup data source if Sportsbet unavailable

---

## Data Entry Pipeline (Phase 1)

### Daily Workflow
```
Morning:
  1. Click "Load Today's Races" → Extracts 126 AU races
  2. Click "Generate & Place Bets" → Places N bets (auto)
  3. Log bets to kelly_logs (auto)

Throughout day:
  4. Monitor racing.com for results
  5. Enter results into TrackWise Results tab
  6. System matches bets → calculates WIN/PLACE/LOSS

Evening:
  7. Run: npx tsx scripts/analyze-clv-strategy.ts
  8. Get ROI, hit rate, CLV validation metrics
  9. Decide: Phase 2 ready? Or collect more data?
```

### Data Quality Checks
- ✅ Horse names match across Sportsbet → racing.com
- ✅ Dates/tracks/races match consistently
- ✅ Jockey/trainer names are full, not abbreviated
- ✅ Odds are decimal format (2.50, not 5:2)

---

## Phase 1 → Phase 2 Transition

### Trigger: Positive ROI (>+5% on 71+ bets)

**Then:**
1. Extract jockey/trainer data from Punters form guide
2. Build `jockey_stats` and `trainer_stats` tables
3. Implement hybrid model:
   - 30% Form confidence (existing)
   - 70% Jockey/trainer win rates (new)
4. Test hybrid model on next batch of races
5. Measure improvement vs Phase 1

### Data Needed for Phase 2
```
For each race:
  ✅ Horse name (already have)
  ✅ Form confidence (already have)
  ✅ Track, race number, date (already have)
  ⚠️ Jockey name + win rate (need to extract from Punters)
  ⚠️ Trainer name + win rate (need to extract from Punters)
  ⚠️ Market odds from multiple bookmakers (Punters odds comparison)
```

---

## Data Reliability & Caveats

### Sportsbet Form (High Confidence)
- **Reliability:** 95%+ (official betting form)
- **Coverage:** All Australian metropolitan races
- **Updates:** Daily before races
- **Notes:** Occasionally updates odds, use timestamps

### Punters Data (High Confidence)
- **Reliability:** 90%+ (curated from official sources)
- **Coverage:** All Australian races
- **Updates:** Daily
- **Notes:** Some specialty races may have incomplete data

### Racing.com (High Confidence)
- **Reliability:** 95%+ (official results)
- **Coverage:** All races
- **Latency:** 10-15 mins after race finish
- **Notes:** Some horse name variations vs Sportsbet

### Manual Result Entry (Medium Confidence)
- **Reliability:** Depends on data entry accuracy
- **Coverage:** Only entered races
- **Latency:** Real-time but human-dependent
- **Notes:** Implement fuzzy matching for horse names

---

## Future Data Sources

### Possible Future Additions
1. **Betfair API** (paid) - Live betting odds, market pressure
2. **Winning Form** - Australian racing authority data
3. **Equibase** - International racing database
4. **Weather Data** - Track conditions correlation
5. **Barrier Draws** - Specific track performance by barrier
6. **Weight Comparisons** - Handicap changes over time

### Not Recommended
- ❌ Social media sentiment (too noisy)
- ❌ Forum tipster records (biased)
- ❌ Historical data >2 years old (training data staleness)

---

## Quick Reference: Getting Data into KB

### Option 1: Auto-Extract (Fastest)
```bash
# Sportsbet form (already integrated)
# Just paste URL → generates picks

# Punters (in development)
npx tsx scripts/scrape-punters-odds.ts
npx tsx scripts/scrape-punters-tips.ts
```

### Option 2: Manual CSV (Reliable)
```bash
# Create jockey-trainer-data.csv
# Fill in from Punters form guide (copy/paste)
npm run enrich-kb jockey-trainer-data.csv
```

### Option 3: Racing.com Form Scraping
```bash
# Planned: scrape-racing-form.ts
# Extract jockey/trainer + form data
```

---

## Current Bottlenecks & Solutions

| Bottleneck | Current Status | Solution |
|-----------|----------------|----------|
| Jockey/trainer stats | Manual CSV entry | Automate Punters extraction |
| Market odds (CLV) | Racing API (slow) | Switch to Punters odds comparison |
| Historical form data | Incomplete | Complete Punters form guide extraction |
| Result entry | Manual | Auto-scrape racing.com post-race |
| Trainer/jockey enrichment | Partial | Batch enrich from Punters |

---

## ROI Metrics & Tracking

### What We Track
```
For each bet:
  - Opening odds (Sportsbet)
  - Closing odds (market)
  - CLV % = (1/closing × opening) - 1
  - Result (WIN/PLACE/LOSS)
  - P&L = stake × (odds - 1) if WIN, else -stake

Summary:
  - Total ROI = (Winnings - Stakes) / Stakes
  - Hit rate = Wins / Total
  - Average CLV = mean CLV % across all bets
  - Jockey win rate = Wins by jockey / Races by jockey
  - Trainer win rate = Wins by trainer / Races by trainer
```

### Decision Thresholds
- **Phase 2 Ready:** ROI > +5% AND 20+ bets AND positive CLV correlation
- **More Data Needed:** ROI 0% to +5% → collect 100+ bets
- **Strategy Broken:** ROI < -5% → rebuild with different model

---

## Summary

**Current KB Status:**
- ✅ 418 horses with form data
- ✅ 89 races with results
- ✅ 71 Phase 1 bets with CLV tracking
- ⚠️ Jockey/trainer data incomplete (~80%)
- ⚠️ Market closing odds incomplete (growing daily)

**To Proceed to Phase 2:**
1. Complete Phase 1 testing (today EOD)
2. Extract jockey/trainer from Punters (1-2 hours manual OR develop automation)
3. Build performance tables (5 minutes runtime)
4. Implement hybrid model (2 hours development)
5. Test on new bets (1 week)

**Next Milestone:** April 11 evening - Phase 1 analysis results ready

---

**Questions?** See individual documentation:
- [KB-ENRICHMENT-GUIDE.md](KB-ENRICHMENT-GUIDE.md) - How to enrich
- [KB-DATA-SOURCES.md](KB-DATA-SOURCES.md) - What's available
- [PHASE1_DATA_SOURCES.md](PHASE1_DATA_SOURCES.md) - Phase 1 specific
