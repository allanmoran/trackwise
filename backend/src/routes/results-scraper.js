/**
 * Results Scraper API Routes
 * Dedicated endpoint for fetching completed race results
 */

import express from 'express';
import { scrapeAllResults } from '../scrapers/results-scraper.js';

const router = express.Router();

// POST /api/results-scraper/scrape
// Start scraping results for all pending bets
router.post('/scrape', async (req, res) => {
  try {
    console.log('\n📡 Results scraper triggered\n');

    const result = await scrapeAllResults();

    if (result.success) {
      res.json({
        success: true,
        message: `Updated ${result.updated}/${result.total} bets with results`,
        updated: result.updated,
        total: result.total,
        results: result.results
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Failed to scrape results'
      });
    }
  } catch (err) {
    console.error('Route error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
