# Model Calibration Check - Implementation Summary

## ✅ What Was Added

### 1. Calibration Analysis Script
**File**: `/Users/mora0145/Downloads/TrackWise/backend/src/scripts/phase2a_calibration_check.mjs`

**What it does**:
- Analyzes all settled bets grouped by confidence level
- Compares predicted win rates to actual outcomes
- Detects systematic bias (over-optimistic or over-pessimistic)
- Provides automated recommendations for EV threshold adjustment

**Output format**:
```
20-25% confidence:
   Predicted: 20.0% | Actual: 18.2% | Error: -1.8% | Bets: 15 ✓

OVERALL: ✅ Well-calibrated (85% within ±2%)
Recommendation: No changes needed
```

### 2. Settlement Report Integration
**File**: `/tmp/phase2a_settle_and_report.sh` (updated)

**Change**: Added calibration check to daily settlement workflow

**Before**:
```
bash /tmp/phase2a_settle_and_report.sh
  → Daily ROI report
  → Cumulative metrics
  → [END]
```

**After**:
```
bash /tmp/phase2a_settle_and_report.sh
  → Daily ROI report
  → Cumulative metrics
  → 🎯 MODEL CALIBRATION CHECK (NEW)
     ├─ Confidence bucketing
     ├─ Predicted vs actual
     ├─ Bias assessment
     └─ Adjustment recommendation
  → [END]
```

### 3. Documentation
**Files**:
- `/tmp/CALIBRATION_CHECK_GUIDE.md` — Complete user guide
- This document

---

## 🚀 How to Use It

### Daily Automatic Check (Recommended)
```bash
# Runs every evening at 8 PM as part of settlement
bash /tmp/phase2a_settle_and_report.sh

# Output includes full calibration analysis
```

### Manual Check (Anytime)
```bash
cd /Users/mora0145/Downloads/TrackWise/backend
node src/scripts/phase2a_calibration_check.mjs
```

---

## 📊 How It Works

### 1. Data Collection
Groups all settled bets by confidence level:
- 20-25% confidence bets
- 25-30% confidence bets
- 30-35% confidence bets
- 35-40% confidence bets
- 40-50% confidence bets
- 50%+ confidence bets

### 2. Win Rate Calculation
For each group:
- **Predicted**: The confidence level you assigned
- **Actual**: Percentage that actually won
- **Error**: Actual - Predicted (positive = pessimistic, negative = optimistic)

### 3. Verdict Generation
Analyzes error patterns:
- **Well-calibrated**: 80%+ of predictions within ±2%
- **Acceptable**: 60-80% accurate
- **Needs adjustment**: < 60% accurate

### 4. Recommendation Engine
Suggests action based on bias:
- **Over-optimistic** (predicting too many wins) → Increase EV threshold
- **Over-pessimistic** (predicting too few wins) → Decrease EV threshold
- **Neutral** (balanced) → No changes

---

## 💡 Key Insights from Initial Test Run

Ran calibration check on historical data (Apr 24 legacy bets):

```
20-25% confidence: Actual 30% (over-pessimistic! ✓)
25-30% confidence: Actual 0% (failed batch from earlier testing)
30-35% confidence: Actual 0% (failed batch)
50%+ confidence: Actual 0% (failed batch)

Overall: ❌ Needs adjustment
Reason: Old test data with high failure rate
```

**Important**: This result is from **legacy test data** (April 12 failed batch).  
Once Phase 2A starts with fresh bets (Apr 25), calibration will reset to a clean slate.

---

## 🎯 Phase 2A Calibration Timeline

### Apr 25 (Day 1) - Early Data
- Bets: 20-50
- Calibration: "Insufficient data" warning
- Action: Collect more bets
- Expected: Results may be unstable

### Apr 26 (Day 2) - Emerging Patterns
- Bets: 40-70
- Calibration: First clear patterns emerge
- Action: Make first threshold adjustment (if error > ±3%)
- Expected: More reliable results

### Apr 27 Evening (Decision Point) ⭐
- Bets: 60-100
- Calibration: High confidence results
- Action: Final adjustment before Phase 3
- Expected: Results very reliable (100+ bets)

### Apr 28 (Production Deploy)
- Use Apr 27 calibration metrics to finalize EV threshold
- Deploy with optimized settings
- Continue daily monitoring

---

## 🔧 When to Adjust EV Threshold

### Only Adjust If:
1. **Sample size ≥ 30 bets** (fewer than this = statistical noise)
2. **Average error ≥ ±3%** (systematic bias, not random)
3. **Multiple confidence buckets show same pattern** (not isolated)

### How to Adjust:

**If Too Optimistic** (actual < predicted by 3%+):
```bash
# File: /Users/mora0145/Downloads/TrackWise/backend/src/routes/bets.js
# Find: const EV_THRESHOLD = 0.10;
# Change to: const EV_THRESHOLD = 0.12;
# Effect: Only places bets with 12%+ edge (filters marginal bets)
```

**If Too Pessimistic** (actual > predicted by 3%+):
```bash
# File: /Users/mora0145/Downloads/TrackWise/backend/src/routes/bets.js
# Find: const EV_THRESHOLD = 0.10;
# Change to: const EV_THRESHOLD = 0.08;
# Effect: Places bets with 8%+ edge (more aggressive)
```

**After Adjustment**:
```bash
# Restart API (implementation depends on your setup)
# Wait 24 hours
# Run calibration check again
# Verify improvement
```

---

## 📈 Example: Reading Real Calibration Results

### Scenario: Apr 27 Evening After 85 Bets

```
📊 MODEL CALIBRATION CHECK

20-25% confidence:
   Predicted: 20.0% | Actual: 21.3% | Error: +1.3% | Bets: 18 (4 wins) ✓

25-30% confidence:
   Predicted: 25.0% | Actual: 22.1% | Error: -2.9% | Bets: 22 (5 wins) ✓

30-35% confidence:
   Predicted: 30.0% | Actual: 27.8% | Error: -2.2% | Bets: 20 (5 wins) ✓

35-40% confidence:
   Predicted: 35.0% | Actual: 40.0% | Error: +5.0% | Bets: 15 (6 wins) ⬇️

40-50% confidence:
   Predicted: 40.0% | Actual: 32.0% | Error: -8.0% | Bets: 10 (3 wins) ⬆️

────────────────────────────────────────

OVERALL CALIBRATION QUALITY

✅ Model is well-calibrated (73% of predictions within ±2%)

Bias Direction: Slightly over-optimistic
Average Error: -1.2%

RECOMMENDATIONS

⚠️  Model is slightly TOO OPTIMISTIC (predicting higher win rates than reality)
   Action: Increase EV_THRESHOLD from 0.10 to 0.11
   Effect: Modest filter on marginal bets

DATA QUALITY

Total settled bets analyzed: 85
Confidence buckets tested: 5/6
✅ Sample size (85) is robust - results are reliable

Verdict: ACCEPTABLE (calibration improving)
Recommendation: increase_ev_threshold (modest adjustment)
```

### Interpretation

**What this means**:
- 20-25% bucket: Perfect ✓
- 25-30% bucket: Nearly perfect ✓
- 30-35% bucket: Nearly perfect ✓
- 35-40% bucket: Model pessimistic (these win more than predicted)
- 40-50% bucket: Model optimistic (these win less than predicted)

**Overall**: 73% accurate (target: 80%+)  
Average bias: -1.2% (slightly pessimistic overall, but minor)

**Action**: Small adjustment
```bash
# Increase threshold slightly
# Change EV_THRESHOLD from 0.10 → 0.11
# Wait 24 hours, re-test
```

---

## 🛡️ Quality Checks Built In

### Automatic Warnings
The script warns if:
- ❌ Sample size < 30 (results unreliable)
- ⚠️ Sample size 30-49 (moderate reliability)
- ⚠️ Any confidence bucket has < 5 bets (don't trust that bucket)
- ⚠️ Data too old (> 7 days - stale predictions)

### Calibration Score
Reports percentage of predictions within acceptable range:
- **80%+**: Well-calibrated ✅
- **60-80%**: Acceptable (monitor closely) ⚠️
- **< 60%**: Needs adjustment ❌

---

## 📋 Monitoring Checklist

### Daily (After Settlement)
- [ ] Run settlement script
- [ ] Review calibration verdict
- [ ] Note any bias trend
- [ ] Check sample size (is it growing?)

### Every 2-3 Days
- [ ] Look for patterns across multiple days
- [ ] If persistent bias > ±3%, note for adjustment
- [ ] Don't adjust yet (wait for Apr 27 final decision)

### Decision Point (Apr 27)
- [ ] Run final calibration check
- [ ] Review all 3 days of data together
- [ ] Make single adjustment (if needed)
- [ ] Document the change
- [ ] Verify improvement over next 3 days (Phase 4)

---

## 🚨 Troubleshooting

### "Insufficient data for calibration analysis"
- **Cause**: < 20 settled bets
- **Action**: Continue placing bets, check back tomorrow

### "Sample size is small - results may be unstable"
- **Cause**: 20-30 settled bets
- **Action**: Results are directional but not final; collect more data

### "Model is well-calibrated" but bets still losing money
- **Cause**: EV threshold too low (selecting poor expected value bets)
- **Action**: Increase EV_THRESHOLD even if calibration is good
- **Note**: Calibration (predicting winners) ≠ Profitability (finding value)

### Calibration swings widely day-to-day
- **Cause**: Small sample size (<30 bets), random variance
- **Action**: Wait for 100+ bets before trusting daily swings

---

## 📚 Related Documentation

- Full User Guide: `/tmp/CALIBRATION_CHECK_GUIDE.md`
- Model Improvements: [Model Improvement Analysis (Above)]
- Settlement Report: `/tmp/phase2a_settle_and_report.sh`
- Operations Dashboard: `/tmp/OPERATIONS_DASHBOARD.txt`

---

## Summary

**What you get**:
- Daily automatic calibration check (runs at 8 PM)
- Prediction accuracy reporting
- Bias detection (over-optimistic vs over-pessimistic)
- Automated EV threshold adjustment recommendations

**When to use it**:
- Daily monitoring (automatic)
- Decision-making on Apr 26 and Apr 27
- Validation feedback for model improvements

**Expected outcome**:
- Identify systematic prediction bias within 24-48 hours
- Fine-tune EV threshold before Phase 3 production
- Ensure model is calibrated for profitability (Apr 28+)

---

✅ **Implementation Complete**  
The calibration check is integrated and ready for use starting Apr 25.
