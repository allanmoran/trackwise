# Knowledge Base Status Report

## Data Population ✅
- **Races**: 3,534 (Feb-Apr 2026)
- **Race Runners**: 30,307
- **Horses**: 14,123 (9,242 with real strike rates from historical results)
- **Jockeys**: 4 (template only)
- **Trainers**: 4 (template only)

## Critical Issue: Missing Odds ❌
All Betfair race runners have **NULL starting_odds** because:
- Betfair CSV only provides historical race data + results
- Betfair data does NOT include pre-race betting odds
- Without odds, system cannot:
  - Place real bets
  - Calculate Closed Line Value (CLV)
  - Filter by odds thresholds
  - Evaluate ROI

## Confidence Scoring Problem ❌
Picks show 17-18% confidence because:
- Strike rates: 0% for most horses (haven't won yet)
- Form scores: All default value (60)
- ROI: All 0 (not learned from actual betting)
- Jockey/Trainer: 99% missing data

**Result**: 0 out of 30,307 picks pass 75% confidence threshold

## What Works ✅
- Database schema fully normalized
- Strike rate calculation from historical results
- Confidence formula (though needs weighting adjustment)
- Picks generation API endpoint
- Bet deduplication & placement logic
- Return amount calculations (WIN/PLACE/LOSS)

## What's Needed to Go Live 🔴

### 1. Real Odds Source (BLOCKING)
Current system designed around Sportsbet form URLs:
- `proxy.ts` scrapes Sportsbet for current race odds
- Frontend pastes Sportsbet URLs
- Scraper extracts: track, race #, runners, odds, form
- Should store odds in `race_runners.starting_odds`

**Action**: Integrate Sportsbet scraper with KB loading

### 2. Real Jockey/Trainer Linkage
- Only 4 jockeys/trainers in DB
- 99% of race_runners have NULL jockey_id/trainer_id
- Punters scraping failed (page structure issues)

**Alternatives**:
- TAB racing data API (might include jockey/trainer)
- Racing.com API
- Manual data entry for major races

### 3. Confidence Formula Adjustment
Current formula gives too much weight to strike rate (35%) which is 0% for most horses.

**Suggested adjustment**:
- Reduce strike rate weight to 20%
- Increase form score weight to 50%
- Add "recency bonus" for recent races
- Or: Shift to pure form/position-based scoring without strike rates

### 4. Real Betting Results for Learning
- Strike rates calculated, but ROI = 0 everywhere
- System can't learn without actual bet results
- Need feedback loop: place bet → get result → update ROI

## Next Steps
1. ✅ Betfair data loaded (historical reference)
2. ❌ Get current race odds (Sportsbet scraper integration)
3. ❌ Enrich jockey/trainer data
4. ⚠️ Adjust confidence formula for sparse data
5. ⚠️ Run paper trading with real current odds
6. ⚠️ Validate CLV and pick quality

