#!/usr/bin/env bash
# Re-run the cold browser benchmark and publish it.
#   scripts/remeasure.sh            all engines, 3 runs
#   scripts/remeasure.sh plate,folio 1
# Writes results/browser.json (engines not re-measured keep their entry) and
# commits it; the landing page picks it up from GitHub within 5 minutes.
set -euo pipefail
cd "$(dirname "$0")/.."
ENGINES="${1:-all}"
RUNS="${2:-3}"
uv run --with playwright python -I scripts/measure.py "$ENGINES" "$RUNS" --results results/browser.json > "/tmp/measure-$(date +%Y%m%d-%H%M%S).json"
git add results/browser.json
if git diff --cached --quiet -- results/browser.json; then
  echo "results/browser.json is unchanged"
  exit 0
fi
git commit -m "Re-measure: $ENGINES, $RUNS runs ($(date +%F))" -- results/browser.json
git push
