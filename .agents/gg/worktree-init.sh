#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env" && -f ".env.example" ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

if [[ ! -f "package.json" ]]; then
  echo "No package.json found; skipping dependency install."
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not installed."
  exit 1
fi

if [[ "${SKIP_NPM_INSTALL:-0}" == "1" ]]; then
  echo "SKIP_NPM_INSTALL=1 set; skipping npm install step."
  exit 0
fi

if [[ -f "package-lock.json" ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
