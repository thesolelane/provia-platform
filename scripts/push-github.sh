#!/bin/bash
# scripts/push-github.sh
# Backs up data, then pushes the latest codebase to GitHub
# Run from the project root: bash scripts/push-github.sh
# Optional commit message: bash scripts/push-github.sh "my update notes"

set -e

COMMIT_MSG="${1:-Sync: $(date '+%Y-%m-%d %H:%M')}"

echo "======================================"
echo "  Preferred Builders — GitHub Push"
echo "======================================"
echo ""

# Make sure we're in the right place
if [ ! -f "package.json" ]; then
  echo "ERROR: Run this script from the project root directory."
  exit 1
fi

# ── Step 1: Back up data first ──────────────────────────────────────────────
echo "Step 1/3 — Backing up data before push..."
bash scripts/backup.sh ./backups
echo ""

# ── Step 2: Stage all code changes ─────────────────────────────────────────
echo "Step 2/3 — Staging code changes..."
git add -A

if git diff --cached --quiet; then
  echo "  Nothing new to commit — working tree is clean."
else
  git commit -m "$COMMIT_MSG"
  echo "  Committed: $COMMIT_MSG"
fi
echo ""

# ── Step 3: Push to GitHub ──────────────────────────────────────────────────
echo "Step 3/3 — Pushing to GitHub..."

# Find the GitHub remote (origin preferred, otherwise the subrepl one)
GITHUB_REMOTE=""
if git remote get-url origin &>/dev/null; then
  GITHUB_REMOTE="origin"
else
  # Fall back to any remote pointing to github.com
  GITHUB_REMOTE=$(git remote -v | grep "github.com" | head -1 | awk '{print $1}')
fi

if [ -z "$GITHUB_REMOTE" ]; then
  echo ""
  echo "ERROR: No GitHub remote found."
  echo "  Add one with: git remote add origin https://github.com/thesolelane/preferredbuildersapp.git"
  exit 1
fi

git push "$GITHUB_REMOTE" main

echo ""
echo "======================================"
echo "  DONE"
echo "  Code pushed to GitHub"
echo "  Data backed up to ./backups/"
echo "======================================"
echo ""
echo "To deploy to your Windows server:"
echo "  1. On the Windows server, open a terminal in the project folder"
echo "  2. Run: git pull"
echo "  3. Run: npm install (if package.json changed)"
echo "  4. Run: cd client && npm run build && cd .."
echo "  5. Restart the app: pm2 restart pb-system"
echo ""
