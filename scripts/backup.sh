#!/bin/bash
# scripts/backup.sh
# Creates a complete, portable backup of all PB system data
# Usage: bash scripts/backup.sh [output-directory]

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="pb-backup-$TIMESTAMP"
OUTPUT_DIR="${1:-.}"
BACKUP_PATH="$OUTPUT_DIR/$BACKUP_NAME.tar.gz"

echo "🔒 Preferred Builders — Backup Starting..."
echo "   Timestamp: $TIMESTAMP"

# Verify we have data to back up
if [ ! -d "data" ] && [ ! -d "outputs" ]; then
  echo "⚠️  No data directory found. Run from project root."
  exit 1
fi

# Create compressed archive of all persistent data
tar -czf "$BACKUP_PATH" \
  --exclude="*.db-wal" \
  --exclude="*.db-shm" \
  data/ \
  outputs/ \
  uploads/ \
  knowledge-base/ \
  .env \
  2>/dev/null || true

SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)

echo ""
echo "✅ Backup complete!"
echo "   File: $BACKUP_PATH"
echo "   Size: $SIZE"
echo ""
echo "To restore on a new server:"
echo "  tar -xzf $BACKUP_NAME.tar.gz"
echo "  npm install && npm start"
echo ""
