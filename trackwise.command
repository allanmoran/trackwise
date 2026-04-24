#!/bin/bash

# TrackWise Local Startup Script
# Double-click this file to start TrackWise

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    TRACKWISE LOCAL                         ║"
echo "║              Starting development server...               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Navigate to project directory
cd "$SCRIPT_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (first time only)..."
    npm install
    echo ""
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚙️  Setting up configuration..."
    cp .env.local.example .env.local
    echo ""
fi

echo "🚀 Starting TrackWise..."
echo ""
echo "📍 Frontend:  http://localhost:5173"
echo "📍 Backend:   http://localhost:3001"
echo ""
echo "⏳ Opening browser in 3 seconds..."
echo ""

# Start the dev server
npm run dev &
DEV_PID=$!

# Wait for server to start, then open browser
sleep 3
open "http://localhost:5173" 2>/dev/null || echo "⚠️  Please open http://localhost:5173 in your browser"

echo ""
echo "✅ TrackWise is running!"
echo ""
echo "📝 To stop: Press Ctrl+C in this window"
echo ""

# Wait for the dev process
wait $DEV_PID
