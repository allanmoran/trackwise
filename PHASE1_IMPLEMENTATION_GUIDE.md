# Phase 1: CLV Strategy - Implementation Complete

## What Changed

### 1. **Closing Line Value (CLV) Filtering** ✅
The system now validates picks using market data instead of trusting form-based confidence alone.

**Before (V2 - Failed):**
- Generate picks from Sportsbet form
- Place all bets that meet confidence ≥75%
- Trust form model confidence
- Result: -85.83% ROI (form model was wrong)

**After (Phase 1 - CLV):**
- Generate picks from Sportsbet form (same)
- Fetch TAB odds (market-settled prices)
- **Only place bets where TAB < Sportsbet** (market validates pick)
- Log CLV (closing line value) for each bet
- Result: Will measure if picks have real edge

### 2. **Code Changes**

#### `scripts/proxy.ts` (NEW)
- Added `/api/odds/closing` endpoint for future closing odds fetching
- Placeholder for Racenet scraping (will fetch final race odds post-race)

#### `src/pages/DailyPicks.tsx` (UPDATED)
- New `calculateCLV()` helper function
- Modified `doPlaceBets()` to:
  - Fetch TAB odds before placing (lines 489-506)
  - Calculate CLV for each pick (lines 538-540)
  - Filter: only place if TAB odds < Sportsbet (shouldPlace flag)
  - Log CLV metadata to kelly_logs table
  - Report skipped bets in success message

#### Database (ALREADY SET UP)
- `kelly_logs` table already has CLV columns:
  - `opening_odds` (Sportsbet)
  - `closing_odds` (TAB/Racenet)
  - `clv_percent` (calculated value %)
  - `closing_odds_source` (which service provided odds)

### 3. **Analysis Tool** ✅
New script: `scripts/analyze-clv-strategy.ts`
- Calculates average CLV across bets
- Validates: do positive CLV bets outperform negative CLV bets?
- Shows correlation between CLV and profitability
- Determines when to proceed to Phase 2

---

## How to Use

### Step 1: Run CLV-Enabled Strategy
1. Open TrackWise UI
2. Paste Sportsbet Form URLs (same as before)
3. Click **"Generate & Place Bets"**
   - System will:
     - Parse picks from forms
     - Fetch TAB odds
     - Calculate CLV for each pick
     - Skip bets where TAB > Sportsbet (no market validation)
     - Only place bets with positive CLV signal

### Step 2: Monitor CLV Results
Success message will show:
```
✓ CLV Validation: Placed 8/10 bets. 2 skipped (no market backing).
CLV: I Am A Winner +25%, Prince Ruban -5%, ...
```

Meaning:
- 8 bets placed (market backed them)
- 2 skipped (market didn't back them, no edge)
- CLV values show how much value you got on each bet

### Step 3: Analyze After 5-20 Bets
```bash
cd /Users/mora0145/Downloads/TrackWise
npx tsx scripts/analyze-clv-strategy.ts
```

This shows:
- **Average CLV**: Overall edge (target: +5% to +15%)
- **Positive vs Negative CLV performance**: Do positive CLV bets win more?
- **Validation result**: Ready for Phase 2?

---

## Key Metrics to Watch

| Metric | Good Sign | Bad Sign |
|--------|-----------|----------|
| **Avg CLV** | +5% to +15% | Negative or <+3% |
| **CLV correlation** | Positive CLV bets profit more | Both lose equally |
| **Hit rate** | Don't care (not the metric) | Don't care (not the metric) |
| **Bets placed** | Higher % passed CLV filter | Too many skipped |

---

## Example Walk-Through

**Input**: 10 Sportsbet picks, opening odds $5-6

**System processing**:
1. Fetch TAB odds → $4.80 avg (market shorter than opening)
2. Calculate CLV:
   - Horse A: Opening $5.50 → TAB $4.80 = +14.6% CLV ✅ PLACE
   - Horse B: Opening $5.00 → TAB $5.20 = -4% CLV ✗ SKIP
   - Horse C: Opening $6.00 → TAB $4.90 = +22% CLV ✅ PLACE
   - ... (8 total placed, 2 skipped)

3. Bets placed with CLV logged:
   ```
   Horse A: $50 stake @ 5.50 (opening) vs 4.80 (closing) = +14.6% CLV
   Horse C: $45 stake @ 6.00 (opening) vs 4.90 (closing) = +22% CLV
   ...
   ```

**After race runs** (results entered):
```
Analysis shows:
- Positive CLV bets (A, C, ...): 2 wins, 1 place, 3 losses = +$45 profit
- Negative CLV bets (B, ...): 0 wins, 0 places, 2 losses = -$90 loss
→ Positive CLV correlation confirmed ✅
→ Ready for Phase 2
```

---

## Phase 2 Readiness Checklist

**Move to Phase 2 when:**
- ✅ At least 20 bets have been placed with CLV data
- ✅ Average CLV is positive (+5% or more)
- ✅ `analyze-clv-strategy.ts` confirms positive CLV bets outperform
- ✅ Hit rate doesn't matter—CLV is the validator

**Phase 2 Will Add:**
- Jockey/trainer historical win rates as features (70% weight)
- Keep form confidence as feature (30% weight)
- Re-weight based on CLV performance
- Test hybrid model against Phase 1 baseline

---

## Files Modified

```
src/pages/DailyPicks.tsx        → Added CLV filtering in doPlaceBets()
scripts/proxy.ts                → Added /api/odds/closing endpoint
scripts/analyze-clv-strategy.ts → NEW: CLV validation analyzer
PHASE1_CLV_STRATEGY.md          → Strategy documentation
PHASE1_IMPLEMENTATION_GUIDE.md  → This file
```

---

## Troubleshooting

**Issue**: "TAB odds fetch failed, proceeding without CLV filter"
- **Cause**: TAB odds API failed
- **Fix**: System will still place bets (fallback to opening odds)
- **Impact**: Can't validate CLV on those bets, but won't lose money

**Issue**: "Too many bets skipped (no market backing)"
- **Cause**: Form model picks don't match market view
- **Meaning**: Form model is unreliable (expected from V2)
- **Action**: Proceed to Phase 2 to add market-based features

**Issue**: "CLV is negative overall"
- **Cause**: Your picks systematically close LONGER than opening (market disagrees)
- **Meaning**: Form model is predicting wrong
- **Action**: Rebuild strategy or switch to different approach

---

## Success Criteria for Phase 1

✅ **Primary Goal**: Determine if form-based picks have edge using CLV

Outcomes:
- **Positive CLV** → Edge exists → Proceed to Phase 2 hybrid
- **Negative CLV** → Edge doesn't exist → Rebuild strategy (Option C, D)
- **Neutral CLV** → Can't determine → Need more data or different model

---

## Next: Phase 2 (TBD)

Once Phase 1 is validated with positive CLV, Phase 2 will:
1. Keep existing form picks as baseline
2. Add jockey/trainer strike rate features
3. Weigh: 30% form + 70% jockey/trainer performance
4. Test hybrid model against Phase 1 CLV-only model
5. Confirm hybrid improves ROI using CLV as metric

