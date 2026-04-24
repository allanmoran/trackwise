# TrackWise Quick Start - Complete Recovery Guide

## TL;DR - Three Options

### 🏆 Option 1: Recover from Cloud (TRY THIS FIRST!)
Your 71 bets may still exist in Neon Postgres. Recovery takes 2 minutes:

```bash
cd backend
npm install
npm run recover    # ← Try this first!
npm start

# Open new terminal
npm run dev        # From project root, not backend
# Then http://localhost:5173
```

**If recovery succeeds:** You'll see your 71 bets on the dashboard immediately! ✅

---

### 🌾 Option 2: Seed from Real Historical Data
If cloud recovery fails or isn't available, seed from 150,000+ real Australian race records:

```bash
cd backend
npm install
npm run load       # Downloads 13 months ANZ data + jockey/trainer names
npm start

# Open new terminal
npm run dev
```

**What you get:** Complete knowledge base with real form data, but the 71 bets are lost.

---

### 🚀 Option 3: Automated Setup
Run everything at once:

```bash
cd /Users/mora0145/Downloads/TrackWise
bash setup.sh      # Installs everything, starts both servers, opens browser
```

**What happens:** Installs deps → runs recovery/load → starts backend + frontend → opens browser

---

## Detailed Steps (Pick ONE approach above)

### STEP 1: Install Backend

```bash
cd /Users/mora0145/Downloads/TrackWise/backend
npm install
```

This installs:
- `better-sqlite3` — Local database
- `postgres` — Cloud database connection
- `express` — Web server
- `axios` + `papaparse` — Data download/parsing

---

### STEP 2A: Try Cloud Recovery ⭐ (Recommended First)

```bash
npm run recover
```

This connects to your Neon Postgres database and imports everything.

**You should see:**
```
✅ Found 71 bets in cloud database!
✅ Found 400 horses
✅ Found 20 jockeys
✅ Importing to local SQLite...
✅ Cloud data recovery complete!
```

**If this succeeds:** Jump to "STEP 4: Start Backend"
**If it fails:** Try "STEP 2B: Seed from Historical Data" below

---

### STEP 2B: Seed from Historical Data (Fallback)

If cloud recovery fails or you prefer to start fresh:

```bash
npm run load
```

This downloads 13 months of ANZ Thoroughbred historical data and seeds the knowledge base.

**You should see:**
```
📥 Downloading 13 monthly CSVs...
✓ 2025-03 → 25,000 records
✓ 2025-04 → 24,500 records
...
📊 Seeding KB from 150,000 valid records...
✅ Complete data recovery successful!
```

---

### STEP 3: Install Frontend

```bash
cd /Users/mora0145/Downloads/TrackWise
npm install
```

---

### STEP 4: Start Backend

```bash
cd backend
npm start
```

You should see:
```
╔════════════════════════════════════════════════════╗
║          TrackWise Backend Server                 ║
║              Listening on port 3001               ║
║       http://localhost:3001                       ║
║       Database: backend/data/trackwise.db        ║
╚════════════════════════════════════════════════════╝
```

---

### STEP 5: Start Frontend (New Terminal)

```bash
cd /Users/mora0145/Downloads/TrackWise
npm run dev
```

You should see:
```
  ➜  Local:   http://localhost:5173/
```

**Open http://localhost:5173 in your browser** ✨

---

## Verify It's Working

### Backend Health Check

```bash
curl http://localhost:3001/api/health
# Expected: { "status": "ok", "timestamp": "..." }
```

### Check Bets Were Recovered

```bash
curl http://localhost:3001/api/dashboard
# If you did cloud recovery: should show non-zero ROI/P&L
# If you did historical seed: will show bank: 3450.75, roi: 0
```

### Check Today's Races

```bash
curl http://localhost:3001/api/races/today
# Should return: array of 45 races
```

---

## What's Different From Before

| Aspect | Before | Now |
|--------|--------|-----|
| Database | Deleted | SQLite locally (won't delete again) |
| Backups | None | Can export anytime |
| Form data | Fake jockeys | Real names (Beau Mertens, etc.) |
| Historical records | 7,134 | 150,000+ (if you seed) |
| Knowledge base | Basic | Calibrated from real data |

---

## Important Notes

### ✅ What Was Recovered
- ✅ Code (frontend + backend)
- ✅ Strategy logic (pick generation, Kelly sizing, CLV)
- ✅ Historical data (7,134 bets + 150,000+ ANZ records)
- ✅ Jockey/trainer data (real names from template)
- ✅ Database schema (all tables)

### ❌ What Was Lost
- ❌ 71 placed bets (unless cloud recovery works)
- ❌ Local intermediate files (but that's OK)

---

## Troubleshooting

### Backend won't start
```bash
# Port 3001 already in use?
lsof -i :3001
kill -9 <PID>
npm start
```

### Frontend won't compile
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### "Module not found: postgres"
```bash
cd backend
npm install
```

### "Database locked"
```bash
# Kill all node processes
killall node
# Restart
npm start
```

### Blank page at localhost:5173
1. Check F12 console for errors
2. Verify backend is running: `curl http://localhost:3001/api/health`
3. Check .env.local has: `VITE_API_URL=http://localhost:3001`

---

## File Locations

| File | Purpose |
|------|---------|
| `/backend/data/trackwise.db` | Local SQLite database (created automatically) |
| `/backend/src/server.js` | Express backend server |
| `/backend/src/scripts/recover-from-cloud.js` | Cloud recovery script |
| `/backend/src/scripts/load-real-data.js` | Historical data seeding |
| `/.env.local` | Frontend API URL config |
| `/CLOUD_RECOVERY.md` | Detailed cloud recovery docs |
| `/RECOVERY_PLAN.md` | Complete recovery report |
| `/STARTUP.md` | Detailed startup guide |

---

## Next Steps After Startup

1. **Check dashboard** → Verify P&L shows recovered data (if you did cloud recovery)
2. **Paste Sportsbet URLs** → In Daily Picks section
3. **Generate picks** → Click "Generate & Place Bets"
4. **Monitor active bets** → Switch to "Active Bets" tab
5. **Track P&L** → As races finish, results populate

---

## Success Indicators

✅ Backend at http://localhost:3001 responds to `/api/health`
✅ Frontend loads at http://localhost:5173 without errors
✅ Dashboard shows bank balance (3450.75 + recovery data)
✅ Races tab shows today's races
✅ Form Hub displays jockey/trainer data

---

## One More Thing

Your Neon Postgres database connection string is safe here, but in production:
- Move it to `.env.local` (already done)
- Never commit to git
- Rotate credentials periodically
- Use connection pooling (postgres client does this)

---

**Ready to go?** Pick an option above and follow the steps. If anything fails, check the Troubleshooting section.

Good luck! 🐴
