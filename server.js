/**
 * Mock Backend Server for TrackWise
 * Serves on localhost:3001
 * Provides mock data for frontend development
 */

import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock data
const mockData = {
  dashboard: {
    bank: 3450.75,
    roi: 18.5,
    cumulativePnL: 3250.75,
    status: 'HITTING TARGET 🎯',
    totalBets: 47,
    edgeFoundPercent: 65.96,
    betsWithEdge: 31,
    avgEvPercent: 12.45,
    totalStaked: 2500,
    targetRoi: 25,
    betsWithResult: 45,
    evValidationPercent: 87.23
  },
  activeBets: [
    {
      id: '1',
      race: 'Flemington R1',
      horse: 'Timeform Pick',
      odds: 3.5,
      stake: 50,
      status: 'active',
      placedAt: new Date().toISOString()
    },
    {
      id: '2',
      race: 'Caulfield R2',
      horse: 'Market Leader',
      odds: 2.8,
      stake: 75,
      status: 'active',
      placedAt: new Date().toISOString()
    }
  ],
  archiveBets: [
    {
      id: '101',
      race: 'Moonee Valley R3',
      horse: 'Winner',
      odds: 4.2,
      stake: 100,
      status: 'won',
      result: 1,
      return: 420,
      pnl: 320
    },
    {
      id: '102',
      race: 'Sandown R1',
      horse: 'Second Place',
      odds: 3.1,
      stake: 50,
      status: 'placed',
      result: 2,
      return: 155,
      pnl: 105
    }
  ],
  historicalPnL: {
    totalBets: 47,
    wins: 29,
    places: 12,
    losses: 6,
    totalReturn: 3450.75,
    totalStaked: 2500,
    roi: 1.38,
    clvValidated: 23
  }
};

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Route handlers
  if (pathname === '/api/dashboard') {
    res.writeHead(200);
    res.end(JSON.stringify(mockData.dashboard));
  } else if (pathname === '/api/bets/active') {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, bets: mockData.activeBets }));
  } else if (pathname === '/api/bets/archive') {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, bets: mockData.archiveBets }));
  } else if (pathname === '/api/historical/pnl') {
    res.writeHead(200);
    res.end(JSON.stringify(mockData.historicalPnL));
  } else if (pathname === '/api/races/today') {
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      races: [
        { id: 1, track: 'Flemington', raceNumber: 1, time: '12:30', status: 'open' },
        { id: 2, track: 'Caulfield', raceNumber: 2, time: '13:15', status: 'open' }
      ]
    }));
  } else if (pathname === '/api/parse-sportsbet') {
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      track: 'Flemington',
      raceNumber: 1,
      runners: [
        { number: 1, horse: 'Test Horse 1', odds: 3.5 },
        { number: 2, horse: 'Test Horse 2', odds: 2.8 }
      ]
    }));
  } else if (pathname === '/api/bets/batch' && req.method === 'POST') {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, placed: 5 }));
  } else if (pathname === '/api/kelly/log' && req.method === 'POST') {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
  } else if (pathname === '/api/bets/mark-result' && req.method === 'POST') {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
  } else if (pathname.startsWith('/api/kb/')) {
    // Serve KB markdown files
    const filename = pathname.replace('/api/kb/', '');
    const filepath = path.join(__dirname, filename);

    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(content);
    } catch (err) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: `KB file not found: ${filename}` }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════════════╗`);
  console.log(`║          TrackWise Mock Backend Server             ║`);
  console.log(`║              Listening on port ${PORT}              ║`);
  console.log(`║       http://localhost:${PORT}                      ║`);
  console.log(`╚════════════════════════════════════════════════════╝\n`);
});
