#!/bin/sh
# Port Alder 1.1.0 (Plume XPU Console) on Linux or macOS: serves the pages and opens Port Alder, in VEC1 Design Photon's
# window when Photon is found (it runs on Python 3.10 or newer), else in your default browser.
#   ./start.sh                  Port Alder
#   ./start.sh index.html       the console (also simmy.html, show.html, verify.html, check3d.html)
#   ./start.sh city.html node Node.js (serve.mjs) instead of the Python host
# SPDX-License-Identifier: GPL-3.0-only
cd "$(dirname "$0")" || exit 1
PAGE="${1:-city.html}"
MODE="${2:-}"
URL="http://127.0.0.1:8788/$PAGE"
open_url() {
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then open "$1"
  else echo "Open $1 in your browser."; fi
}
run_node() {
  node serve.mjs &
  SERVER=$!
  trap 'kill "$SERVER" 2>/dev/null' EXIT INT TERM
  sleep 1
  open_url "$URL"
  echo "Serving $URL (Ctrl+C stops)."
  wait "$SERVER"
}
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then PY="$c"; break; fi
done
if [ "$MODE" = "node" ]; then
  if command -v node >/dev/null 2>&1; then run_node; exit $?; fi
  echo "Node.js was not found."; exit 1
fi
if [ -n "$PY" ]; then
  "$PY" -B host/plume_photon.py --page "$PAGE"
  rc=$?
  if [ "$rc" -eq 3 ]; then exec "$PY" -B host/plume_photon.py --page "$PAGE" --no-photon; fi
  exit "$rc"
elif command -v node >/dev/null 2>&1; then
  echo "Python 3.10 or newer was not found: serving with Node.js instead (no Design Photon)."
  run_node
else
  echo "Plume needs Python 3.10 or newer (for Design Photon), or Node.js, and neither was found."
  exit 1
fi
