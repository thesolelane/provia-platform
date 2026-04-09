#!/bin/bash
set -e

echo "=== Post-merge setup ==="

# Install root dependencies (--ignore-scripts skips husky prepare hook; --legacy-peer-deps handles eslint-plugin-react peer dep)
echo "Installing server dependencies..."
npm install --prefer-offline --legacy-peer-deps --ignore-scripts 2>/dev/null || npm install --legacy-peer-deps --ignore-scripts

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
