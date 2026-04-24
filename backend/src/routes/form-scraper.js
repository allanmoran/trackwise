/**
 * Form Scraper API Routes
 * Handles scraping and loading of race form data
 */

import express from 'express';
import db from '../db.js';
import SportsbetFormScraper from '../scrapers/sportsbet-form-scraper.js';

const router = express.Router();

/**
 * POST /api/form-scraper/load-race
 * Load a single race from Sportsbet form URL
 */
router.post('/load-race', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    console.log(`\n📥 Form scraper request: ${url}`);

    const result = await SportsbetFormScraper.scrapeAndLoad(url);

    res.json({
      success: true,
      raceId: result.raceId,
      runnersLoaded: result.runnersLoaded,
      message: `Successfully loaded ${result.runnersLoaded} runners`
    });
  } catch (err) {
    console.error('Form scraper error:', err);
    res.status(500).json({
      error: 'Failed to scrape form',
      details: err.message
    });
  }
});

/**
 * POST /api/form-scraper/batch
 * Load multiple race URLs with auto-betting
 * Optional: captureLiveOdds (boolean) - capture live odds from Sportsbet for each race
 */
router.post('/batch', async (req, res) => {
  try {
    const { urls, tracks, autoBet = true, minEv = 0.10, captureLiveOdds = false } = req.body;

    let urlsToScrape = urls || [];

    // If tracks array provided, extract URLs for those tracks
    if (tracks && Array.isArray(tracks) && tracks.length > 0) {
      console.log(`\n📥 Batch scraper: Extracting URLs for tracks: ${tracks.join(', ')}`);
      try {
        urlsToScrape = await SportsbetFormScraper.scrapeRaceUrlsByTracks(tracks);
        console.log(`✓ Found ${urlsToScrape.length} URLs for specified tracks`);
      } catch (err) {
        console.warn(`⚠️ Failed to extract URLs: ${err.message}`);
        return res.status(400).json({ error: 'Failed to extract URLs for tracks', details: err.message });
      }
    }

    if (urlsToScrape.length === 0) {
      return res.status(400).json({ error: 'No URLs provided or found' });
    }

    console.log(`🚀 Starting batch scrape: ${urlsToScrape.length} races with 4-concurrent processing`);

    const results = [];
    let totalRunners = 0;
    let successCount = 0;
    let errorCount = 0;
    const maxConcurrent = 4;

    // Process URLs in concurrent batches of 4
    for (let i = 0; i < urlsToScrape.length; i += maxConcurrent) {
      const batch = urlsToScrape.slice(i, Math.min(i + maxConcurrent, urlsToScrape.length));
      const batchStartTime = Date.now();

      const batchResults = await Promise.all(
        batch.map(async (urlObj) => {
          const url = typeof urlObj === 'string' ? urlObj : urlObj.url;
          const index = urlsToScrape.indexOf(urlObj) + 1;
          console.log(`[${index}/${urlsToScrape.length}] Starting: ${url}`);

          try {
            const result = autoBet
              ? await SportsbetFormScraper.scrapeLoadPredictAndBet(url, minEv)
              : await SportsbetFormScraper.scrapeLoadAndPredict(url, captureLiveOdds);

            return {
              url,
              raceId: result.raceId,
              track: result.track,
              raceNumber: result.raceNumber,
              runnersLoaded: result.runnersLoaded,
              picksGenerated: result.picks.length,
              betsPlaced: result.betResult?.betsPlaced || 0,
              topPick: result.picks[0] ? {
                horse: result.picks[0].horse,
                jockey: result.picks[0].jockey,
                odds: result.picks[0].odds,
                prob: result.picks[0].predicted_win_prob,
                evWin: result.picks[0].ev_win,
                evPlace: result.picks[0].ev_place
              } : null,
              picks: result.picks.map(p => ({
                horse: p.horse,
                jockey: p.jockey,
                trainer: p.trainer,
                odds: p.odds,
                prob: p.predicted_win_prob,
                evWin: p.ev_win,
                evPlace: p.ev_place,
                recommendation: p.recommendation
              })),
              status: 'success'
            };
          } catch (err) {
            return {
              url,
              status: 'error',
              error: err.message
            };
          }
        })
      );

      // Collect results
      batchResults.forEach(result => {
        results.push(result);
        if (result.status === 'success') {
          totalRunners += result.runnersLoaded;
          successCount++;
        } else {
          errorCount++;
          console.warn(`⚠️ Error scraping ${result.url}: ${result.error}`);
        }
      });

      const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      const processed = Math.min(i + maxConcurrent, urlsToScrape.length);
      console.log(`✅ Batch complete: ${processed}/${urlsToScrape.length} (${batchTime}s)\n`);

      // Small delay between batches
      if (i + maxConcurrent < urlsToScrape.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    console.log(`✅ Batch complete: ${successCount} succeeded, ${errorCount} failed, ${totalRunners} runners loaded`);

    res.json({
      success: true,
      totalRaces: urlsToScrape.length,
      successCount,
      errorCount,
      totalRunners,
      results
    });
  } catch (err) {
    console.error('Batch scraper error:', err);
    res.status(500).json({
      error: 'Batch scrape failed',
      details: err.message
    });
  }
});

/**
 * GET /api/form-scraper/today
 * Get today's races from KB after form loading
 */
router.get('/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const races = db.prepare(`
      SELECT id, track, race_number, race_name, distance,
             (SELECT COUNT(*) FROM race_runners WHERE race_id = races.id) as runners,
             (SELECT COUNT(*) FROM race_runners WHERE race_id = races.id AND starting_odds IS NOT NULL) as runners_with_odds
      FROM races
      WHERE date = ?
      ORDER BY track, race_number
    `).all(today);

    res.json({
      success: true,
      date: today,
      races: races || [],
      totalRaces: races?.length || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get today\'s races' });
  }
});

/**
 * GET /api/form-scraper/extract-urls
 * Extract all race URLs from Sportsbet main page
 */
router.get('/extract-urls', async (req, res) => {
  try {
    console.log(`\n📡 Extract race URLs request`);
    const raceUrls = await SportsbetFormScraper.scrapeRaceUrls();

    res.json({
      success: true,
      totalUrls: raceUrls.length,
      urls: raceUrls
    });
  } catch (err) {
    console.error('Extract URLs error:', err);
    res.status(500).json({
      error: 'Failed to extract race URLs',
      details: err.message
    });
  }
});

/**
 * POST /api/form-scraper/capture-track-condition
 * Capture track condition from Sportsbet track conditions page
 * Updates race record with track condition data
 */
router.post('/capture-track-condition', async (req, res) => {
  try {
    const { raceId, track, raceDate, raceNumber } = req.body;

    if (!raceId || !track || !raceDate || !raceNumber) {
      return res.status(400).json({
        error: 'Missing required fields: raceId, track, raceDate, raceNumber'
      });
    }

    console.log(`\n🌤️ Track condition capture: ${track} R${raceNumber}`);

    // Fetch from Sportsbet track conditions page
    let condition = await SportsbetFormScraper.fetchTrackConditionFromRacingCom(track, raceDate, raceNumber);

    if (!condition) {
      console.log(`  📍 Sportsbet track conditions page had no data`);
    }

    // Update database if we found a condition
    let updated = false;
    if (condition) {
      try {
        db.prepare(`
          UPDATE races
          SET track_condition = ?
          WHERE id = ?
        `).run(condition, raceId);
        updated = true;
        console.log(`  ✅ Updated race ${raceId} with condition: ${condition}`);
      } catch (err) {
        console.error(`  ❌ Database update failed: ${err.message}`);
      }
    }

    res.json({
      success: true,
      raceId,
      track,
      raceNumber,
      condition: condition || null,
      updated
    });
  } catch (err) {
    console.error('Track condition capture error:', err);
    res.status(500).json({
      error: 'Failed to capture track condition',
      details: err.message
    });
  }
});

/**
 * POST /api/form-scraper/update-live-odds
 * Capture live odds from Sportsbet for a specific race and update database
 */
router.post('/update-live-odds', async (req, res) => {
  try {
    const { raceId, track, raceDate, raceNumber } = req.body;

    if (!raceId || !track || !raceDate || !raceNumber) {
      return res.status(400).json({
        error: 'Missing required fields: raceId, track, raceDate, raceNumber'
      });
    }

    console.log(`\n💰 Live odds update request: ${track} R${raceNumber}`);

    // Capture live odds from Sportsbet
    const oddsData = await SportsbetFormScraper.captureLiveOdds(track, raceDate, raceNumber);

    // Update database with captured odds
    const updated = SportsbetFormScraper.updateLiveOdds(
      raceId,
      track,
      raceDate,
      raceNumber,
      oddsData.odds
    );

    res.json({
      success: true,
      raceId,
      track,
      raceNumber,
      oddsUpdated: updated,
      totalCaptured: oddsData.count,
      timestamp: oddsData.timestamp
    });
  } catch (err) {
    console.error('Live odds update error:', err);
    res.status(500).json({
      error: 'Failed to update live odds',
      details: err.message
    });
  }
});

/**
 * POST /api/form-scraper/scrape-and-place
 * Scrape race, generate picks, and place bets (with custom strategy)
 */
router.post('/scrape-and-place', async (req, res) => {
  try {
    const { url, autoBet = true, minEv = 0.05, maxOdds = 15, stake = 50 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    console.log(`\n🚀 Scrape & Place: ${url}`);
    console.log(`   Min EV: ${(minEv * 100).toFixed(1)}%, Max Odds: $${maxOdds}, Stake: $${stake}`);

    const result = autoBet
      ? await SportsbetFormScraper.scrapeLoadPredictAndBet(url, minEv)
      : await SportsbetFormScraper.scrapeLoadAndPredict(url);

    // Return summary
    res.json({
      success: true,
      raceId: result.raceId,
      runnersLoaded: result.runnersLoaded,
      picksGenerated: result.picks.length,
      betsPlaced: result.betResult?.betsPlaced || 0,
      bankrupcy: result.betResult?.betsSkipped || 0,
      topPick: result.picks[0] ? {
        horse: result.picks[0].horse,
        jockey: result.picks[0].jockey,
        odds: result.picks[0].odds,
        prob: `${result.picks[0].predicted_win_prob}%`,
        evWin: result.picks[0].ev_win,
        recommendation: result.picks[0].recommendation
      } : null,
      allPicks: result.picks.map(p => ({
        horse: p.horse,
        jockey: p.jockey,
        trainer: p.trainer,
        odds: p.odds,
        prob: `${p.predicted_win_prob}%`,
        evWin: p.ev_win,
        evPlace: p.ev_place,
        recommendation: p.recommendation
      }))
    });
  } catch (err) {
    console.error('Scrape & Place error:', err);
    res.status(500).json({
      error: 'Failed to scrape and place bets',
      details: err.message
    });
  }
});

export default router;
