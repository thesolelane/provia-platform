#!/bin/bash
# scripts/backup.sh
# Creates a complete backup of all Preferred Builders data
# Run from the project root: bash scripts/backup.sh
# Optional: pass an output directory: bash scripts/backup.sh /path/to/backups

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="pb-backup-$TIMESTAMP"
OUTPUT_DIR="${1:-./backups}"
BACKUP_PATH="$OUTPUT_DIR/$BACKUP_NAME.tar.gz"

echo "======================================"
echo "  Preferred Builders — Data Backup"
echo "======================================"
echo "  Timestamp : $TIMESTAMP"
echo "  Output    : $BACKUP_PATH"
echo ""

# Make sure we're in the right place
if [ ! -f "package.json" ]; then
  echo "ERROR: Run this script from the project root directory."
  exit 1
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Build list of directories to include (only include what exists)
INCLUDE_DIRS=""
for DIR in data outputs uploads knowledge-base; do
  if [ -d "$DIR" ]; then
    INCLUDE_DIRS="$INCLUDE_DIRS $DIR/"
  fi
done

if [ -z "$INCLUDE_DIRS" ]; then
  echo "ERROR: No data directories found. Nothing to back up."
  exit 1
fi

echo "  Backing up:$INCLUDE_DIRS"
echo ""

# Create compressed archive — skip WAL/SHM lock files, skip node_modules
tar -czf "$BACKUP_PATH" \
  --exclude="*.db-wal" \
  --exclude="*.db-shm" \
  --exclude="node_modules" \
  --exclude="client/node_modules" \
  --exclude="client/build" \
  $INCLUDE_DIRS \
  2>/dev/null || true

if [ ! -f "$BACKUP_PATH" ]; then
  echo "ERROR: Backup file was not created."
  exit 1
fi

SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
echo "======================================"
echo "  BACKUP COMPLETE"
echo "  File : $BACKUP_NAME.tar.gz"
echo "  Size : $SIZE"
echo "======================================"
echo ""
echo "To restore on a new server:"
echo "  1. Copy $BACKUP_NAME.tar.gz to the new server"
echo "  2. Place it in the project root"
echo "  3. Run: tar -xzf $BACKUP_NAME.tar.gz"
echo "  4. Start the server: node server/index.js"
echo ""
echo "The backup contains:"
echo "  data/          — SQLite database (all jobs, settings, users)"
echo "  uploads/       — Job photos and uploaded estimate files"
echo "  outputs/       — Generated proposal and contract PDFs"
echo "  knowledge-base/— Pricing references and AI knowledge docs"
echo ""
