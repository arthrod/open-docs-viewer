#!/usr/bin/env bash
# Re-run the cold browser benchmark and publish it.
#   scripts/remeasure.sh            all engines, 3 runs
#   scripts/remeasure.sh plate,folio 1
# Writes results/browser.json (engines not re-measured keep their entry), every run under
# results/raw/ and the README's tables, and commits them; the landing page picks it up from GitHub within 5 minutes.
set -euo pipefail
cd "$(dirname "$0")/.."
ENGINES="${1:-all}"
RUNS="${2:-3}"
uv run --with playwright python -I scripts/measure.py "$ENGINES" "$RUNS" --results results/browser.json --raw "results/raw/$(date +%F)-browser-showcase.json" > /dev/null
# The README's tables are written from the files: left stale, the test that compares them fails.
python3 scripts/readme_tables.py
git add results/browser.json results/raw README.md
git commit -m "Re-measure: $ENGINES, $RUNS runs ($(date +%F))" -- results/browser.json results/raw README.md
git push
