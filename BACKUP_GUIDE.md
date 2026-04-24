# 🛡️ Comprehensive Knowledge Base Backup Guide

## Current Backup Status

✅ **Local Backup Complete**
- Date: April 16, 2026
- Location: `/Users/mora0145/Downloads/TrackWise/backups/2026-04-16/`
- Size: 63MB SQLite database + JSON exports
- Files Protected: 5

## Backup Contents

### Database
- **trackwise-1776310315462.db** (63.15MB)
  - Complete SQLite database with all KB data
  - 72,355 horses with full statistics
  - 91,238 races with 1.4M+ results
  - 72,493 aggregated statistics

### JSON Exports
- **kb-intelligence.json** (31KB) - Complete KB intelligence
- **results.json** (36KB) - Settlement results + history
- **kb.json** (4.7KB) - Legacy KB format

### Manifest
- **BACKUP_MANIFEST.json** - Backup metadata and inventory

## Cloud Backup Setup (Neon)

### Option 1: Using Environment Variables

1. **Get your Neon connection string:**
   ```bash
   # From Neon Dashboard: https://console.neon.tech
   # Copy the connection string (looks like):
   # postgresql://user:password@ep-xxx.region.neon.tech/database
   ```

2. **Set environment variable:**
   ```bash
   # Add to ~/.zshrc or ~/.bash_profile
   export DATABASE_URL="postgresql://user:password@ep-xxx.region.neon.tech/database"
   export NEON_DATABASE_URL="postgresql://user:password@ep-xxx.region.neon.tech/database"
   
   # Reload shell
   source ~/.zshrc
   ```

3. **Test connection:**
   ```bash
   cd /Users/mora0145/Downloads/TrackWise
   npx tsx scripts/backup-kb-comprehensive.ts
   ```

### Option 2: Direct Neon Backup (psql required)

```bash
# Install PostgreSQL tools if needed
brew install postgresql

# Backup to Neon
pg_dump -h ep-xxx.region.neon.tech -U postgres -d your_database > neon-backup.sql

# Restore from backup
psql -h ep-xxx.region.neon.tech -U postgres -d your_database < neon-backup.sql
```

## Automated Daily Backups

### Setup Cron Job

1. **Edit crontab:**
   ```bash
   crontab -e
   ```

2. **Add backup job (2 AM daily):**
   ```bash
   # Backup KB daily at 2:00 AM
   0 2 * * * cd /Users/mora0145/Downloads/TrackWise && npx tsx scripts/backup-kb-comprehensive.ts >> /Users/mora0145/Downloads/TrackWise/logs/backup.log 2>&1
   ```

3. **Verify cron job:**
   ```bash
   crontab -l
   ```

### Monitor Backups

```bash
# View backup logs
tail -f /Users/mora0145/Downloads/TrackWise/logs/backup.log

# List all backups
ls -lh /Users/mora0145/Downloads/TrackWise/backups/

# Check backup sizes
du -sh /Users/mora0145/Downloads/TrackWise/backups/*
```

## Restore Procedures

### Restore from Local Backup

```bash
# 1. Stop TrackWise application
# 2. Restore database
cp /Users/mora0145/Downloads/TrackWise/backups/2026-04-16/trackwise-1776310315462.db \
   /Users/mora0145/Downloads/TrackWise/backend/data/trackwise.db

# 3. Restore JSON exports (optional)
cp /Users/mora0145/Downloads/TrackWise/backups/2026-04-16/kb-intelligence.json \
   /Users/mora0145/Downloads/TrackWise/public/data/

# 4. Restart application
```

### Restore from Neon Cloud

```bash
# 1. Create new local database from Neon backup
psql -h ep-xxx.region.neon.tech -U postgres -d your_database -c "COPY ..."

# 2. Export to SQLite (if needed)
# Or work directly with PostgreSQL
```

## Backup Strategy

### Frequency
- **Automated**: Daily at 2:00 AM
- **Manual**: Before major system changes
- **Retention**: 30 days (rotate old backups)

### Protection Levels

| Level | Local | Neon | Frequency |
|-------|-------|------|-----------|
| Daily | ✅ | ⚠️ | Automatic |
| Weekly | ✅ | ✅ | Manual |
| Monthly | ✅ | ✅ | Archive |

### What Gets Backed Up

✅ SQLite database (trackwise.db)
✅ Horse statistics (72,355 records)
✅ Race results (1.4M+ records)
✅ KB statistics (72,493 aggregations)
✅ JSON exports for frontend
✅ Configuration manifests

❌ Node modules (can be reinstalled)
❌ Build artifacts
❌ Temporary files

## Backup Verification

```bash
# Verify backup integrity
cd /Users/mora0145/Downloads/TrackWise/backups/2026-04-16

# Check SQLite database
sqlite3 trackwise-1776310315462.db "SELECT COUNT(*) FROM horses;" 
# Should return: 72355

# Verify JSON files
wc -l kb-intelligence.json results.json

# Validate manifest
cat BACKUP_MANIFEST.json | jq .
```

## Storage Requirements

| Backup Type | Size | Growth |
|------------|------|--------|
| Single Full | 63MB | N/A |
| 30 Days | 1.9GB | ~63MB/day |
| 365 Days | 23GB | ~63MB/day |

**Recommendation**: Archive backups older than 90 days to external storage.

## Emergency Recovery

If the main database is corrupted:

1. **Stop the application**
2. **Restore from latest backup:**
   ```bash
   cp backups/2026-04-16/trackwise-1776310315462.db \
      backend/data/trackwise.db
   ```
3. **Restart application**
4. **Verify data integrity:**
   ```bash
   npx tsx scripts/check-kb-integrity.ts
   ```

## Disaster Recovery Checklist

- [ ] Test restore from local backup monthly
- [ ] Test restore from Neon weekly
- [ ] Archive old backups to external drive
- [ ] Document recovery procedures
- [ ] Maintain offline copy of critical data
- [ ] Verify backup logs weekly

## Support & Troubleshooting

### Neon Connection Issues
```bash
# Test PostgreSQL connection
psql -h ep-xxx.region.neon.tech -U postgres -d database -c "SELECT 1"

# Check connection string format
echo $DATABASE_URL
```

### Backup Size Growing Too Fast
```bash
# Archive old backups
mkdir -p /Volumes/backup-archive
mv /Users/mora0145/Downloads/TrackWise/backups/2026-04-* /Volumes/backup-archive/
```

### Restore Issues
1. Check file permissions: `ls -la backups/2026-04-16/`
2. Verify database integrity: `sqlite3 trackwise.db ".tables"`
3. Check available disk space: `df -h`

---

**Last Updated**: April 16, 2026  
**Next Backup**: April 17, 2026 (02:00 AM)  
**Status**: ✅ PROTECTED
