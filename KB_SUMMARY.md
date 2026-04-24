# 🧠 Comprehensive Knowledge Base Summary

## Overview

The TrackWise Knowledge Base now contains **comprehensive racing intelligence** from **5+ years of Betfair/Kash model data** (2021-2026).

### Data Statistics

| Metric | Value |
|--------|-------|
| **Total Races** | 91,189+ |
| **Total Horses** | 72,355+ |
| **Race Results** | 1,457,294+ |
| **Australian Tracks** | 233 |
| **Years of Data** | 2021-2026 |

### Performance Overview

- **Overall Win Rate**: 6.3%
- **Overall Place Rate**: 18.3%
- **Top Horse Win Rate**: 25.9% (Go Getaboy)
- **Most Consistent**: Delago Lad (24.2% over 62 races)

## Data Sources

### Loaded Datasets

1. **Kash_Model_Results_2021.csv** — 426,094 records, 14,153 races
2. **Kash_Model_Results_2022.csv** — 438,825 records, 16,778 races
3. **Kash_Model_Results_2023.csv** — 171,544 records, 17,571 races
4. **Kash_Model_Results_2024.csv** — 189,173 records, 19,079 races
5. **Kash_Model_Results_2025.csv** — 185,537 records, 18,956 races
6. **Kash_Model_Results_2026_01-03.csv** — 44,579 records, 4,653 races

**Total: 1,457,294 race results across 91,189 races**

## Top Performing Horses

### By Win Rate (Minimum 50 Races)

| Horse | Races | Wins | Win Rate |
|-------|-------|------|----------|
| Go Getaboy | 54 | 14 | **25.9%** |
| Delago Lad | 62 | 15 | **24.2%** |
| Altar Boy | 58 | 14 | **24.1%** |
| Station One | 52 | 13 | **25.0%** |
| Wild Imagination | 54 | 13 | **24.1%** |
| Avenue Of Stars | 52 | 12 | **23.1%** |
| I Need A Drink | 59 | 13 | **22.0%** |

## Top Performing Tracks

### By Race Volume & Win Rate

| Track | Races | Wins | Win Rate |
|-------|-------|------|----------|
| Sunshine Coast | 24,339 | 2,484 | 10.2% |
| Ipswich | 16,668 | 1,764 | 10.6% |
| Newcastle | 15,682 | 1,697 | 10.8% |
| Pakenham | 15,897 | 1,659 | 10.4% |
| Morphettville | 21,102 | 2,093 | 9.9% |

## Knowledge Base Features

### Horse Intelligence
- **Career statistics** for all 72,355 horses
- **Strike rates** and place rates
- **Form scores** based on recent performance
- **Track affinities** (which tracks each horse performs best at)
- **Distance preferences** where available
- **Historical win/place records**

### Track Intelligence
- **Performance metrics** for 233 Australian tracks
- **Win rates** by track
- **Field size analysis**
- **Seasonal patterns**
- **Condition-based statistics**

### Bet Type Analysis
- **WIN bet performance** across all data
- **PLACE bet performance** across all data
- **Odds correlation** with outcomes
- **Expected value calculations**

## How This KB Informs Predictions

### 1. Horse Selection
- Identify horses with consistent win rates above 10%
- Filter by recent form scores
- Consider track-specific performance

### 2. Track Selection
- Focus on tracks with higher overall win rates (10%+)
- Avoid low-performing tracks (<5%)

### 3. Odds Assessment
- Compare starting odds vs BSP (Betfair Starting Price)
- Calculate implied probability
- Identify value bets (positive expected value)

### 4. Field Analysis
- Horses competing against weaker fields have better odds
- Form score differences matter
- Barrier positions influence outcomes

## Frontend Integration

The KB data is exported to frontend-accessible JSON files:

- **`kb-intelligence.json`** — Full KB with all aggregations
- **`results.json`** — Settlement results + historical performance
- **Endpoints ready** for Analysis, Recommender, and prediction APIs

## Continuous Improvement

The KB automatically:
- Updates with new race results
- Recalculates form scores
- Identifies emerging patterns
- Highlights performance anomalies

This knowledge base is the **key intelligence asset** that enables:
- ✅ Predictive modeling
- ✅ Bet selection optimization
- ✅ Risk management
- ✅ Performance tracking
- ✅ Strategy refinement

---

*Last Updated: April 16, 2026*
*Data Range: 2021-2026*
*Status: READY FOR PREDICTION*
