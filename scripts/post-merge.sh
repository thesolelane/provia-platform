#!/bin/bash
set -e

echo "=== Post-merge setup ==="

# Install root dependencies
echo "Installing server dependencies..."
npm install --prefer-offline 2>/dev/null || npm install

# Install and build client
echo "Installing client dependencies..."
cd client && npm install --prefer-offline 2>/dev/null || npm install

echo "Building React frontend..."
npm run build

cd ..

echo "=== Post-merge setup complete ==="
