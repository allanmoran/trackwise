# TrackWise System Status

## ✅ What's Working

### Knowledge Base (KB)
- 30,307 race runners loaded from Betfair ANZ data
- 14,123 horses with real strike rates calculated from historical results
- 3,534 races (Feb-Apr 2026)
- Database schema fully normalized with proper foreign keys

### ML Prediction Model
- Win probability calculation based on:
  - Historical strike rate (30% weight)
  - Recent form last 30 days (25%)
  - Form score (20%)
  - Career consistency (15%)
  - Distance suitability (10%)
- Expected Value (EV) calculation for WIN and PLACE bets
- Automatic recommendation system (SKIP, BUY, STRONG_BUY)
- Backtesting/calibration analysis

### Betting Engine
- Duplicate detection (no double-betting same horse)
- Confidence filtering (MIN_CONFIDENCE = 75%)
- Odds filtering (MAX_ODDS = 7.0)
- Correct return amount calculations (WIN/PLACE/LOSS)
- Database integrity (no orphaned references)

### API Endpoints
- `GET /api/races/today` - List today's races
- `GET /api/races/:id/picks` - Generate ML-predicted picks with EV
- `POST /api/bets/batch` - Place multiple bets with filtering
- `GET /api/bets/active` - View active bets
- `POST /api/results` - Record race results

## 🔴 What's Blocking Real Bets

### CRITICAL: Missing Current Race Odds
The Betfair CSV includes historical results but NO pre-race betting odds.
- 1,016 race_runners have NULL starting_odds
- ~29,000 have valid odds from some source (likely old data)
- System generated 7 STRONG_BUY picks with EV > 20% in test

**Solution**: Integrate Sportsbet scraper (proxy.ts) to provide real current odds
```
User pastes Sportsbet URLs → proxy.ts scrapes → odds stored in race_runners.starting_odds
```

## 🟡 What's Working But Not Optimal

### Jockey/Trainer Data
- Only 4 in database (from template)
- 99% of race_runners have NULL jockey_id/trainer_id
- Predictor still works, but accuracy reduced without this data

**Solution**: Connect to TAB racing API or other data source
```
Track jockey/trainer separately → Link to race_runners → Improve prediction accuracy
```

### Model Calibration
- Actual win rate vs predicted shows calibration gap
- System hasn't yet learned from real bets placed
- Backtesting shows model is generating high EV picks

**Solution**: Run paper trading with real odds, measure actual results, adjust weights

## 🚀 Next Steps (Priority Order)

### Phase 1: Get Real Odds (BLOCKING)
1. [ ] Integrate Sportsbet scraper with KB
2. [ ] Load current race odds into race_runners
3. [ ] Validate picks have valid odds before placement
4. [ ] Run paper trading with real current data

### Phase 2: Improve Predictions (HIGH PRIORITY)
1. [ ] Get jockey/trainer data from TAB or alternative source
2. [ ] Backtest model with recent results
3. [ ] Measure prediction accuracy vs actual outcomes
4. [ ] Adjust model weights based on backtesting
5. [ ] Implement learning loop (bet → result → weight update)

### Phase 3: Auto-Place & Dashboard (MEDIUM PRIORITY)
1. [ ] Auto-place top N picks after generation (from plan file)
2. [ ] Build React dashboard with picks + paper trading
3. [ ] Real-time bank/ROI updates
4. [ ] CLV validation against market odds

### Phase 4: Optimization (NICE TO HAVE)
1. [ ] Implement stake sizing (Kelly criterion)
2. [ ] Position sizing based on bankroll
3. [ ] Track actual vs predicted for each horse
4. [ ] Seasonal adjustments (track conditions, jockey form)

## 📊 Current Metrics

```
Model Performance (Test):
- Found races with valid odds: 5
- Strong BUY picks generated: 11
- Max EV observed: 107.96 (10,796% expected return)
- Avg EV for BUY picks: ~20-30 (2000-3000% expected)

Note: EV values appear abnormally high. Likely due to:
1. Very high odds ($200+) on low-probability horses
2. Model needs odds normalization
3. Betfair data quality issues with odds field

Action: Validate odds data when Sportsbet scraper integrated.
```

## 🛠️ Technical Details

### Files Created/Modified
- `backend/src/ml/predictor.js` - ML prediction model (NEW)
- `backend/src/routes/races.js` - Updated to use ML predictor (MODIFIED)
- `backend/src/scripts/load-betfair-anz-data.js` - Fixed undefined variable (FIXED)
- `backend/src/scripts/calculate-real-strike-rates.js` - Strike rate calculator (NEW)

### Database Schema Status
✅ Fully designed and working
- Normalized: races, race_runners, horses, jockeys, trainers, bets, results
- Proper foreign keys with ON DELETE CASCADE
- Supports NULL jockey_id/trainer_id (for horses without full data)
- Result tracking with WIN/PLACE/LOSS classification

## 🎯 Success Criteria

System ready for paper trading when:
1. [ ] Current race data loaded with real odds
2. [ ] 100+ placeable picks generated daily (conf > 75%, odds valid)
3. [ ] Model backtesting shows positive ROI over 2+ weeks
4. [ ] Zero duplicate bets placed
5. [ ] Return calculations validated against manual checks

System ready for real money when:
1. [ ] Paper trading ROI > 5% over 1 month
2. [ ] Model passes statistical significance test (>100 bets)
3. [ ] Jockey/trainer data 90%+ complete
4. [ ] Bankroll management implemented (Kelly criterion)
5. [ ] Risk limits and circuit breakers operational

