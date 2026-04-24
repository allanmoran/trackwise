# Phase 4: Production Deployment Runbook

**Status**: READY WHEN PHASE 2A APPROVED (Apr 27-28)  
**Duration**: 2-4 hours  
**Owner**: TrackWise Operations  
**Rollback**: Automatic (revert to Phase 2A monitoring)

---

## Pre-Launch Checklist (Day Before Deployment)

### ✓ Phase 2A Validation Complete
```bash
# Check approval metrics
node /tmp/phase2a_go_no_go_analysis.mjs
# Expected: Exit code 0 (all criteria pass)
```

**Requirements:**
- [ ] Bets placed: ≥40
- [ ] ROI: ≥-10%
- [ ] Win rate: ≥4%
- [ ] Zero failures
- [ ] Zero settlement issues

### ✓ Database Integrity Verified
```bash
# Run full integrity check
sqlite3 /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db << 'EOF'
PRAGMA integrity_check;
SELECT COUNT(*) as races FROM races WHERE date = '2026-04-28';
SELECT COUNT(*) as active_bets FROM bets WHERE status = 'ACTIVE';
SELECT COUNT(*) as orphaned FROM bets WHERE race_id NOT IN (SELECT id FROM races);
EOF
```

**Pass Criteria:**
- [ ] PRAGMA integrity_check returns "ok"
- [ ] Active races found for today
- [ ] Zero orphaned bets
- [ ] Active bet count matches expected

### ✓ Backend Services Healthy
```bash
# Check API health
curl http://localhost:3001/api/health
# Expected: {"status":"ok","timestamp":"..."}

# Verify prediction model loaded
curl http://localhost:3001/api/kb/stats
# Expected: horse_count > 30000, race_count > 1000
```

**Pass Criteria:**
- [ ] API responds 200 OK
- [ ] Knowledge base populated
- [ ] Model ready (horse stats loaded)

### ✓ Configuration Audit
```bash
# Review production settings
cat /Users/mora0145/Downloads/TrackWise/backend/src/routes/form-scraper.js | grep "autoBet ="
cat /Users/mora0145/Downloads/TrackWise/backend/src/routes/bets.js | grep "MIN_CONFIDENCE\|MIN_EV\|MAX_ODDS"
```

**Pass Criteria:**
- [ ] `autoBet = true` (enabled for auto-betting)
- [ ] `MIN_CONFIDENCE = 20`
- [ ] `MIN_EV = 0.10` (10% minimum edge)
- [ ] `MAX_ODDS = 100.0`

---

## Deployment Steps (Production Launch Day)

### Phase 4.1: Pre-Deployment Verification (30 min)

**Time Window**: 8:00 AM - 8:30 AM

```bash
#!/bin/bash
set -e

echo "🔍 Pre-deployment verification..."

# 1. Database backup
cp /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db \
   /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ Database backed up"

# 2. Verify schema
sqlite3 /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db ".schema bets" | grep "status TEXT" > /dev/null
echo "✓ Schema validated"

# 3. Clear any orphaned bets
sqlite3 /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db << 'EOF'
DELETE FROM bets WHERE race_id NOT IN (SELECT id FROM races) AND status != 'ACTIVE';
EOF
echo "✓ Orphaned records cleaned"

# 4. Test batch endpoint
curl -X POST http://localhost:3001/api/bets/batch \
  -H "Content-Type: application/json" \
  -d '{"bets":[]}' | grep "success" > /dev/null
echo "✓ Batch endpoint responding"

echo "✅ All pre-deployment checks passed"
```

### Phase 4.2: Enable Production Auto-Betting (5 min)

**Time Window**: 8:30 AM - 8:35 AM

```bash
#!/bin/bash
echo "🚀 Enabling production auto-betting..."

# Verify autoBet is already true from Phase 2A
AUTOBET_STATUS=$(grep -A2 "const autoBet" /Users/mora0145/Downloads/TrackWise/backend/src/routes/form-scraper.js | grep "true")

if [ -z "$AUTOBET_STATUS" ]; then
  echo "❌ ERROR: autoBet not enabled!"
  echo "Run: sed -i 's/const autoBet = false/const autoBet = true/' /Users/mora0145/Downloads/TrackWise/backend/src/routes/form-scraper.js"
  exit 1
fi

echo "✓ Auto-betting enabled"
echo "✓ API restarted (if using auto-restart)"

# Verify it's actually enabled
sleep 2
curl http://localhost:3001/api/health | grep "ok" > /dev/null
echo "✅ Production auto-betting LIVE"
```

### Phase 4.3: Start Production Betting Cycles (9:00 AM)

**Time Window**: 9:00 AM - continuous

```bash
#!/bin/bash
echo "📊 Starting production betting cycles..."

cd /Users/mora0145/Downloads/TrackWise/backend

# Run aggressive betting cycle (same as Phase 2A)
# Expected: 25-50 bets placed in first cycle
node phase2a_daily_runner.mjs

# Log timestamp
echo "$(date '+%Y-%m-%d %H:%M:%S') - Production cycle 1 complete" >> /tmp/production_betting_log.txt
```

**Expected Output:**
- Bets placed: 25-50
- Success rate: ≥90%
- Errors: 0

### Phase 4.4: 8 PM Settlement & Reporting (20:00)

**Time Window**: 8:00 PM - 8:15 PM

```bash
#!/bin/bash
echo "💾 Running nightly settlement..."

cd /Users/mora0145/Downloads/TrackWise/backend

# Run settlement
bash /tmp/phase2a_settle_and_report.sh

# Run failure detection
bash /tmp/phase2a_failure_detection.sh

# Log results
echo "$(date '+%Y-%m-%d %H:%M:%S') - Daily settlement complete" >> /tmp/production_betting_log.txt
```

**Verify:**
- [ ] Settlement completed without errors
- [ ] ROI calculated and logged
- [ ] No data corruption detected

---

## Daily Operations (Production Phase)

### Morning Betting Cycles (9:00 AM)
```bash
cd /Users/mora0145/Downloads/TrackWise/backend && node phase2a_daily_runner.mjs
```
**Target**: 25-50 bets  
**Duration**: 30-60 seconds  
**Success rate**: ≥95%

### Afternoon Betting Cycle (2:00 PM, Optional)
```bash
cd /Users/mora0145/Downloads/TrackWise/backend && node phase2a_daily_runner.mjs
```
**Target**: 20-40 additional bets  
**Total daily**: 45-90 bets

### Evening Settlement (8:00 PM)
```bash
bash /tmp/phase2a_settle_and_report.sh
bash /tmp/phase2a_failure_detection.sh
```
**Duration**: 5-10 minutes  
**Output**: Daily P/L report, error log

---

## Monitoring & Alerts

### Daily Monitoring Checklist
```bash
#!/bin/bash

# 1. Check ROI trend
sqlite3 /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db << 'EOF'
SELECT 
  DATE(settled_at) as day,
  COUNT(*) as bets,
  ROUND(SUM(profit_loss), 2) as daily_pnl,
  ROUND(100 * SUM(profit_loss) / SUM(stake), 2) as roi_pct
FROM bets
WHERE status LIKE 'SETTLED%' AND settled_at >= date('now', '-7 days')
GROUP BY DATE(settled_at)
ORDER BY day DESC;
EOF

# 2. Check win rate
sqlite3 /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db << 'EOF'
SELECT 
  COUNT(*) as total_bets,
  SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
  ROUND(100.0 * SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) / COUNT(*), 2) as win_rate_pct
FROM bets
WHERE status LIKE 'SETTLED%' AND settled_at >= date('now', '-7 days');
EOF

# 3. Check for failures
sqlite3 /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db << 'EOF'
SELECT COUNT(*) as failed_bets FROM bets WHERE status = 'FAILED';
EOF

# 4. Check active bets (waiting for settlement)
sqlite3 /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db << 'EOF'
SELECT COUNT(*) as active_bets FROM bets WHERE status = 'ACTIVE';
EOF
```

### Weekly Review (Every Monday 9:00 AM)
```bash
#!/bin/bash

echo "═══════════════════════════════════════════"
echo "WEEKLY PRODUCTION REVIEW"
echo "═══════════════════════════════════════════"

WEEK_ROI=$(sqlite3 /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db << 'EOF'
SELECT ROUND(100 * SUM(profit_loss) / SUM(stake), 2)
FROM bets
WHERE status LIKE 'SETTLED%' 
  AND settled_at >= date('now', '-7 days');
EOF
)

WEEK_WINS=$(sqlite3 /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db << 'EOF'
SELECT COUNT(*) FROM bets 
WHERE result = 'WIN' AND settled_at >= date('now', '-7 days');
EOF
)

echo "Weekly ROI: ${WEEK_ROI}%"
echo "Weekly Wins: ${WEEK_WINS}"

if (( $(echo "$WEEK_ROI < -20" | bc -l) )); then
  echo "⚠️  WARNING: ROI below -20%, consider parameter adjustment"
elif (( $(echo "$WEEK_ROI > 0" | bc -l) )); then
  echo "✅ On track - ROI positive"
fi
```

---

## Rollback Procedure (If Needed)

### Automatic Rollback (Triggered by Monitoring)
```bash
#!/bin/bash

echo "🔙 Initiating rollback to Phase 2A..."

# 1. Disable auto-betting
sed -i 's/const autoBet = true/const autoBet = false/' \
  /Users/mora0145/Downloads/TrackWise/backend/src/routes/form-scraper.js

# 2. Restart API
# (Depends on deployment method - PM2, systemd, docker, etc.)

# 3. Revert to Phase 2A monitoring scripts
echo "Phase 2A monitoring enabled"
echo "Manual investigation required"

# 4. Notify operators
echo "⚠️  ROLLBACK COMPLETE - Review /tmp/production_betting_log.txt for details"
```

### Manual Rollback (Operator Decision)
```bash
# Stop production cycles
pkill -f phase2a_daily_runner.mjs

# Disable auto-betting
sed -i 's/const autoBet = true/const autoBet = false/' \
  /Users/mora0145/Downloads/TrackWise/backend/src/routes/form-scraper.js

# Restore from backup
cp /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db.backup.* \
   /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db

# Return to Phase 2A
bash /tmp/phase2a_settle_and_report.sh
```

---

## Success Metrics (Production Phase)

### Daily Targets (First 2 Weeks)
- **Bets placed**: 45-90/day ✓
- **ROI**: -5% to +15% ✓
- **Win rate**: 5-8% ✓
- **Failures**: 0/day ✓
- **Settlement errors**: 0/day ✓

### Weekly Targets (Weeks 2-4)
- **Cumulative ROI**: ≥0% ✓
- **Sustained win rate**: 5-7% ✓
- **System reliability**: 99.5% ✓
- **Zero data corruption**: 100% ✓

### Monthly Targets
- **Cumulative ROI**: ≥5% ✓
- **Monthly volume**: 1,000-2,000 bets ✓
- **Consistent performance**: ±3% variance ✓

---

## Emergency Contacts & Escalation

| Issue | Contact | Action |
|-------|---------|--------|
| API Down | Check logs: `/tmp/production_betting_log.txt` | Restart backend |
| High loss (ROI < -30%) | Pause auto-betting | Review EV threshold |
| Settlement failure | Check settlement script | Manual settlement required |
| Data corruption | Restore from backup | Investigate root cause |

---

## Deployment Sign-Off

- [ ] **Pre-deployment**: All checks passed at 8:30 AM
- [ ] **Go/No-Go**: Approved for production deployment
- [ ] **First cycle**: Betting cycle completed successfully at 9:00 AM
- [ ] **First settlement**: All bets settled at 8:15 PM
- [ ] **Production confirmed**: System operating normally

**Signed**: _______________ **Date**: _____________

---

## Appendix: Quick Reference

```bash
# Check current status
tail -50 /tmp/production_betting_log.txt

# View today's P/L
sqlite3 /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db << 'EOF'
SELECT ROUND(SUM(profit_loss), 2) as today_pnl FROM bets WHERE DATE(settled_at) = '2026-04-28';
EOF

# View system health
curl http://localhost:3001/api/health && echo ""

# Manual settlement (if needed)
cd /Users/mora0145/Downloads/TrackWise/backend && node src/settlement/settle_bets_daily.mjs

# Check for errors
tail -100 /tmp/phase2a_failure_detection.log
```
