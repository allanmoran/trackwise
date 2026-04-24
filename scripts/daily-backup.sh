#!/bin/bash
# Daily KB backup scheduler
# Add to crontab: 0 6 * * * /path/to/daily-backup.sh

BACKUP_DIR="/tmp/trackwise-backups"
TIMESTAMP=$(date +"%Y-%m-%d")
BACKUP_FILE="$BACKUP_DIR/kb-backup-$TIMESTAMP-$(date +%s).json"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Trigger backup via API
curl -s -X POST http://localhost:3001/api/backup/db \
  -H 'Content-Type: application/json' > /dev/null

# Clean old backups (keep last 30 days)
find "$BACKUP_DIR" -name "kb-backup-*" -mtime +30 -delete

echo "[$(date)] Daily KB backup completed - Kept last 30 days" >> "$BACKUP_DIR/backup.log"
