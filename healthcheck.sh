#!/bin/bash
echo "======================================"
echo "  PREFERRED BUILDERS — HEALTH CHECK"
echo "  $(date)"
echo "======================================"

echo ""
echo "── APP (PM2) ──────────────────────────"
pm2 status 2>/dev/null || echo "PM2 not running"

echo ""
echo "── CADDY SERVICE ──────────────────────"
sc.exe query caddy 2>/dev/null | grep -E "STATE|RUNNING" || echo "Caddy service not found"

echo ""
echo "── DISK SPACE ─────────────────────────"
powershell -NoProfile -Command "
  Get-PSDrive -PSProvider FileSystem | Where-Object { \$_.Used -gt 0 } |
  ForEach-Object {
    \$used = [math]::Round(\$_.Used / 1GB, 2)
    \$free = [math]::Round(\$_.Free / 1GB, 2)
    \$total = [math]::Round((\$_.Used + \$_.Free) / 1GB, 2)
    \$pct = [math]::Round((\$_.Used / (\$_.Used + \$_.Free)) * 100, 1)
    Write-Host (\$_.Name + ':  used=' + \$used + 'GB  free=' + \$free + 'GB  total=' + \$total + 'GB  (' + \$pct + '% full)')
  }
"

echo ""
echo "── DATABASE SIZE ──────────────────────"
du -sh ~/Desktop/preferred-builders-ai/data/pb_system.db 2>/dev/null || echo "DB file not found"

echo ""
echo "── UPLOADS FOLDER ─────────────────────"
du -sh ~/Desktop/preferred-builders-ai/uploads/ 2>/dev/null || echo "Uploads folder not found"

echo ""
echo "── BACKUPS ────────────────────────────"
ls -lh ~/Desktop/PBBKUPS/*.db 2>/dev/null | tail -5 || echo "No backups found"

echo ""
echo "── APP RESPONSE ───────────────────────"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/health 2>/dev/null)
if [ "$STATUS" = "200" ]; then
  echo "✅ App responding on port 5000 (HTTP $STATUS)"
else
  echo "❌ App not responding (HTTP $STATUS)"
fi

echo ""
echo "======================================"
