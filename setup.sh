#!/bin/bash

# TrackWise Complete Setup & Recovery Script
# This automates the entire data recovery and startup process

set -e

PROJECT_DIR="/Users/mora0145/Downloads/TrackWise"
BACKEND_DIR="$PROJECT_DIR/backend"
DATA_DIR="$BACKEND_DIR/data"

echo "
╔════════════════════════════════════════════════════╗
║     TrackWise Complete Recovery & Setup           ║
║                                                    ║
║  This will:                                        ║
║  1. Install dependencies                           ║
║  2. Download 13 months ANZ historical data        ║
║  3. Seed KB with real statistics                  ║
║  4. Load real jockey/trainer data                 ║
║  5. Start backend server (port 3001)              ║
║  6. Start frontend dev server (port 5173)         ║
║  7. Open browser                                   ║
╚════════════════════════════════════════════════════╝
"

# Step 1: Backend dependencies
echo "📦 Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install

# Step 2: Create data directory
echo "📁 Creating data directory..."
mkdir -p "$DATA_DIR"

# Step 3: Load real data (ANZ historical + jockey/trainer)
echo "
📥 Loading real data (this will take 3-5 minutes)...
   Downloading 13 months of ANZ Thoroughbred data...
   Seeding knowledge base...
   Loading jockey/trainer names...
"
npm run load

# Step 4: Frontend dependencies
echo "
📦 Installing frontend dependencies..."
cd "$PROJECT_DIR"
npm install

# Step 5: Start servers in background
echo "
🚀 Starting servers...
"

# Start backend
echo "   Starting backend on port 3001..."
cd "$BACKEND_DIR"
npm start &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend to be ready
sleep 2
echo "   Testing backend health..."
for i in {1..10}; do
  if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "   ✓ Backend is ready"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "   ⚠ Backend not responding - it may start in a moment"
  fi
  sleep 1
done

# Start frontend
echo "   Starting frontend on port 5173..."
cd "$PROJECT_DIR"
npm run dev &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

# Wait for frontend to be ready
echo "   Waiting for frontend to compile..."
sleep 5

echo "
✅ Setup Complete!

╔════════════════════════════════════════════════════╗
║                                                    ║
║  Backend:   http://localhost:3001                ║
║  Frontend:  http://localhost:5173                ║
║                                                    ║
║  Backend PID:  $BACKEND_PID                              ║
║  Frontend PID: $FRONTEND_PID                              ║
║                                                    ║
║  To stop:                                          ║
║    kill $BACKEND_PID                              ║
║    kill $FRONTEND_PID                             ║
║                                                    ║
╚════════════════════════════════════════════════════╝
"

# Open browser
echo "🌐 Opening browser..."
sleep 2
open http://localhost:5173

echo "
📝 Logs:
   Backend runs in foreground below
   Frontend logs available in separate terminal (npm run dev)

Press Ctrl+C to stop
"

# Wait for background processes
wait
