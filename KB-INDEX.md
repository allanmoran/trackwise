# Knowledge Base Documentation Index

Quick navigation for all KB-related documentation and data sources.

---

## 📖 Primary KB Resources

### [KB-SUMMARY.md](KB-SUMMARY.md) ⭐ START HERE
**What:** Complete inventory of what's in the KB and what's available  
**Use:** Overview of data status, Phase 1→2 readiness, tracking metrics  
**Updated:** April 11, 2026  

### [KB-DATA-SOURCES.md](KB-DATA-SOURCES.md) ⭐ REFERENCE
**What:** Catalog of all data sources (Punters, Sportsbet, Racing.com, etc)  
**Use:** Find what data is available, how to extract it, quality standards  
**Sections:** 12 data source sections with integration details  

### [KB-ENRICHMENT-GUIDE.md](KB-ENRICHMENT-GUIDE.md)
**What:** How to enrich KB with jockey/trainer data  
**Use:** Manual CSV entry method, enrichment scripts, troubleshooting  
**Commands:** `npm run enrich-kb jockey-trainer-data.csv`

---

## 🎯 Phase 1 Testing Documentation

### [CHECKLIST_TODAY.md](CHECKLIST_TODAY.md) ⭐ DAILY REFERENCE
**What:** Quick checklist for April 11 testing  
**Use:** Morning setup, daily result entry, EOD analysis  
**Duration:** Today (April 11, 2026)

### [PHASE1_TODAY_ROADMAP.md](PHASE1_TODAY_ROADMAP.md)
**What:** Complete Phase 1 testing plan for today  
**Use:** Detailed timeline, expected outcomes, decision flowchart  
**Decision Points:** What happens if ROI is positive/negative/neutral?

### [PHASE1_IMPLEMENTATION_GUIDE.md](PHASE1_IMPLEMENTATION_GUIDE.md)
**What:** Technical details of CLV strategy implementation  
**Use:** How CLV works, what changed in code, what to expect  
**Status:** Phase 1 complete, running since April 10

### [PHASE1_DATA_SOURCES.md](PHASE1_DATA_SOURCES.md)
**What:** Data sources specific to Phase 1 testing  
**Use:** What data we discovered (Punters), what we're testing with  
**Focus:** Alternative market odds sources, expert tips

### [PHASE1_CLV_STRATEGY.md](PHASE1_CLV_STRATEGY.md)
**What:** Original Phase 1 strategy design document  
**Use:** Background on CLV concept, why it matters, success criteria

---

## 📊 Strategy Documentation

### [STRATEGY_V2.md](STRATEGY_V2.md)
**What:** Current Strategy V2 filter specifications  
**Use:** What filters are applied to picks, blacklist logic, performance metrics  
**Filters:** Confidence ≥75%, Odds ≤7.0, jockey/trainer blacklists

### [V2_FAILURE_REPORT.md](V2_FAILURE_REPORT.md)
**What:** Analysis of why Strategy V2 underperformed  
**Use:** Root cause analysis (7% hit rate vs 77% predicted confidence)  
**Lesson:** Form model confidence ≠ actual win rate (reason for Phase 1 CLV)

### [PAPER-TRADING-GUIDE.md](PAPER-TRADING-GUIDE.md)
**What:** Historical paper trading results and analysis  
**Use:** Compare current real results to past paper trades  

---

## 🗂️ Data Files

### Race URLs & Extraction
- `RACE_URLS.txt` - URLs extracted from today's Sportsbet (66 races initially)
- `TODAY_RACE_LINKS.txt` - Expanded daily race link list
- `TODAY_AU_RACES.txt` - Complete Australian race schedule (126 races)
- `TODAY_RACE_LINKS_CLEAN.txt` - Cleaned URLs for batch processing

### System Files
- `jockey-trainer-template.csv` - Template for KB enrichment (if exists)
- `.env.local` - Database connection (git-ignored)
- `package.json` - Dependencies including Puppeteer

---

## 🔧 Scripts & Tools

### Analysis & Enrichment
```bash
# Analyze Phase 1 CLV results (run at EOD)
npx tsx scripts/analyze-clv-strategy.ts

# Enrich KB with jockey/trainer data
npm run enrich-kb jockey-trainer-data.csv

# Import Betfair historical data
npm run import-betfair
```

### Data Extraction (In Development)
```bash
# Extract today's races from Sportsbet
npx tsx scripts/extract-daily-races.ts

# Explore Punters data sources
npx tsx scripts/explore-punters-data.ts

# Scrape Punters odds comparison (WIP)
npx tsx scripts/scrape-punters-odds.ts

# Scrape Punters expert tips (WIP)
npx tsx scripts/scrape-punters-tips.ts
```

### Daily Workflow
```bash
# Start development UI
npm run dev

# Load today's races (via UI button)
# "Load Today's Races" → Calls /api/races/today endpoint

# Generate and place bets (via UI button)
# "Generate & Place Bets" → Calls /api/parse-sportsbet for each URL

# Enter results (manual, via Results tab)

# Analyze at EOD
npx tsx scripts/analyze-clv-strategy.ts
```

---

## 📋 Database Tables

### Key KB Tables
| Table | Purpose | Rows |
|-------|---------|------|
| `races` | Race metadata (track, date, time) | 89+ |
| `horses` | Horse entries in races | 418+ |
| `bets` | Active & completed bets | Growing |
| `kelly_logs` | CLV & performance tracking | Growing |
| `jockey_stats` | Jockey win rates (if enriched) | Optional |
| `trainer_stats` | Trainer win rates (if enriched) | Optional |

### Query Examples
```sql
-- All Phase 1 bets placed today
SELECT * FROM kelly_logs WHERE created_at >= '2026-04-11' ORDER BY created_at DESC;

-- Jockey performance
SELECT jockey, COUNT(*) as races, SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) as wins
FROM kelly_logs GROUP BY jockey ORDER BY wins DESC;

-- CLV analysis
SELECT 
  CASE WHEN clv_percent > 0 THEN 'Positive' ELSE 'Negative' END as clv_bucket,
  COUNT(*) as count,
  AVG(clv_percent) as avg_clv
FROM kelly_logs
GROUP BY clv_bucket;
```

---

## 🎓 Learning Path

### For Understanding Phase 1
1. Read: [PHASE1_TODAY_ROADMAP.md](PHASE1_TODAY_ROADMAP.md) (5 min)
2. Read: [PHASE1_IMPLEMENTATION_GUIDE.md](PHASE1_IMPLEMENTATION_GUIDE.md) (10 min)
3. Run: `npx tsx scripts/analyze-clv-strategy.ts` (5 min after bets complete)
4. Reference: [PHASE1_DATA_SOURCES.md](PHASE1_DATA_SOURCES.md) as needed

### For Building Phase 2
1. Read: [KB-SUMMARY.md](KB-SUMMARY.md) (10 min) - See what data we have
2. Read: [KB-DATA-SOURCES.md](KB-DATA-SOURCES.md) (15 min) - Understand Punters source
3. Manual: Extract jockey/trainer from Punters form guide (1-2 hours)
4. Run: `npm run enrich-kb jockey-trainer-data.csv` (5 min)
5. Implement: Hybrid model (30% form + 70% jockey/trainer)

### For KB Enrichment
1. Read: [KB-ENRICHMENT-GUIDE.md](KB-ENRICHMENT-GUIDE.md) (10 min)
2. Gather: Jockey/trainer data from [Punters form guide](https://www.punters.com.au/form-guide/)
3. Create: jockey-trainer-data.csv using provided template
4. Run: `npm run enrich-kb jockey-trainer-data.csv`

---

## 🔍 Quick Search

### Finding Information By Topic

**"How do I enter race results?"**
→ [CHECKLIST_TODAY.md](CHECKLIST_TODAY.md) section "In Progress"

**"What data is available for Phase 2?"**
→ [KB-SUMMARY.md](KB-SUMMARY.md) section "Data Available with Extraction"

**"How do I extract jockey/trainer data?"**
→ [KB-DATA-SOURCES.md](KB-DATA-SOURCES.md) section "1. Punters.com.au - Form Guide"

**"What's the decision point for Phase 2?"**
→ [PHASE1_TODAY_ROADMAP.md](PHASE1_TODAY_ROADMAP.md) section "Expected Outcomes & Decisions"

**"What filters are being applied to picks?"**
→ [STRATEGY_V2.md](STRATEGY_V2.md)

**"Why did the old strategy fail?"**
→ [V2_FAILURE_REPORT.md](V2_FAILURE_REPORT.md)

**"How does CLV work?"**
→ [PHASE1_IMPLEMENTATION_GUIDE.md](PHASE1_IMPLEMENTATION_GUIDE.md) section "Core Concept"

**"What should I do right now?"**
→ [CHECKLIST_TODAY.md](CHECKLIST_TODAY.md)

---

## 📞 Support & Next Steps

### If Phase 1 Tests Positive (+5% ROI)
1. Proceed to Phase 2 planning
2. Extract jockey/trainer from Punters (see [KB-DATA-SOURCES.md](KB-DATA-SOURCES.md))
3. Implement hybrid model (30% form + 70% jockey/trainer)
4. Re-test on new batch of races

### If Phase 1 Tests Neutral (0% to +5% ROI)
1. Collect 100+ bets before deciding (see [PHASE1_TODAY_ROADMAP.md](PHASE1_TODAY_ROADMAP.md))
2. Continue with current Strategy V2
3. Retest at 100 bets

### If Phase 1 Tests Negative (<-5% ROI)
1. Investigate root cause (see [V2_FAILURE_REPORT.md](V2_FAILURE_REPORT.md))
2. Consider pivot to Punters expert tips consensus
3. Or rebuild with market-based features

### For Technical Questions
1. Check [KB-DATA-SOURCES.md](KB-DATA-SOURCES.md) for integration details
2. Check [PHASE1_IMPLEMENTATION_GUIDE.md](PHASE1_IMPLEMENTATION_GUIDE.md) for code details
3. Search script files in `scripts/` directory

---

## 📅 Timeline & Milestones

| Date | Milestone | Status | Reference |
|------|-----------|--------|-----------|
| April 8-10 | Strategy V2 implementation | ✅ Complete | [STRATEGY_V2.md](STRATEGY_V2.md) |
| April 11 | Phase 1 testing (71 bets) | 🔄 In progress | [CHECKLIST_TODAY.md](CHECKLIST_TODAY.md) |
| April 11 EOD | Phase 1 analysis | ⏳ Pending | `analyze-clv-strategy.ts` |
| April 12+ | Phase 2 (if ROI > +5%) | 📋 Planned | [KB-DATA-SOURCES.md](KB-DATA-SOURCES.md) |

---

**Last Updated:** April 11, 2026  
**Owner:** TrackWise Strategy Team  
**Next Review:** April 11, 2026 (EOD Phase 1 results)

---

## Quick Links
- 🏠 [README.md](README.md) - Project overview
- 📊 [KB-SUMMARY.md](KB-SUMMARY.md) - KB status & inventory  
- 📖 [KB-DATA-SOURCES.md](KB-DATA-SOURCES.md) - All data sources
- ✅ [CHECKLIST_TODAY.md](CHECKLIST_TODAY.md) - Today's tasks
- 🎯 [PHASE1_TODAY_ROADMAP.md](PHASE1_TODAY_ROADMAP.md) - Phase 1 plan
