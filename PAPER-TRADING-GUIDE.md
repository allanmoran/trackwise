# TrackWise Paper Trading System

**Status**: ✅ Live with 13 paper bets placed for 2026-04-07

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Proxy (localhost:3001)                                     │
│  • Fetches Betfair ratings CSV                             │
│  • Stores paper bets in Postgres                           │
│  • Provides /api/paper-bets endpoint                       │
└──────────────────┬──────────────────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
Paper-Trading  Results-Resolver  Dashboard
Engine         (Polls races)      (localhost:5173)
(Places bets)  (Auto-resolves)    (Real-time tracking)
```

## Quick Start

### 1. Start Proxy (Fetches ratings, stores bets)
```bash
npm run proxy
```
→ Runs on `http://localhost:3001`

### 2. Place Paper Bets (Automated)
```bash
npm run paper-trading
```
- Fetches Betfair ratings
- Groups by race
- Selects favorites (lowest odds, 8-14 horse fields)
- Places bets with Kelly-lite staking ($30 avg)
- Stores in database

### 3. Auto-Resolve Results (Polls Racing.com every 60s)
```bash
npm run results
```
- Checks Racing.com for finished races
- Matches horses by name (fuzzy matching)
- Updates bets with WIN/PLACE/LOSS
- Calculates P&L automatically

### 4. View Dashboard (Real-time)
```
http://localhost:5173/paper-trading
```
Shows:
- **Pending**: Awaiting race results
- **Settled**: Final outcomes with P&L
- **Summary**: ROI, win rate, total stake

## Key Features

### Selection Logic
- **Market Signal**: Use Betfair odds (already encode form)
- **Field Size Filter**: Only 8-14 horse races
- **Favorites**: Select lowest odds (highest market confidence)
- **Odds Range**: Accept 1.5–20.0 only

### Staking (Kelly-Lite)
- Unit = Bank / 25
- Max stake = Unit × 5, capped at 15% of bank
- Split: 75% win, 25% place

### Result Calculation
- **WIN** (1st): pl = win_stake × (odds - 1)
- **PLACE** (2-3): pl = place_stake × ((odds - 1) / 4)
- **LOSS** (4+): pl = -total_stake

### P&L Example
```
Bet: Alleze @ $1.40, stake $30 (W:$22.50, P:$7.50)

If WIN:  +$22.50 × 0.40 = +$9.00
If PLACE: +$7.50 × 0.10 = +$0.75
If LOSS: -$30.00
```

## Data Flow

```
Racing.com (Betfair ratings)
    ↓
Proxy /api/ratings/today
    ↓
Paper-Trading Engine
    ├─ Group by race
    ├─ Filter by field size
    ├─ Select favorites
    ├─ Calculate stake
    └─ POST /api/paper-bets
        ↓
    Postgres (paper_bets table)
        ↓
    Results Resolver (polls)
        ├─ Racing.com race results
        ├─ Fuzzy match horses
        ├─ Calculate P&L
        └─ Update paper_bets
            ↓
        Dashboard (polls /api/paper-bets)
            ├─ Shows pending races
            ├─ Shows settled results
            ├─ Calculates ROI
            └─ Updates in real-time
```

## Form Data Strategy

### Current Approach
- **Market Odds as Proxy**: Betfair odds already reflect collective form knowledge
- **Simplicity**: Fewer moving parts = fewer bugs

### Future Enhancements
Once form scraping is reliable, add:
- Strike rate weighting
- Recency bonus (recent wins/places)
- Speed rating (pace data)
- Expert tips
- Trainer/jockey records

Racing.com provides multiple form endpoints:
- `/form/{date}/{track}/race/{n}` (overview)
- `/form/{date}/{track}/race/{n}/full-form` (detailed)
- `/form/{date}/{track}/race/{n}/tips` (expert picks)
- `/form/{date}/{track}/race/{n}/speedmap` (pace analysis)

## Database Schema

```sql
paper_bets:
├─ id (UUID) - Bet ID
├─ date (TEXT) - Bet date
├─ track (TEXT) - Track name
├─ race_num (INT) - Race number
├─ horse (TEXT) - Horse name
├─ odds (DECIMAL) - Win odds at time of bet
├─ form_score (INT) - Form analysis score (0-100) [READY]
├─ stake (DECIMAL) - Total stake
├─ win_stake (DECIMAL) - Stake on win
├─ place_stake (DECIMAL) - Stake on place
├─ recommendation_reason (TEXT) - Why selected
├─ result (TEXT) - WIN/PLACE/LOSS (null=pending)
├─ pl (DECIMAL) - Profit/Loss
├─ scrape_time (TIMESTAMP) - When bet was placed
└─ result_time (TIMESTAMP) - When result was finalized
```

## Monitoring

### Logs
- **Proxy**: `npm run proxy` logs all bet placements
- **Resolver**: `npm run results` logs each resolved bet
- **Dashboard**: Real-time updates every 10 seconds

### Key Metrics
- **ROI**: (Total P&L) / (Total Stake) × 100
- **Win Rate**: Wins / (Wins + Places + Losses)
- **Strike Rate**: Wins / Total Races
- **Max Bet**: Displayed on dashboard

## Troubleshooting

### No bets placed?
1. Check proxy is running: `curl http://localhost:3001/health`
2. Check Betfair ratings fetch: `curl http://localhost:3001/api/ratings/today | head -1`
3. Check field size (need 8-14 horses per race)
4. Check odds range (need 1.5-20.0)

### Results not showing?
1. Check if races have finished (page might say "Pending")
2. Check horse name normalization (fuzzy matching handles typos)
3. Manual update: `UPDATE paper_bets SET result='WIN' WHERE id='...'`

### Dashboard blank?
1. Ensure proxy is running
2. Check browser console for fetch errors
3. Verify `/api/paper-bets` returns data

## Daily Workflow

```
Morning:
1. npm run proxy (leave running)
2. npm run paper-trading (places bets for day)
3. npm run results (leave running, polls continuously)
4. Open http://localhost:5173/paper-trading

End of Day:
5. Review dashboard results
6. Analyze form accuracy: Did favorites win?
7. Calculate ROI vs target
8. Plan adjustments for tomorrow
```

## Success Metrics

**Target**: 10%+ ROI, 3-5 daily bets, consistent 30%+ win rate

**Current** (2026-04-07):
- 13 bets placed
- Total stake: $390 (w/ aggressive Kelly scaling)
- Average bet: $30
- Status: ⏳ Awaiting race results

## Next Steps

1. ✅ System live - paper bets placed
2. ⏳ Watch results come in (noon-6pm)
3. 📊 Analyze outcomes on dashboard
4. 📈 Calculate actual ROI
5. 🔍 Compare TrackWise picks vs actual results
6. 🎯 Optimize selection logic based on learnings
7. 🚀 Scale to real money once validated

---

**Note**: This is a paper trading system (no real money at risk). Data is stored in Postgres and accessible via the dashboard for analysis and learning.
