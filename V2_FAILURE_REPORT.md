# V2 Strategy Failure Report — April 10, 2026

## Test Summary
- **Test Date:** April 10, 2026
- **Races Tested:** 10 (Cranbourne, Darwin, Gatton, Wellington)
- **Bets Placed:** 14
- **Bets Qualified by V2 Filters:** 14/14 (MIN_CONFIDENCE 75%, MAX_ODDS $7.00)

## Results
| Metric | Actual | Target |
|--------|--------|--------|
| **Win Rate** | 7% (1/14) | 25%+ |
| **Place Rate** | 7% (1/14) | 15%+ |
| **Loss Rate** | 86% (12/14) | <75% |
| **ROI** | **-85.83%** | **+10%+** |
| **P&L** | **-$431.81** | Profitable |
| **Total Staked** | $503.07 | N/A |

## Confidence Analysis
- **All 14 bets had confidence = 77%** (from form parsing algorithm)
- **Actual predictive power:** 7% win rate vs. 77% predicted = **70% point gap**
- **Confidence Formula Issue:** Barrier position + weight + odds bonuses don't correlate to race outcomes

## Root Cause
The V2 confidence formula (barrier ≤3 +18%, weight <53 +12%, odds ≥5 +6%, etc.) generates:
- ✅ High confidence for low barrier + light weight + decent odds
- ❌ But these runners **don't actually win** (only 1/14 won/placed)

**Conclusion:** The form-based confidence algorithm is **not predictive**. It's outputting artificial confidence without real edge.

## Why Strategy V2 Failed
1. **Barrier Overweighting:** Low barrier positions don't guarantee wins — 13 bets with good barrier positions lost
2. **No Historical Validation:** The confidence formula was never backtested against actual race results
3. **Missing Form Data:** No access to recent race history, class levels, or jockey/trainer performance
4. **Odds Premium:** Horses at 5.00-7.00 odds were selected, but these are often unreliable longshots

## Next Steps (If Continuing Testing)
Options:
1. **A: Pivot to External API** — Use a racing data API (e.g., `racing.com`, `punters.com.au`) with ML-backed predictions
2. **B: Add Historical Validation** — Backtest confidence formula against 30 days of past races to calibrate
3. **C: Switch to Profit Betting** — Instead of high-confidence picks, use statistical edge from closing odds vs. opening odds
4. **D: Archive and Restart** — Accept this strategy is not viable; rebuild from scratch with better data sources

## Confidence Levels Going Forward
If continuing to test strategies, remember:
- **Confidence = how well the model thinks it predicted the race, NOT actual edge**
- **Valid confidence range:** 0-100%, but current formula outputs artificial high values
- **Real edge comes from:** Closing odds gaps, historical performance, class analysis, not barrier position

---

**Status:** V2 Strategy FAILED validation. ROI -85.83% vs. +10% target.
