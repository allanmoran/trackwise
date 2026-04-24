#!/bin/bash

DB="/Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db"

echo "📊 PHASE 2A: SETTLEMENT & ROI REPORT"
echo "====================================="
echo ""
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Run settlement
echo "🏁 Running settlement check..."
cd /Users/mora0145/Downloads/TrackWise/backend && node settle_bets_daily.mjs > /tmp/settlement_run_$(date +%s).log 2>&1
echo ""

# Daily ROI Report
echo "📈 DAILY ROI ANALYSIS:"
sqlite3 $DB << 'EOF'
WITH daily_stats AS (
  SELECT
    DATE(placed_at) as bet_date,
    COUNT(*) as total_bets,
    COUNT(CASE WHEN status = 'SETTLED' THEN 1 END) as settled,
    COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active,
    ROUND(SUM(stake), 2) as total_stake,
    ROUND(SUM(CASE WHEN status = 'SETTLED' THEN profit_loss ELSE 0 END), 2) as daily_pl,
    ROUND(AVG(confidence), 1) as avg_conf,
    ROUND(AVG(ev_percent), 1) as avg_ev
  FROM bets
  WHERE placed_at >= datetime('now', '-7 days')
  GROUP BY DATE(placed_at)
)
SELECT
  bet_date,
  total_bets || ' (' || settled || 'S/' || active || 'A)' as bets,
  '$' || total_stake as stake,
  '$' || daily_pl as pl,
  CASE
    WHEN total_stake > 0 THEN ROUND(daily_pl / total_stake * 100, 1) || '%'
    ELSE 'N/A'
  END as roi,
  avg_conf || '%' as conf,
  avg_ev || '%' as ev
FROM daily_stats
ORDER BY bet_date DESC;
EOF

echo ""
echo "🎯 CUMULATIVE (Last 7 Days):"
sqlite3 $DB << 'EOF'
SELECT
  'Total Bets' as metric,
  COUNT(*) as value
FROM bets
WHERE placed_at >= datetime('now', '-7 days')
UNION ALL
SELECT 'Settled', COUNT(*) FROM bets WHERE status = 'SETTLED' AND placed_at >= datetime('now', '-7 days')
UNION ALL
SELECT 'Active', COUNT(*) FROM bets WHERE status = 'ACTIVE' AND placed_at >= datetime('now', '-7 days')
UNION ALL
SELECT 'Cumulative Stake', ROUND(SUM(stake), 2) FROM bets WHERE placed_at >= datetime('now', '-7 days')
UNION ALL
SELECT 'Cumulative P/L', ROUND(SUM(COALESCE(profit_loss, 0)), 2) FROM bets WHERE placed_at >= datetime('now', '-7 days')
UNION ALL
SELECT 'Cumulative ROI %',
  CASE
    WHEN SUM(stake) > 0 THEN ROUND(SUM(COALESCE(profit_loss, 0)) / SUM(stake) * 100, 1)
    ELSE 0
  END
FROM bets WHERE placed_at >= datetime('now', '-7 days');
EOF

# Model Calibration Check
echo ""
echo "🎯 MODEL CALIBRATION CHECK:"
echo "───────────────────────────"
cd /Users/mora0145/Downloads/TrackWise/backend && node src/scripts/phase2a_calibration_check.mjs

echo ""
echo "✅ Report generated: $(date '+%Y-%m-%d %H:%M:%S')"
