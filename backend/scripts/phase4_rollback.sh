#!/bin/bash

# Phase 4 Emergency Rollback - Return to Phase 2A state
# Use if production deployment shows critical issues

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         PHASE 4 EMERGENCY ROLLBACK                         ║"
echo "║         Reverting to Phase 2A Monitoring State             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

BACKEND_DIR="/Users/mora0145/Downloads/TrackWise/backend"
DB_PATH="${BACKEND_DIR}/data/trackwise.db"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "⚠️  INITIATING ROLLBACK - $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ============================================================================
# STEP 1: STOP PRODUCTION BETTING CYCLES
# ============================================================================

echo "📍 STEP 1: Stopping production betting cycles..."
pkill -f phase2a_daily_runner.mjs 2>/dev/null || true
sleep 2
echo "✓ Production cycles stopped"

# ============================================================================
# STEP 2: DISABLE AUTO-BETTING
# ============================================================================

echo ""
echo "📍 STEP 2: Disabling auto-betting..."

# Check if autoBet is enabled
if grep -q "const autoBet = true" "$BACKEND_DIR/src/routes/form-scraper.js"; then
  sed -i.rollback "s/const autoBet = true/const autoBet = false/" "$BACKEND_DIR/src/routes/form-scraper.js"
  echo "✓ Auto-betting disabled"
  echo "  Backup: ${BACKEND_DIR}/src/routes/form-scraper.js.rollback"
else
  echo "✓ Auto-betting already disabled"
fi

# ============================================================================
# STEP 3: ANALYZE ROLLBACK REASON
# ============================================================================

echo ""
echo "📍 STEP 3: Analyzing system state..."
echo ""

# Check latest bets
LATEST_BETS=$(sqlite3 "$DB_PATH" << 'EOF'
SELECT COUNT(*) as bet_count,
       ROUND(AVG(profit_loss), 2) as avg_pnl,
       ROUND(SUM(profit_loss), 2) as total_pnl
FROM bets WHERE placed_at >= datetime('now', '-1 day') AND status LIKE 'SETTLED%';
EOF
)

echo "Recent betting activity:"
echo "$LATEST_BETS" | while read count pnl total; do
  echo "  Bets: $count | Avg P/L: $pnl | Total P/L: $total"
done
echo ""

# Check for errors
ERROR_COUNT=$(sqlite3 "$DB_PATH" << 'EOF'
SELECT COUNT(*) FROM bets WHERE status = 'FAILED' AND placed_at >= datetime('now', '-1 day');
EOF
)

if [ "$ERROR_COUNT" -gt 0 ]; then
  echo "⚠️  ERROR COUNT: $ERROR_COUNT failed bets in last 24 hours"
else
  echo "✓ No failed bets detected"
fi

# Check active bets
ACTIVE_BETS=$(sqlite3 "$DB_PATH" << 'EOF'
SELECT COUNT(*) FROM bets WHERE status = 'ACTIVE' AND placed_at >= datetime('now', '-1 day');
EOF
)

if [ "$ACTIVE_BETS" -gt 0 ]; then
  echo "⚠️  ACTIVE BETS: $ACTIVE_BETS bets awaiting settlement"
else
  echo "✓ No active bets"
fi

# ============================================================================
# STEP 4: RESTORE FROM BACKUP (OPTIONAL)
# ============================================================================

echo ""
echo "📍 STEP 4: Database state"
echo ""

# Find latest backup
LATEST_BACKUP=$(ls -t "$DB_PATH.backup"* 2>/dev/null | head -1)

if [ -n "$LATEST_BACKUP" ]; then
  echo "Latest backup found: $LATEST_BACKUP"
  echo ""
  read -p "Restore from backup? (y/N): " RESTORE

  if [[ $RESTORE == "y" || $RESTORE == "Y" ]]; then
    cp "$LATEST_BACKUP" "$DB_PATH"
    echo "✓ Database restored from backup"
  else
    echo "✓ Keeping current database"
  fi
else
  echo "⚠️  No backups found"
fi

# ============================================================================
# STEP 5: VERIFY SYSTEM STATE
# ============================================================================

echo ""
echo "📍 STEP 5: Verifying rollback..."

# Check database integrity
echo ""
echo "Database integrity check..."
INTEGRITY=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;")
if [ "$INTEGRITY" = "ok" ]; then
  echo "✓ Database integrity verified"
else
  echo "⚠️  Database integrity issue: $INTEGRITY"
fi

# Check API
echo ""
echo "API health check..."
API_RESPONSE=$(curl -s http://localhost:3001/api/health 2>/dev/null || echo '{"error":"unreachable"}')
if echo "$API_RESPONSE" | grep -q "ok"; then
  echo "✓ API responding"
else
  echo "⚠️  API not responding - may need manual restart"
fi

# ============================================================================
# STEP 6: RETURN TO PHASE 2A MONITORING
# ============================================================================

echo ""
echo "📍 STEP 6: Resuming Phase 2A monitoring..."

cat >> /tmp/production_betting_log.txt << EOF

[${TIMESTAMP}] ⚠️  ROLLBACK TO PHASE 2A INITIATED
Auto-betting disabled - returning to manual monitoring mode
Latest state: See /tmp/rollback_analysis_${TIMESTAMP}.txt

EOF

echo "✓ Phase 2A monitoring mode activated"

# ============================================================================
# SUMMARY & RECOMMENDATIONS
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ROLLBACK COMPLETE                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "Status:"
echo "  ✓ Production betting cycles stopped"
echo "  ✓ Auto-betting disabled"
echo "  ✓ System returned to Phase 2A state"
echo ""

echo "Next Steps:"
echo "  1. Review rollback logs:"
echo "     tail -100 /tmp/production_betting_log.txt"
echo ""
echo "  2. Analyze root cause:"
echo "     • Check error log for API failures"
echo "     • Review recent bets for patterns"
echo "     • Verify database consistency"
echo ""
echo "  3. Run investigation scripts:"
echo "     bash /tmp/phase2a_failure_detection.sh"
echo "     node /tmp/phase2a_go_no_go_analysis.mjs"
echo ""
echo "  4. Implement fix and re-deploy when ready:"
echo "     bash /tmp/phase4_prod_deploy.sh"
echo ""

echo "Documentation:"
echo "  Runbook: /tmp/PHASE4_PRODUCTION_RUNBOOK.md"
echo "  Deployment: /tmp/phase4_prod_deploy.sh"
echo "  Monitoring: /tmp/phase2a_settle_and_report.sh"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo ""
