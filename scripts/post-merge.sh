#!/bin/bash
set -e

echo "=== Post-merge setup ==="

# Install root dependencies (--legacy-peer-deps for eslint-plugin-react peer dep gap with eslint v10)
echo "Installing server dependencies..."
npm install --prefer-offline --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps

# Install and build client
echo "Installing client dependencies..."
cd client && npm install --prefer-offline 2>/dev/null || npm install

echo "Building React frontend..."
npm run build

cd ..

# Ensure Puppeteer Chrome is available for PDF generation
echo "Installing Puppeteer Chrome..."
npx puppeteer browsers install chrome --quiet 2>/dev/null || true

echo "=== Post-merge setup complete ==="
