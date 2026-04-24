#!/bin/bash

echo "⏳ Waiting for KB population to complete..."
while pgrep -f "populate-kb-from-punters.js" > /dev/null; do
  runners=$(sqlite3 data/trackwise.db "SELECT COUNT(*) FROM race_runners;")
  echo "  Race runners: $runners"
  sleep 30
done

echo ""
echo "✅ KB population finished!"
sleep 2

echo ""
echo "🧪 Running picks pipeline test..."
node src/scripts/test-picks-pipeline.js
