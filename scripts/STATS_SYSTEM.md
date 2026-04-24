# TrackWise Stats Aggregation System

## Overview
The stats system unlocks **bonus scoring** for high-performing trainers and jockeys, allowing picks to exceed the base 58/100 confidence threshold.

## Architecture

### Three-Script Workflow

#### 1. Data Entry: `quick-entry-[track]-[race].ts`
- Inserts new races into `manual_races` table (JSONB runners array)
- Pattern: trainer, jockey, odds, weight, barrier
- Creates knowledge base of real racing data

#### 2. Aggregation: `aggregate-stats.ts`
- Reads all races from `manual_races`
- Creates two statistics tables:
  - `trainer_stats`: trainer_name, total_runners, win_count, place_count
  - `jockey_stats`: jockey_name, total_runners, win_count, place_count
- **Market-based scoring**: Uses odds (1/odds) to estimate trainer/jockey competence
  - Low odds horses = trainer/jockey likely better
  - Aggregates probability estimates across all runners

#### 3. Picks Scoring: `test-picks-with-stats.ts`
- Scores each runner with base odds-based score
- **Unlocks bonuses**:
  - If trainer win_rate > 15%: +2-5 points
  - If jockey win_rate > 15%: +2-5 points
- Displays top 3 recommendations per race
- Flags picks >= 60/100 as "HIGH CONFIDENCE"

## Scoring Formula

```
Base Score = 50
  if odds < 3.5:      Base = 58
  if odds 3.5-5.5:    Base = 54
  if odds >= 5.5:     Base = 50

Trainer Bonus (if win_rate > 15%):
  bonus = MIN(5, FLOOR((win_rate - 15) / 5))
  score += bonus

Jockey Bonus (if win_rate > 15%):
  bonus = MIN(5, FLOOR((win_rate - 15) / 5))
  score += bonus

Final Score = MIN(100, score)
```

## Usage

### Single Race Entry + Scoring
```bash
npx tsx scripts/quick-entry-pinjarra-r1.ts
npx tsx scripts/aggregate-stats.ts
npx tsx scripts/test-picks-with-stats.ts
```

### Full Daily Workflow
```bash
npx tsx scripts/daily-workflow.ts
```
Runs all steps automatically: entry → aggregation → picks with stats.

## Unlocking the 60+ Threshold

Current knowledge base (6 races, 46 horses):
- All picks capped at 58/100 without stats
- Once stats are aggregated:
  - Chris Waller (5+ runs): high odds consistency → estimated 25%+ win_rate
  - Other frequent trainers: will qualify for 2-5 point bonuses
  - Top performers: 58 + 5 = **63/100** ✓ HIGH CONFIDENCE

## Next Phases

### Phase 2: Actual Results
Add `race_results` table with winner/placer data:
- Track actual wins/places instead of odds estimates
- Update trainer_stats and jockey_stats with real data
- Bonuses become data-driven vs. market-estimated

### Phase 3: Form Guide Automation
- Parse Sportsbet form guides automatically
- Extract jockey/trainer career records from PDF
- Pre-populate win rates from official data

### Phase 4: Betting Integration
- Connect stats to paper trading recommendations
- Show expected ROI based on trainer/jockey performance
- Track actual P&L vs. predicted by stats
