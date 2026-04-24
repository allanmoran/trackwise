# TrackWise — AU Racing Strategy Engine

A self-learning horse racing strategy simulator for Australian thoroughbred racing.

## Quick Start

```bash
npm install
npm run dev       # Live dashboard at http://localhost:5173
```

## Finding the optimal strategy

### Step 1 — Run the headless engine
```bash
npm run engine
# Runs 1000+ races/sec. Hit Ctrl+C when done (saves automatically).
# Results saved to public/data/results.json
```

### Step 2 — Analyse results
```bash
npm run dev
# Open http://localhost:5173/analysis
```

### Step 3 — Tune the strategy
Edit `src/config/strategy.ts`, re-run the engine, compare ROI curves.

## Architecture

| Path | Purpose |
|------|---------|
| `src/config/strategy.ts` | All strategy parameters |
| `src/simulation.ts` | Core simulation engine |
| `src/workers/simulation.worker.ts` | Web Worker (browser) |
| `scripts/engine.ts` | Headless engine (Node.js) |
| `src/pages/Analysis.tsx` | Results dashboard |
| `public/data/results.json` | Engine output (git-ignored) |

## Speed modes

The live dashboard supports 1×, 5×, and 20× speed (top-right speed selector).
For millions of races, use `npm run engine` instead.

## Phase 1: Real-World Testing (April 2026)

TrackWise is now live testing Phase 1 CLV (Closing Line Value) strategy validation. 

**Current Status:**
- ✅ 71 bets placed (April 11, 2026)
- 🔄 Races running throughout day
- 📊 Analysis at EOD with `npx tsx scripts/analyze-clv-strategy.ts`

**Documentation:**
- [Today's Checklist](CHECKLIST_TODAY.md) — Quick reference for entering results
- [Phase 1 Roadmap](PHASE1_TODAY_ROADMAP.md) — Complete testing strategy
- [Phase 1 Implementation](PHASE1_IMPLEMENTATION_GUIDE.md) — Technical details
- [Phase 1 Data Sources](PHASE1_DATA_SOURCES.md) — Available data for enhancement

## Knowledge Base Enrichment

Build predictive models using jockey/trainer performance data.

**Available Resources:**
- [KB Enrichment Guide](KB-ENRICHMENT-GUIDE.md) — How to enrich with jockey/trainer data
- [KB Data Sources](KB-DATA-SOURCES.md) — Complete data source catalog

**Quick Start:**
```bash
# Import historical Betfair data
npm run import-betfair

# Enrich with jockey/trainer data
npm run enrich-kb jockey-trainer-data.csv
```

## Strategy V2 (Current)

See [STRATEGY_V2.md](STRATEGY_V2.md) for filter specifications and performance reports.

## Deploy

```bash
vercel --prod
```
