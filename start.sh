#!/bin/bash
# TrackWise — dev launcher
# Usage:
#   ./start.sh          → starts Vite dev server only
#   ./start.sh engine   → starts Vite + background engine (builds KB data)
#   ./start.sh build    → production build only

set -e
cd "$(dirname "$0")"

MODE="${1:-dev}"

open_browser() {
  sleep 2
  if command -v open &>/dev/null; then
    open "http://localhost:5173"          # macOS
  elif command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:5173"      # Linux
  fi
}

case "$MODE" in
  engine)
    echo ""
    echo "  🏇  TRACKWISE — dev + proxy + engine"
    echo "  ──────────────────────────────────────"
    echo "  App    → http://localhost:5173"
    echo "  Proxy  → http://localhost:3001"
    echo "  Engine → building KB in background"
    echo "  Stop   → Ctrl+C"
    echo ""
    open_browser &
    npm run proxy  &  PROXY_PID=$!
    npm run engine &  ENGINE_PID=$!
    trap "kill $PROXY_PID $ENGINE_PID 2>/dev/null; exit 0" INT TERM
    npm run dev
    kill $PROXY_PID $ENGINE_PID 2>/dev/null
    ;;
  build)
    echo ""
    echo "  🏗  TRACKWISE — production build"
    echo ""
    npm run build
    echo ""
    echo "  ✓ Built → dist/"
    echo "  Run: npm run preview"
    echo ""
    ;;
  dev|*)
    echo ""
    echo "  🏇  TRACKWISE — dev + proxy"
    echo "  ──────────────────────────────────────"
    echo "  App   → http://localhost:5173"
    echo "  Proxy → http://localhost:3001"
    echo "  Stop  → Ctrl+C"
    echo ""
    echo "  Tip: ./start.sh engine  to also run the KB builder"
    echo ""
    open_browser &
    npm run proxy &
    PROXY_PID=$!
    trap "kill $PROXY_PID 2>/dev/null; exit 0" INT TERM
    npm run dev
    kill $PROXY_PID 2>/dev/null
    ;;
esac
