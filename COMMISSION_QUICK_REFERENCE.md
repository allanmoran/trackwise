# Commission API Quick Reference

Fast lookup for all commission-related endpoints.

---

## 10 Commission Endpoints

### 1. Get Current Commission Rate
```bash
curl http://localhost:3001/api/commission/current-rate
```

Returns: `{ rate: 0.10, ratePercent: "10.0%" }`

---

### 2. Set Commission Rate
```bash
curl -X POST http://localhost:3001/api/commission/set-rate \
  -H "Content-Type: application/json" \
  -d '{"rate": 0.10, "notes": "NSW thoroughbreds"}'
```

Use when rates change by state or racing code.

---

### 3. Calculate Net Profit After Commission
```bash
curl -X POST http://localhost:3001/api/commission/calculate-net-profit \
  -H "Content-Type: application/json" \
  -d '{"grossProfit": 100}'
```

Returns:
```json
{
  "grossProfit": 100,
  "commissionRate": "10.0%",
  "commissionPaid": 10.00,
  "netProfit": 90.00
}
```

---

### 4. Calculate Net ROI
```bash
curl -X POST http://localhost:3001/api/commission/calculate-net-roi \
  -H "Content-Type: application/json" \
  -d '{"stake": 20, "grossReturn": 100}'
```

Returns: Gross ROI (5%) vs Net ROI (4.5%) with impact breakdown.

---

### 5. Adjust Kelly for Commission
```bash
curl -X POST http://localhost:3001/api/commission/adjust-kelly \
  -H "Content-Type: application/json" \
  -d '{"odds": 3.00, "confidence": 70}'
```

Returns:
```json
{
  "odds": 3.00,
  "confidence": 70.0,
  "edge": {
    "unadjusted": "10.00%",
    "adjusted": "0.00%"
  },
  "kelly": {
    "unadjusted": "4.50%",
    "adjusted": "1.50%",
    "quarterKelly": "0.38%"
  }
}
```

**Key:** Adjust Kelly stakes by commission impact.

---

### 6. Commission Impact (Last N Days)
```bash
curl "http://localhost:3001/api/commission/impact?days=7"
```

Shows: Gross profit, commission paid, net profit, ROI impact.

---

### 7. Daily Commission Summary
```bash
curl "http://localhost:3001/api/commission/daily-summary?days=30"
```

Shows daily breakdown:
- Bets placed/settled
- Gross vs net profit
- Gross vs net ROI

---

### 8. Minimum Edge Required
```bash
curl -X POST http://localhost:3001/api/commission/minimum-edge \
  -H "Content-Type: application/json" \
  -d '{"odds": 3.00}'
```

Returns: Win probability needed to break even after commission.

Example at $3.00:
```
Betfair (5%): 35.7% win probability
Sportsbet (10%): 39.2% win probability
```

---

### 9. Efficiency Threshold
```bash
curl http://localhost:3001/api/commission/efficiency-threshold
```

Returns: Recommended efficiency threshold (120% for Sportsbet).

---

### 10. Strategy Adjustments
```bash
curl http://localhost:3001/api/commission/strategy-adjustments
```

Returns all recommended threshold changes:
```json
{
  "adjustedThresholds": {
    "minimumCompositeScore": 40,
    "minimumEfficiency": 120,
    "minimumStrikeRate": 40,
    "minimumConfidence": 75
  }
}
```

---

## Comprehensive Analysis
```bash
curl http://localhost:3001/api/commission/analysis
```

One-stop endpoint for:
- Current commission rate
- Recent impact (7 & 30 days)
- All strategy adjustments
- Efficiency threshold recommendations

---

## Quick Decision Tree

**Should I back this horse?**

```
1. Check efficiency threshold
   curl http://localhost:3001/api/commission/efficiency-threshold
   → Must be > 120%

2. Calculate adjusted Kelly
   curl -X POST http://localhost:3001/api/commission/adjust-kelly \
     -d '{"odds": X, "confidence": Y}'
   → If quarterKelly < 0.5%, too small, SKIP

3. Verify minimum edge
   curl -X POST http://localhost:3001/api/commission/minimum-edge \
     -d '{"odds": X}'
   → If win% < required%, SKIP

4. Place bet with adjusted stake
   POST /api/bets with kelly_stake from step 2
```

---

## Common Scenarios

### Scenario 1: Horse @ $4.00, 75% confidence

```bash
# Step 1: Check efficiency needed
curl http://localhost:3001/api/commission/efficiency-threshold
# Need: > 120%

# Step 2: What stake?
curl -X POST http://localhost:3001/api/commission/adjust-kelly \
  -d '{"odds": 4.0, "confidence": 75}'
# Quarter-Kelly: 0.45% of bankroll

# Step 3: Break-even check
curl -X POST http://localhost:3001/api/commission/minimum-edge \
  -d '{"odds": 4.0}'
# Need: 26.9% win probability (you have 75%)

# Conclusion: BET (strong confidence, edge clear)
```

### Scenario 2: Horse @ $2.50, 65% confidence

```bash
# Kelly adjustment
curl -X POST http://localhost:3001/api/commission/adjust-kelly \
  -d '{"odds": 2.5, "confidence": 65}'
# Returns: 0.18% quarter-Kelly (very small!)

# Edge check
curl -X POST http://localhost:3001/api/commission/minimum-edge \
  -d '{"odds": 2.5}'
# Need: 42.6% win probability (you have 65%)

# Conclusion: MARGINAL (edge exists but stake tiny due to low odds)
```

### Scenario 3: Horse @ $6.00, 50% confidence

```bash
# Kelly for low odds scenario
curl -X POST http://localhost:3001/api/commission/adjust-kelly \
  -d '{"odds": 6.0, "confidence": 50}'
# Returns: negative Kelly (no edge!)

# Conclusion: SKIP (no edge after commission)
```

---

## Testing Script

Quick shell script to test all endpoints:

```bash
#!/bin/bash

echo "=== Commission System Test ==="

# 1. Current rate
echo "1. Current rate:"
curl -s http://localhost:3001/api/commission/current-rate | jq .

# 2. Strategy adjustments
echo "2. Strategy adjustments:"
curl -s http://localhost:3001/api/commission/strategy-adjustments | jq .

# 3. Test Kelly adjustment
echo "3. Kelly @ $3.00, 70% confidence:"
curl -s -X POST http://localhost:3001/api/commission/adjust-kelly \
  -H "Content-Type: application/json" \
  -d '{"odds": 3.0, "confidence": 70}' | jq .

# 4. Impact summary
echo "4. 7-day impact:"
curl -s "http://localhost:3001/api/commission/impact?days=7" | jq .

# 5. Analysis
echo "5. Full analysis:"
curl -s http://localhost:3001/api/commission/analysis | jq .

echo "=== Test Complete ==="
```

---

## Integration with Other Systems

### In Feature Analysis
When generating picks, check efficiency:

```javascript
// In analyze-race endpoint
const efficiencyThreshold = await getCommissionAdjustedThreshold();
if (horse.efficiency < efficiencyThreshold) {
  skip(horse); // Too low after commission
}
```

### In Compliance Monitoring
Rule 7 now includes commission drag calculation.

### In Bet Placement
Use commission-adjusted Kelly for stakes:

```javascript
const kellyResult = CommissionManager.adjustKellyForCommission(odds, confidence);
const stake = bankroll * parseFloat(kellyResult.kelly.quarterKelly) / 100;
```

---

## Debugging Commission Issues

### Problem: ROI looks good, but bets failing

**Check:**
```bash
curl http://localhost:3001/api/commission/impact?days=7
# Is netROI significantly lower than grossROI?
# → Commission is higher than expected
```

### Problem: Bets rejected (efficiency too low)

**Check:**
```bash
curl http://localhost:3001/api/commission/efficiency-threshold
# Current threshold: 120%
# Your bet: 110% efficiency
# → Need 10% more edge to clear commission requirement
```

### Problem: Kelly stakes very small

**Check:**
```bash
curl -X POST http://localhost:3001/api/commission/minimum-edge \
  -d '{"odds": 2.0}'
# Result: Need 52.6% to break even
# If your confidence is only 51%
# → No edge remains after commission
```

---

## Summary

| Task | Endpoint |
|------|----------|
| Check current rate | `GET /commission/current-rate` |
| Adjust Kelly for commission | `POST /commission/adjust-kelly` |
| Calculate net ROI | `POST /commission/calculate-net-roi` |
| Verify efficiency threshold | `GET /commission/efficiency-threshold` |
| Get all strategy adjustments | `GET /commission/strategy-adjustments` |
| Track impact | `GET /commission/impact` |
| Daily summary | `GET /commission/daily-summary` |
| Full analysis | `GET /commission/analysis` |
| Break-even calculation | `POST /commission/minimum-edge` |

All calculations automatically account for **10% Sportsbet Australian racing commission**.
