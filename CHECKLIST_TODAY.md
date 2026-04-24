# April 11, 2026 - Phase 1 Testing Checklist

## ✅ Complete (Morning)
- [x] Extracted today's 126 Australian races
- [x] Loaded races into TrackWise
- [x] Generated picks from Sportsbet Form pages
- [x] Applied Strategy V2 filters (Conf≥75%, Odds≤7.0, etc)
- [x] Auto-placed 71 bets with Kelly stakes
- [x] Logged all bets to database with CLV metadata

---

## 🔄 In Progress (Throughout Day)
As races complete, **enter results into TrackWise:**

1. **Check racing.com** after each race (or Sportsbet results)
2. **Go to TrackWise Results tab**
3. **Fill in:**
   - Track: [Rockhampton, Caulfield, etc]
   - Race #: [1, 2, 3, etc]
   - Results: [Copy winner + place finishers]
4. **Click Submit** → System matches your bets automatically

**Format:** Copy from racing.com Dividends section:
```
1st: Lucky Winner (5)
2nd: Second Best (3)
3rd: Third Place (7)
```

---

## 📊 End of Day (After 4-5pm when most races done)
```bash
cd /Users/mora0145/Downloads/TrackWise
npx tsx scripts/analyze-clv-strategy.ts
```

This will show:
- ✅ Total ROI on 71 bets
- ✅ Hit rate (wins/places/losses)
- ✅ CLV validation (did positive CLV bets win?)
- ✅ Phase 2 readiness assessment

---

## 🎯 Success Criteria

**Positive outcome (Target: +5% or better):**
- Form picks show edge
- Proceed to Phase 2 hybrid model

**Neutral (0% to +5%):**
- Edge is weak
- Collect 100+ bets for better signal

**Negative (< -5%):**
- Form model broken
- Rebuild with different approach

---

## 📱 Quick Links

- **Dashboard:** http://localhost:3001/
- **Results Entry:** http://localhost:3001/ → Results tab
- **Racing.com:** https://www.racing.com/ (get results)
- **Sportsbet:** https://www.sportsbetform.com.au/ (reference)

---

## 💡 Pro Tips

1. **Batch result entry:** Enter all morning races at ~1pm, afternoon races at ~5pm
2. **Racing.com format:** Click "Dividends" section (cleaner format)
3. **If horse scratched:** Don't enter as LOSS, mark as SCRATCHED/NOT RUN
4. **Analysis timing:** Safe to run anytime after 4pm

---

## Next Steps (After Analysis)

**If ROI > +5%:**
→ Phase 2: Extract jockey/trainer data from form guide
→ Build hybrid model (30% form + 70% jockey/trainer)
→ Test on next batch of races

**If ROI ≤ +5%:**
→ Collect 100+ bets before deciding
→ OR investigate what went wrong with form model

**If ROI < -5%:**
→ Pivot strategy: Try Punters expert tips consensus
→ OR rebuild with market-based features (line movement, odds compression)

---

## Files Reference

- `PHASE1_TODAY_ROADMAP.md` - Detailed today's plan
- `PHASE1_DATA_SOURCES.md` - What data is available for Phase 2
- `PHASE1_IMPLEMENTATION_GUIDE.md` - How CLV strategy works
- `scripts/analyze-clv-strategy.ts` - Analysis tool (run at EOD)

Good luck! 🏇📊
