# Model Calibration Check - Daily Monitoring Guide

## What Is Calibration?

**Calibration** = Does your model's predictions match reality?

**Perfect calibration**: If you place 100 bets with 20% confidence, exactly 20 should win.

**Examples**:
- ✅ **Well-calibrated**: 20% confidence bets win 19-21% → Model is accurate
- ❌ **Over-optimistic**: 20% confidence bets win only 12% → Model too bullish (adjust up)
- ❌ **Over-pessimistic**: 20% confidence bets win 28% → Model too conservative (adjust down)

---

## How It Works

The calibration check **groups your settled bets by confidence level** and compares:
- **Predicted win rate**: The confidence you assigned when placing the bet
- **Actual win rate**: How many actually won

### Example Output

```
20-25% confidence:
   Predicted: 20.0% | Actual: 18.2% | Error: -1.8% | Bets: 15 (3 wins) ✓

25-30% confidence:
   Predicted: 25.0% | Actual: 32.1% | Error: +7.1% | Bets: 8 (3 wins) ⬆️

30-35% confidence:
   Predicted: 30.0% | Actual: 25.0% | Error: -5.0% | Bets: 6 (1 win) ⬇️
```

### Reading the Results

| Symbol | Meaning | Action |
|--------|---------|--------|
| ✓ | Within ±2% | Perfect - no change needed |
| ⬆️ | Error > +5% | Model too pessimistic (missing wins) |
| ⬇️ | Error < -5% | Model too optimistic (predicting too many wins) |

---

## Automatic Recommendations

After each settlement run, you'll get:

### Case 1: ✅ WELL-CALIBRATED (80%+ accurate)
```
✅ Model is well-calibrated (85% of predictions within ±2%)
Bias Direction: Neutral
Recommendation: No changes needed
```
**Action**: Continue with current EV threshold (0.10)

### Case 2: ⚠️ OVER-OPTIMISTIC (Model too bullish)
```
⚠️  Model is TOO OPTIMISTIC (predicting higher win rates than reality)
Average Error: -3.5%
Recommendation: increase_ev_threshold

Action: Increase EV_THRESHOLD from 0.10 to 0.12-0.15
Effect: Filters out marginal bets, focuses on higher-confidence picks
```
**What to do**:
```bash
# Edit: /Users/mora0145/Downloads/TrackWise/backend/src/routes/bets.js
# Find line: const EV_THRESHOLD = 0.10;
# Change to: const EV_THRESHOLD = 0.12; (or 0.15 if very aggressive)
# Result: Only bets with 12%+ edge are placed (vs 10% before)
```

### Case 3: ⚠️ OVER-PESSIMISTIC (Model too conservative)
```
⚠️  Model is TOO PESSIMISTIC (predicting lower win rates than reality)
Average Error: +4.2%
Recommendation: decrease_ev_threshold

Action: Decrease EV_THRESHOLD from 0.10 to 0.08
Effect: Places more bets, captures opportunities
```
**What to do**:
```bash
# Edit: /Users/mora0145/Downloads/TrackWise/backend/src/routes/bets.js
# Find line: const EV_THRESHOLD = 0.10;
# Change to: const EV_THRESHOLD = 0.08;
# Result: Bets with 8%+ edge placed (more aggressive)
```

---

## When to Trust the Results

### ✅ Sample Size Sufficient (Act on Results)
- **100+ settled bets**: Highly reliable
- **50-99 bets**: Reliable, monitor for continued patterns
- **30-49 bets**: Moderate reliability, wait for more data

### ⚠️ Sample Size Too Small (Don't Act Yet)
- **< 30 bets**: Results may be statistical noise
- **Action**: Collect more bets first, check again after 50+

### 📊 Minimum for Each Confidence Level
- Each confidence bucket needs ≥5-10 bets to be meaningful
- If a bucket has only 2-3 bets, ignore that result

---

## Daily Workflow

### 8:00 PM Each Day
```bash
# Settlement + Calibration check runs automatically
bash /tmp/phase2a_settle_and_report.sh

# Output includes:
# 1. Daily ROI
# 2. Cumulative metrics
# 3. MODEL CALIBRATION CHECK (NEW)
#    ├─ Predicted vs actual by confidence level
#    ├─ Overall verdict (Well-calibrated / Acceptable / Needs adjustment)
#    ├─ Bias assessment (Neutral / Over-optimistic / Over-pessimistic)
#    └─ Recommendation (No change / Increase threshold / Decrease threshold)
```

### Decision Logic

```
If recommendation = "increase_ev_threshold":
  ✓ Update EV_THRESHOLD in bets.js
  ✓ Restart backend API
  ✓ Wait 24 hours
  ✓ Re-run calibration check
  ✓ Verify improvement

If recommendation = "decrease_ev_threshold":
  ✓ Same process as above

If recommendation = "no_change":
  ✓ Keep current settings
  ✓ Continue monitoring daily
```

---

## Phase 2A Timeline

### Apr 25-26 (Days 1-2)
- **Bets placed**: 20-40
- **Calibration check**: Run but mostly "insufficient data"
- **Action**: Collect more bets, don't adjust yet

### Apr 26 Evening (Go/No-Go Checkpoint)
- **Bets placed**: 40-50
- **Calibration check**: Should show initial patterns
- **Action**: Make first adjustment if needed

### Apr 27 Evening (Final Decision)
- **Bets placed**: 60-80
- **Calibration check**: High confidence results
- **Action**: Final adjustments before Phase 3

---

## Example: Reading Calibration Output

```
📊 MODEL CALIBRATION CHECK

20-25% confidence:
   Predicted: 20.0% | Actual: 18.2% | Error: -1.8% | Bets: 15 (3 wins) ✓

25-30% confidence:
   Predicted: 25.0% | Actual: 32.1% | Error: +7.1% | Bets: 8 (3 wins) ⬆️

30-35% confidence:
   Predicted: 30.0% | Actual: 25.0% | Error: -5.0% | Bets: 6 (1 win) ⬇️

────────────────────────────────────────

OVERALL CALIBRATION QUALITY

✅ Model is well-calibrated (78% of predictions within ±2%)

Bias Direction: Neutral
Average Error: -0.15%

RECOMMENDATIONS

✅ Model is well-calibrated - no adjustments needed
   Continue using current EV threshold (0.10)

───────────────────────────────────────

DATA QUALITY

Total settled bets analyzed: 29
Confidence buckets tested: 3/6

⚠️  Sample size (29) is small - results may be unstable
   Recommendation: Analyze again after 50+ settled bets
```

### What This Means

1. **20-25% bucket**: ✓ Perfectly calibrated (1.8% error is within acceptable range)
2. **25-30% bucket**: ⬆️ Model too pessimistic (actual is 7% higher than predicted)
   - You thought these were 25% confident, but they actually win 32%
   - Model is underestimating these runners
3. **30-35% bucket**: ⬇️ Model too optimistic (actual is 5% lower than predicted)
   - You thought these were 30% confident, but they only win 25%
   - Model is overestimating these runners

### Decision

Overall: **✅ Well-calibrated** (78% within ±2%)  
- The optimism in 25-30% is balanced by pessimism in 30-35%
- Average error is nearly zero
- **Action**: No changes needed, keep monitoring

---

## Debugging Calibration Issues

### Problem: Model consistently too optimistic (over-betting winners that don't win)

**Symptoms**:
```
20% confidence → wins 15%
25% confidence → wins 18%
30% confidence → wins 22%
All negative errors
```

**Likely causes**:
1. Strike rate data is stale (horses no longer performing at old level)
2. EV threshold too low (capturing bad bets)
3. Form trend detection missing (not accounting for decline)
4. Odds estimates wrong (market disagrees with model)

**Fixes** (in order):
```
1. Increase EV_THRESHOLD to 0.12
   Wait 24 hours, re-test
   
2. Check if recent form has declined:
   SELECT AVG(strike_rate) FROM horses WHERE updated_at < date('now', '-30 days');
   
3. Verify odds are realistic:
   SELECT AVG(opening_odds) FROM bets WHERE placed_at > '2026-04-25';
```

### Problem: Model consistently too pessimistic (missing obvious winners)

**Symptoms**:
```
20% confidence → wins 28%
25% confidence → wins 35%
30% confidence → wins 38%
All positive errors
```

**Likely causes**:
1. Strike rates improved (horses in better form)
2. EV threshold too high (filtering good bets)
3. Form trend detection missing recent wins
4. Market odds became unfavorable (model doesn't weight well)

**Fixes** (in order):
```
1. Decrease EV_THRESHOLD to 0.08
   Wait 24 hours, re-test
   
2. Check if recent form has improved:
   SELECT * FROM race_runners 
   WHERE horse_id = X ORDER BY race_id DESC LIMIT 5;
   
3. Check if your picks correlate with recent performance
```

---

## FAQ

**Q: When should I change the EV threshold?**  
A: After 30+ settled bets AND if average error > ±3%. Don't change mid-week (need stable data).

**Q: What if one bucket is off but others are fine?**  
A: Ignore single buckets with <5 bets. Wait for more data. Only adjust if 2+ buckets show same pattern.

**Q: Should I change anything before Phase 2A ends?**  
A: No. Collect data Apr 25-27, make single adjustment on Apr 28 based on final metrics.

**Q: What's the biggest factor in calibration?**  
A: Strike rate accuracy. If strike rate data is 2 weeks old, calibration will be off by ~3-5%.

**Q: Can I use this to adjust confidence mid-race?**  
A: No. Calibration is for long-term model improvement, not individual bet decisions.

---

## Next Steps

### Right Now
✅ Calibration check integrated into settlement report
✅ Runs automatically at 8 PM each day

### Tomorrow (Apr 25)
- Place 25-50 bets with daily betting cycle
- Review calibration output (expect "insufficient data" at first)

### Apr 26 Evening
- Check if patterns emerge
- Make first adjustment if needed

### Apr 27 Evening (Final)
- Review final calibration metrics
- Make final adjustment before Phase 3
- Use for production weight optimization

---

## Monitoring Dashboard

To view latest calibration check without running settlement:

```bash
# View latest calibration results
node /tmp/phase2a_calibration_check.mjs

# View calibration over time
tail -100 /tmp/production_betting_log.txt | grep -A 20 "CALIBRATION CHECK"

# Compare Phase 1 vs Phase 2A calibration
ls -lah /tmp/phase1_reports/
```
