# Phase 1 Testing - Today's Roadmap (April 11, 2026)

## Current State
- **Bets Placed:** 71
- **Status:** Races running throughout the day
- **CLV Validation:** Running without pre-race market odds (using Sportsbet opening odds as baseline)
- **Goal:** Measure actual ROI to validate if form-based picks have edge

---

## What Happens Now

### Morning (Bets Placed ✅)
```
✓ Loaded today's 126 Australian races
✓ Generated picks from Sportsbet Form
✓ Applied Strategy V2 filters (Conf ≥75%, Odds ≤7.0, track filters)
✓ Placed 71 bets with Kelly stakes
✓ Logged all bets to active_bets + kelly_logs tables
✓ Bank updated: $200 → $(200 - total_stake_71_bets)
```

### Throughout Day (Races Running 🏇)
As each race runs:
1. Result appears on Sportsbet / racing.com
2. Manually enter result into TrackWise Results tab (WIN/PLACE/LOSS)
3. System calculates P&L, updates dashboard
4. Each bet logged with result + profit/loss

### Evening (Analysis 📊)
After all 71 bets have run:
```bash
npx tsx scripts/analyze-clv-strategy.ts
```

This will show:
- **Total ROI:** (Total Winnings - Total Staked) / Total Staked
- **Hit Rate:** Wins / Total (not the metric, just for reference)
- **Average CLV:** Indicator of edge quality
- **Breakdown:** Wins vs Places vs Losses
- **Readiness:** Can we proceed to Phase 2?

---

## Expected Outcomes & Decisions

### Outcome A: Positive ROI (Target +10% or better)
**Result:** ✅ Form picks have edge  
**Decision:** Proceed to Phase 2 - Layer jockey/trainer features  
**Action:** Build Phase 2 hybrid model (30% form + 70% jockey/trainer)

### Outcome B: Breakeven / Slight Positive (0% to +5% ROI)
**Result:** ⚠️ Edge is weak, possibly just variance  
**Decision:** Collect more data (100+ bets) before Phase 2  
**Action:** Continue with current strategy, retest at 100 bets

### Outcome C: Negative ROI (< -5%)
**Result:** ❌ Form picks do NOT have edge  
**Decision:** Form model is broken, need different approach  
**Action:** Option 1: Pivot to Punters expert tips + form consensus  
           Option 2: Rebuild model with jockey/trainer focus  
           Option 3: Use community consensus (forum + tips)

---

## Required Data Entry

For each of the 71 bets, you'll need to enter results. TrackWise has a "Results" tab for this:

**Format for each race:**
1. Track: (Rockhampton, Caulfield, etc.)
2. Race #: (R1, R2, etc.)
3. Results: (copy from racing.com in "1st X, 2nd Y, 3rd Z" format)
4. System matches your bets against results → calculates WIN/PLACE/LOSS

**Speed Tip:**
- racing.com shows finalized results ~10 mins after race ends
- Copy the "Dividends" section with horse numbers
- TrackWise parses horse names from active_bets table
- Enter once per race (all 3 of your picks for that race auto-match)

---

## Monitoring Points During Day

### Track These Metrics
- 🏇 Races completed
- 💰 Profit/Loss (running total)
- 📊 Hit rate (wins counted)
- 📈 If trending negative, consider stopping early?

### What to Watch For
- **Unusual results:** If significantly underperforming vs form picks
- **Outsiders winning:** Could mean form model was way off
- **Favorites winning:** Expected (high confidence = low odds)
- **Scratches/Non-starters:** Can't win, auto-loss

---

## Tools Ready

### 1. Daily Analysis
```bash
npx tsx scripts/analyze-clv-strategy.ts
```
Gives you: ROI, hit rate, CLV metrics, Phase 2 readiness assessment

### 2. Load Future Races
Button in TrackWise UI: **"Load Today's Races"**
- Auto-extracts all Australian races from Sportsbet
- One-click to load full day schedule

### 3. Auto-Place Bets
Button: **"Generate & Place Bets"**
- Paste race URLs → generates picks → places all automatically
- No second click needed (was fixed from plan)

---

## Data To Collect

### Essential (for analysis)
- ✅ Each bet: Horse, Track, Race, Odds, Stake
- ✅ Each result: WIN/PLACE/LOSS
- ✅ Profit/Loss calculations

### Optional (for debugging)
- 📝 Which strategy filter removed bets? (Conf, Odds, Trainer, etc.)
- 📝 Form confidence score for each pick
- 📝 Any steamed odds (moved shorter from opening)?

---

## Phase 2 Decision Flowchart

```
71 Bets Complete
    │
    ├─ Positive ROI? (>+5%)
    │   └─ YES → Phase 2: Add jockey/trainer features
    │   └─ NO → Check if breakeven
    │       ├─ YES → Collect 100+ bets, retest
    │       └─ NO → Rebuild strategy (different model)
    │
    └─ Analysis shows clear results
        ├─ Form picks DO have edge → Optimize & build on form
        └─ Form picks DON'T have edge → Pivot to expert tips / consensus
```

---

## If Things Go Wrong

**Issue: Several bets scratched or didn't run**
- Don't count as losses (weren't placed)
- System should mark as "Not Run"
- Reduces sample size but doesn't invalidate strategy

**Issue: Horses showing different on racing.com vs TrackWise**
- Name mismatches (e.g., "Air Raid" vs "Airraid")
- Manual correction: edit active_bets before submitting results
- Work on fuzzy name matching for Phase 2

**Issue: Sportsbet odds changed after we placed bets**
- This is normal (live odds move)
- We locked opening odds at placement time ✓
- CLV will show if market moved against us (market was right)

---

## Timing

- **Most races:** 11am - 4pm local time (varies by state)
- **Evening races:** ~7-8pm
- **Results:** Usually 10-15 mins after race finish
- **Ideal result entry time:** 30-60 mins after race (all results available)

---

## Success Criteria for Phase 1

✅ **Primary:** Measure actual ROI using form picks  
✅ **Secondary:** Confirm if CLV is predictive (market validates picks)  
✅ **Tertiary:** Get jockey/trainer data for Phase 2 feature engineering  

**Next Action:**
1. Monitor bets throughout day
2. Enter results in TrackWise as races complete
3. Run analysis script at EOD
4. Document findings for Phase 2 planning

Good luck! 🏇
