import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './db.js';
import dashboardRoutes from './routes/dashboard.js';
import betsRoutes from './routes/bets.js';
import racesRoutes from './routes/races.js';
import kbRoutes from './routes/kb-complete.js';
import kbFeedbackRoutes from './routes/kb-feedback.js';
import kellyRoutes from './routes/kelly.js';
import historicalRoutes from './routes/historical.js';
import enrichRoutes from './routes/enrich.js';
import backupRoutes from './routes/backup.js';
import resultsRoutes from './routes/results.js';
import oddsRoutes from './routes/odds.js';
import formScraperRoutes from './routes/form-scraper.js';
import modelTrainerRoutes from './routes/model-trainer.js';
import raceResultsFeederRoutes from './routes/race-results-feeder.js';
import featureAnalysisRoutes from './routes/feature-analysis.js';
import complianceRoutes from './routes/compliance.js';
import loggingRoutes from './routes/logging.js';
import marketIntelligenceRoutes from './routes/market-intelligence.js';
import commissionRoutes from './routes/commission.js';
import resultsScraperRoutes from './routes/results-scraper.js';
import sessionRoutes from './routes/session.js';
import { startScheduler } from './schedulers/results-scheduler.js';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
initializeDatabase();

// Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/bets', betsRoutes);
app.use('/api/races', racesRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/kb', kbFeedbackRoutes);
app.use('/api/kelly', kellyRoutes);
app.use('/api/historical', historicalRoutes);
app.use('/api/enrich', enrichRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/odds', oddsRoutes);
app.use('/api/form-scraper', formScraperRoutes);
app.use('/api/model', modelTrainerRoutes);
app.use('/api/race-results', raceResultsFeederRoutes);
app.use('/api/features', featureAnalysisRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/logging', loggingRoutes);
app.use('/api/intelligence', marketIntelligenceRoutes);
app.use('/api/commission', commissionRoutes);
app.use('/api/results-scraper', resultsScraperRoutes);
app.use('/api/session', sessionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════════════╗`);
  console.log(`║          TrackWise Backend Server                 ║`);
  console.log(`║              Listening on port ${PORT}              ║`);
  console.log(`║       http://localhost:${PORT}                      ║`);
  console.log(`║       Database: backend/data/trackwise.db        ║`);
  console.log(`╚════════════════════════════════════════════════════╝\n`);

  // Start results scheduler
  startScheduler();
});
