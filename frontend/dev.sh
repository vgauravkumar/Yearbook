#!/usr/bin/env bash

# Dev helper for the frontend (Vite + React).
# Usage (from repo root or frontend folder):
#   bash frontend/dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ">>> Frontend: installing dependencies (npm install)..."
npm install

echo ">>> Frontend: starting Vite dev server (npm run dev)..."
npm run dev

