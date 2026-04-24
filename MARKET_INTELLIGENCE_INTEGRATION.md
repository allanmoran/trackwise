# Market Intelligence Integration Guide

How to use market intelligence in your daily betting workflow.

---

## Daily Workflow with Market Intelligence

### 6:00 AM - Generate Initial Picks

**Current workflow:**
```bash
# Load today's races
curl -X POST http://localhost:3001/api/form-scraper/batch \
  -d '{"urls": ["...sportsbet form URLs..."]}'

# Generate picks from races
curl -X POST http://localhost:3001/api/features/analyze-race \
  -d '{"raceId": 3535}'
```

Response:
```json
{
  "runners": [
    {
      "runner": "Jannik",
      "odds": 4.5,
      "baseStrikeRate": "30.9",
      "compositeScore": "41.4",
      "edges": { ... }
    }
  ],
  "topPicks": [...]
}
```

---

### 8:00 AM - Enhance Picks with Market Intelligence

**New step: Add market signals**

```bash
curl -X POST http://localhost:3001/api/intelligence/analyze-with-signals \
  -H "Content-Type: application/json" \
  -d '{
    "raceId": 3535,
    "picks": [
      {
        "horseId": 1937,
        "horse": "Jannik",
        "odds": 4.5,
        "confidence": 72
      }
    ]
  }'
```

Response:
```json
{
  "enhancedPicks": [
    {
      "horseId": 1937,
      "horse": "Jannik",
      "odds": 4.5,
      "confidence": 72,
      "marketIntelligence": {
        "originalConfidence": 72,
        "boostedConfidence": 82,
        "boost": 10.2,
        "reason": "Market momentum accelerating + BSP typically tightens"
      }
    }
  ],
  "summary": {
    "topPick": { "horse": "Jannik", "boostedConfidence": 82 }
  }
}
```

---

### 9:00 AM - Verify Value with BSP Prediction

**Before placing bets, check if opening odds are good value:**

```bash
curl -X POST http://localhost:3001/api/intelligence/compare-odds \
  -H "Content-Type: application/json" \
  -d '{
    "picks": [
      { "horseId": 1937, "horse": "Jannik", "odds": 4.5 }
    ]
  }'
```

Response:
```json
{
  "comparisons": [
    {
      "horse": "Jannik",
      "openingOdds": "4.50",
      "predictedBSP": "3.95",
      "expectedGain": "13.9%",
      "isValue": true,
      "verdict": "VALUE"
    }
  ]
}
```

**Decision logic:**
```
IF expectedGain > 5%:
  "Opening odds are significantly better than predicted BSP"
  → PLACE BET (good value)

IF expectedGain between 0-5%:
  "Fair value, proceed if model confidence > 70%"
  → PLACE BET IF confidence > 70%

IF expectedGain < 0%:
  "Opening odds worse than expected BSP"
  → SKIP (bad value)
```

---

### 9:30 AM - Place Bets with Enhanced Confidence

**Updated bet placement:**

```bash
curl -X POST http://localhost:3001/api/bets \
  -H "Content-Type: application/json" \
  -d '{
    "horse_id": 1937,
    "jockey_id": 123,
    "trainer_id": 45,
    "bet_type": "WIN",
    "stake": 25,
    "opening_odds": 4.5,
    "confidence": 82,
    "market_signals": {
      "movement_trend": "ACCELERATING",
      "bsp_prediction": 3.95,
      "informed_betting_detected": true,
      "boost_reason": "Market momentum + BSP value"
    }
  }'
```

**Benefits:**
- ✅ Uses market-boosted confidence (82 vs 72)
- ✅ Tracks why confidence was boosted
- ✅ Verified opening odds offer value
- ✅ Detected market agreement

---

## Integration Patterns

### Pattern 1: Add to Existing analyze-race Endpoint

Update `backend/src/routes/feature-analysis.js`:

```javascript
// In the POST /api/features/analyze-race handler
import { MarketIntelligence } from '../ml/market-intelligence.js';

// After analyzing features, enhance with market signals
const analysis = runners.map(runner => {
  const features = FeatureEngineer.generateFeatureVector(...);
  
  // NEW: Add market intelligence boost
  const marketBoost = MarketIntelligence.getConfidenceBoost(
    runner.horse_id,
    runner.starting_odds,
    features.compositeScore
  );
  
  return {
    ...features,
    marketIntelligence: {
      originalCompositeScore: features.compositeScore,
      boostedCompositeScore: features.compositeScore + parseFloat(marketBoost.boost),
      boostReason: marketBoost.reason
    }
  };
});
```

---

### Pattern 2: Pre-Bet Validation

Add to bet placement logic:

```javascript
async function validateBetBeforePlacing(pick) {
  // Check 1: Model confidence
  if (pick.confidence < 70) {
    return { approved: false, reason: "Confidence too low" };
  }

  // Check 2: Odds efficiency
  if (pick.efficiency < 110) {
    return { approved: false, reason: "Odds not efficient" };
  }

  // NEW: Check 3: Value via BSP prediction
  const bspAnalysis = MarketIntelligence.predictBSP(
    pick.horseId,
    pick.odds
  );
  
  if (bspAnalysis.status === 'SUCCESS') {
    const expectedGain = ((pick.odds - parseFloat(bspAnalysis.predictedBSP)) 
                         / parseFloat(bspAnalysis.predictedBSP)) * 100;
    
    if (expectedGain < 0) {
      return { approved: false, reason: "Opening odds worse than predicted BSP" };
    }
  }

  // NEW: Check 4: Market signals
  const signals = MarketIntelligence.analyzeMarketMovement(pick.horseId);
  if (signals.status === 'SUCCESS' && signals.trend === 'DECELERATING') {
    return { approved: false, reason: "Market momentum declining" };
  }

  return { approved: true, checks: 4 };
}
```

---

### Pattern 3: Daily Compliance Check

Add to morning routine:

```bash
#!/bin/bash

echo "=== TrackWise Daily Compliance Check ==="

# Check 1: Golden Rules compliance
COMPLIANCE=$(curl -s http://localhost:3001/api/compliance/report)
SCORE=$(echo $COMPLIANCE | jq -r '.report.overallScore')
echo "📊 Compliance Score: $SCORE"

# Check 2: System health
HEALTH=$(curl -s http://localhost:3001/api/logging/health)
STATUS=$(echo $HEALTH | jq -r '.health.status')
echo "🏥 System Health: $STATUS"

# Check 3: Bankroll safeguards
RULE7=$(curl -s http://localhost:3001/api/compliance/rule/7)
BANKROLL_STATUS=$(echo $RULE7 | jq -r '.check.status')
echo "🏦 Bankroll: $BANKROLL_STATUS"

# Check 4: No recent errors
ERRORS=$(curl -s "http://localhost:3001/api/logging/errors?hours=24&limit=5")
ERROR_COUNT=$(echo $ERRORS | jq '.count')
echo "⚠️  Errors (24h): $ERROR_COUNT"

# Summary
if [ "$SCORE" = "100%" ] && [ "$STATUS" = "HEALTHY" ] && [ "$ERROR_COUNT" -eq "0" ]; then
  echo ""
  echo "✅ ALL SYSTEMS GO - Ready for betting"
else
  echo ""
  echo "⚠️  Review issues before betting today"
fi
```

---

## Market Intelligence + Strategy Rules

### Original Strategy (From Feature Guide)

```
ACCEPT BET IF:
  ✅ Composite score > 35%
  ✅ Efficiency > 110%
  ✅ 2+ proven edges
  ✅ Sample size adequate
```

### Enhanced Strategy (With Market Intelligence)

```
ACCEPT BET IF:
  ✅ Composite score > 35%
  ✅ Efficiency > 110%
  ✅ 2+ proven edges
  ✅ Sample size adequate
  
  AND MARKET SIGNALS CONFIRM EITHER:
    • Market movement trend = ACCELERATING (prices dropping as race approaches)
    • BSP prediction gain > 5% (opening odds better than expected close)
    • Informed betting signal strength > 70 (professionals backing horse)
    • Confidence boost > 5% (market intelligence adds confidence)
```

---

## Confidence Scoring Examples

### Example 1: Full Market Support

**Horse:** Jannik at $4.50
- Model confidence: 72% (good edges, 38% composite)
- Market movement: ACCELERATING (prices dropping)
- BSP prediction: $3.95 (13.9% gain expected)
- Informed betting: Signal strength 78

**Calculation:**
```
Original: 72%
Boost from acceleration: +5%
Boost from BSP value: +8%
Boost from informed signal: +3%
Final: 88% (capped at 100%)
```

**Decision:** 🟢 **STRONG BACK** - Place bet with high confidence

---

### Example 2: Model Only (No Market Support)

**Horse:** Spurline at $5.20
- Model confidence: 68% (decent but not strong)
- Market movement: STABLE (no acceleration)
- BSP prediction: $5.28 (-1.5% loss expected)
- Informed betting: No signal (strength 20)

**Calculation:**
```
Original: 68%
Boost from acceleration: 0% (stable)
Boost from BSP value: 0% (negative)
Boost from informed signal: 0% (no signal)
Final: 68% (no boost)
```

**Decision:** 🟡 **CONDITIONAL BACK** - Back only if 2+ edges present

---

### Example 3: Model vs Market Disagreement

**Horse:** Heavenly Kiss at $3.00
- Model confidence: 75% (strong model prediction)
- Market movement: Prices RISING (professionals exiting)
- BSP prediction: $3.20 (-6.7% loss expected)
- Informed betting: WITHDRAWAL signal (strength 30)

**Calculation:**
```
Original: 75%
Boost from acceleration: -10% (opposite direction!)
BSP value negative: -5%
Withdrawal signal: -5%
Final: 55% (significant downgrade)
```

**Decision:** 🔴 **SKIP** - Market disagrees with model
- Even though model likes it, market signals suggest poor outcome
- Better to find other races where model AND market agree

---

## Real-World Decision Tree

```
START
  │
  └─→ Model confidence > 70%?
       ├─ NO  → SKIP (model not confident)
       │
       └─ YES → Efficiency > 110%?
            ├─ NO  → SKIP (odds not efficient)
            │
            └─ YES → Check market intelligence
                 │
                 ├─→ BSP prediction analysis
                 │    ├─ expectedGain < 0% → SKIP (bad value)
                 │    └─ expectedGain > 5% → +8 confidence bonus
                 │
                 ├─→ Market movement trend
                 │    ├─ ACCELERATING → +5 confidence bonus
                 │    ├─ DECELERATING → -10 confidence penalty
                 │    └─ STABLE → no change
                 │
                 ├─→ Informed betting signal
                 │    ├─ Strength > 70 → +5 confidence bonus
                 │    ├─ Strength 50-70 → +2 confidence bonus
                 │    └─ Strength < 50 → no change
                 │
                 └─→ Final decision
                      ├─ Boosted confidence > 75% → STRONG BACK
                      ├─ Boosted confidence 60-75% → BACK
                      └─ Boosted confidence < 60% → SKIP
```

---

## Implementation Checklist

- [ ] Register `market-intelligence.js` route in server.js ✅
- [ ] Add MarketIntelligence import to feature-analysis.js
- [ ] Enhance analyze-race endpoint to call `getConfidenceBoost()`
- [ ] Add BSP prediction call before bet placement
- [ ] Update bet placement logic to validate value
- [ ] Create pre-race validation function
- [ ] Add morning compliance check script
- [ ] Test with historical data (backtest)
- [ ] Monitor live performance vs backtest (Rule 4)
- [ ] Track which signals have highest accuracy

---

## Testing & Validation

### Backtest the Market Intelligence

Compare strategy performance with/without market signals:

```bash
# With market intelligence
SELECT COUNT(*) as bets_placed,
       AVG(profit_loss) as avg_pnl,
       SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) / COUNT(*) as strike_rate
FROM bets
WHERE market_signal_boost > 0

# vs

# Without market intelligence  
SELECT COUNT(*) as bets_placed,
       AVG(profit_loss) as avg_pnl,
       SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) / COUNT(*) as strike_rate
FROM bets
WHERE market_signal_boost = 0
```

**Expected improvement:**
- Strike rate: +2-4% with market support
- ROI: +1-2% from better value identification
- Fewer false positives: -5-10% of bets skipped (which would have lost)

---

## Next Steps

1. **Implement Pattern 1** - Add market intelligence to analyze-race endpoint
2. **Run backtest** - Compare historical picks with/without market signals
3. **Monitor live** - Track which signals are most predictive
4. **Optimize weights** - Adjust confidence boost amounts based on actual results
5. **Real-time enhancement** - Add live odds monitoring (Part 5 of Betfair tutorials)
