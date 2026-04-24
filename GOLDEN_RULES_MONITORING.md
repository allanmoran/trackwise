# Golden Rules Compliance & Monitoring System

TrackWise now validates against Betfair's **10 Golden Rules of Automation** with comprehensive monitoring, logging, and compliance reporting endpoints.

---

## Overview

The system tracks compliance across:
- **Rule 3:** Data Leakage detection
- **Rule 4:** Overfitting detection & calibration
- **Rule 6:** Staking plan validation
- **Rule 7:** Bankroll management safeguards
- **Rule 9:** Error handling & logging

Real-time monitoring provides actionable recommendations for improving system performance and reducing risk.

---

## Compliance Monitoring Endpoints

### `GET /api/compliance/report`
**Full compliance report against all Golden Rules**

Returns overall score, individual rule checks, and recommendations.

```bash
curl http://localhost:3001/api/compliance/report
```

Response:
```json
{
  "success": true,
  "report": {
    "timestamp": "2026-04-12T18:30:00Z",
    "overallScore": "85%",
    "rulesChecked": 5,
    "rulesPassed": 4,
    "rulesWarning": 1,
    "rulesError": 0,
    "details": [
      {
        "rule": 3,
        "status": "PASS",
        "message": "Data leakage check passed",
        "betsChecked": 100,
        "severity": "info"
      },
      // ... more rules
    ],
    "recommendations": [
      "✅ All checks passed. System is operating within compliance guidelines."
    ]
  }
}
```

---

### Individual Rule Endpoints

#### `GET /api/compliance/rule/3`
**Rule 3: Avoid Data Leakage**

Verifies that prediction features only use data available at bet placement time, not future results.

```bash
curl http://localhost:3001/api/compliance/rule/3
```

**Status indicators:**
- ✅ PASS: <5% of features reference future data
- ❌ FAIL: >5% of features show data leakage
- ⚠️ INSUFFICIENT_DATA: Need 10+ settled bets

---

#### `GET /api/compliance/rule/4`
**Rule 4: Do Not Overfit**

Compares actual vs predicted accuracy by confidence level to detect overfitting.

```bash
curl http://localhost:3001/api/compliance/rule/4
```

Returns:
- Confidence bucketing (0-10%, 10-20%, etc.)
- Actual strike rate vs expected
- Deviation alerts (>15% = potential overfitting)

```json
{
  "rule": 4,
  "status": "PASS",
  "bucketsAnalyzed": 8,
  "totalBets": 150,
  "confidence_calibration": {
    "70": { "wins": 35, "total": 50, "expected": 35 },
    "80": { "wins": 40, "total": 50, "expected": 40 }
  }
}
```

---

#### `GET /api/compliance/rule/6`
**Rule 6: Prioritize Staking Plans**

Validates Kelly Criterion implementation and stake sizing appropriateness.

```bash
curl http://localhost:3001/api/compliance/rule/6
```

Checks:
- No single bet exceeds 5% of bankroll
- Total exposure < 25% of bank
- Average stake < 2% (quarter-Kelly)

```json
{
  "rule": 6,
  "status": "WARNING",
  "bankroll": 5000,
  "activeBets": 12,
  "avgStakePercent": "1.8",
  "exposurePercent": "18.5",
  "issues": []
}
```

---

#### `GET /api/compliance/rule/7`
**Rule 7: Manage Your Bankroll**

Monitors reserve levels, variance cushion, and ROI sustainability.

```bash
curl http://localhost:3001/api/compliance/rule/7
```

Checks:
- Reserves ≥ 50% of original bankroll
- ROI < 50% (flags unsustainable returns)
- Variance cushion ≥ 20%

```json
{
  "rule": 7,
  "status": "PASS",
  "currentBank": 5200,
  "totalStaked": 900,
  "roi": "8.3%",
  "reservePercent": "85.2",
  "varianceCushionPercent": "82.0"
}
```

---

#### `GET /api/compliance/rule/9`
**Rule 9: Implement Error Handling**

Checks logging infrastructure and scheduler health.

```bash
curl http://localhost:3001/api/compliance/rule/9
```

Returns:
- Recent error count
- Scheduler job status
- Last execution times

---

### `GET /api/compliance/overview`
**Quick dashboard view**

Quick status check for monitoring dashboards.

```bash
curl http://localhost:3001/api/compliance/overview
```

```json
{
  "success": true,
  "overview": {
    "score": "85%",
    "passed": 4,
    "warnings": 1,
    "errors": 0,
    "recommendations": [
      "Reduce average stake size from 2.1% to under 2%",
      "Monitor confidence bucket 60-70 for potential overfitting"
    ],
    "generatedAt": "2026-04-12T18:30:00Z"
  }
}
```

---

## Logging & Monitoring Endpoints

### System Health

#### `GET /api/logging/health`
**System health summary**

```bash
curl http://localhost:3001/api/logging/health
```

```json
{
  "success": true,
  "health": {
    "status": "HEALTHY",
    "errors24h": 0,
    "failedJobs24h": 0,
    "apiErrors24h": 1,
    "uptimePercent": "99.8",
    "timestamp": "2026-04-12T18:30:00Z"
  }
}
```

---

### Error Logs

#### `GET /api/logging/errors`
**Recent error logs**

Query parameters:
- `hours` (default: 24) - look back period
- `limit` (default: 50) - max results

```bash
curl "http://localhost:3001/api/logging/errors?hours=24&limit=10"
```

Returns:
- Error type
- Message
- Context (JSON)
- Severity (CRITICAL, HIGH, MEDIUM, LOW)
- Timestamp

---

### Scheduler Logs

#### `GET /api/logging/scheduler`
**Job execution history**

Query parameters:
- `job` (optional) - filter by job name
- `limit` (default: 50) - max results

```bash
curl "http://localhost:3001/api/logging/scheduler?job=results-scraper"
```

Returns:
- Job name
- Status (SUCCESS, FAILURE)
- Duration (ms)
- Error message (if failed)
- Execution timestamp

---

### API Performance

#### `GET /api/logging/api-stats`
**API request statistics**

Query parameters:
- `hours` (default: 24)

```bash
curl "http://localhost:3001/api/logging/api-stats?hours=24"
```

Returns per-endpoint:
- Request count
- Average duration (ms)
- Max duration
- Error count

```json
{
  "endpoints": 15,
  "stats": [
    {
      "endpoint": "/api/features/analyze-race",
      "method": "POST",
      "requests": 45,
      "avg_duration": 312,
      "max_duration": 1250,
      "errors": 0
    }
  ]
}
```

---

### Logging Summary

#### `GET /api/logging/summary`
**Quick overview of all logging data**

```bash
curl http://localhost:3001/api/logging/summary
```

Returns aggregated view of:
- System health
- Recent errors (top 3)
- Latest scheduler job
- Slowest API endpoint

---

### Export Logs

#### `GET /api/logging/export`
**Export logs for external analysis**

Query parameters:
- `startDate` (ISO string, default: 24h ago)
- `endDate` (ISO string, default: now)
- `format` (json or csv, default: json)

```bash
curl "http://localhost:3001/api/logging/export?startDate=2026-04-11T00:00:00Z&format=csv" > logs.csv
```

---

## Integration Examples

### Daily Compliance Check

Run at start of day to ensure system is operating within guidelines:

```bash
#!/bin/bash
COMPLIANCE=$(curl -s http://localhost:3001/api/compliance/report)
SCORE=$(echo $COMPLIANCE | jq -r '.report.overallScore')

if [ "$SCORE" != "100%" ]; then
  echo "⚠️ Compliance Score: $SCORE"
  echo "Review: /api/compliance/report"
fi
```

### Monitor Before Placing Bets

Before automated betting, verify staking plan and bankroll:

```bash
curl http://localhost:3001/api/compliance/rule/6  # Staking plan
curl http://localhost:3001/api/compliance/rule/7  # Bankroll
```

### Detect Overfitting After 50 Bets

After 50 settled bets, check model calibration:

```bash
curl http://localhost:3001/api/compliance/rule/4
```

If calibration shows >15% deviation in any bucket, adjust confidence thresholds.

### Weekly Health Report

Monitor overall system health and performance:

```bash
curl http://localhost:3001/api/logging/summary
```

---

## Automated Alerting

The system provides actionable recommendations in each compliance check. Example responses:

**CRITICAL - Data Leakage Detected:**
```
"Features are using future data. Review feature engineering to ensure only past data is used."
```

**WARNING - Overfitting Detected:**
```
"Model accuracy on live data differs from backtest. Reduce confidence thresholds or add more conservative filters."
```

**WARNING - Staking Plan Issue:**
```
"Total staked bets exceed 25% limit. Reduce bet frequency or increase bankroll."
```

**WARNING - Bankroll Low:**
```
"Bankroll below 50% of original. Stop betting and rebuild reserves before continuing."
```

---

## Logging Tables

The following tables are automatically created for comprehensive audit trails:

| Table | Purpose |
|-------|---------|
| `error_logs` | All system errors with severity levels |
| `scheduler_logs` | Job execution history |
| `scheduler_jobs` | Current scheduler job status |
| `operation_logs` | Bet operations, KB updates, etc. |
| `api_logs` | API request/response tracking |
| `prediction_logs` | Model predictions with outcomes |

---

## Best Practices

### Pre-Betting Checklist

Before each day's bets:

1. ✅ Check `/api/compliance/report` - Score should be ≥80%
2. ✅ Check `/api/compliance/rule/6` - Staking plan should be PASS
3. ✅ Check `/api/compliance/rule/7` - Bankroll should be PASS
4. ✅ Check `/api/logging/health` - Uptime should be ≥99%

### Weekly Review

Once per week:

1. Review `/api/compliance/rule/4` - Check model calibration
2. Review `/api/logging/api-stats` - Identify slow endpoints
3. Review error logs - Address any recurring issues
4. Check recommendations - Implement suggested improvements

### Monthly Analysis

Once per month:

1. Export logs via `/api/logging/export`
2. Analyze confidence calibration trends
3. Review staking plan effectiveness
4. Validate feature engineering against live performance

---

## Next Steps

1. **Integrate alerts** - Set up webhooks for CRITICAL/HIGH severity issues
2. **Create dashboard** - Visualize compliance score, health metrics, error trends
3. **Auto-escalation** - Stop betting if compliance score drops below 70%
4. **Historical analysis** - Track compliance improvements over time

The monitoring system provides complete visibility into TrackWise's adherence to professional automation standards.
