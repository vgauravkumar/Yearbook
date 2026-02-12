#!/usr/bin/env bash

# Dev helper for the backend API.
# Usage (from repo root or backend folder):
#   bash backend/dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ">>> Backend: installing dependencies (npm install)..."
npm install

echo ">>> Backend: starting dev server (npm run dev)..."
npm run dev

