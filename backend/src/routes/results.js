import express from 'express';
import db from '../db.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

puppeteer.use(StealthPlugin());

const router = express.Router();

// Normalize horse name for matching
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// Fuzzy match horse name
function fuzzyMatch(betHorse, resultHorse) {
  const bet = normalizeName(betHorse);
  const result = normalizeName(resultHorse);

  if (!bet || !result) return false;

  // Exact match
  if (bet === result) return true;

  // Substring match
  if (bet.includes(result) || result.includes(bet)) return true;

  // Similar length and contains most characters
  const matches = Array.from(bet).filter(c => result.includes(c)).length;
  return matches >= Math.min(bet.length, result.length) * 0.7;
}

// Racing.com scraper
async function scrapeRacingCom(track, date, raceNum, raceName = null, meetingId = null) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000);
    const trackSlug = track.toLowerCase().replace(/\s+/g, '-');
    const url = `https://www.racing.com/form/${date}/${trackSlug}/race/${raceNum}`;

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 1000));

    const results = await page.evaluate(() => {
      const horses = [];
      const bodyText = document.body.innerText;

      // Check if race finished
      if (!bodyText.includes('Result') && !bodyText.includes('RESULT') && !bodyText.includes('Finished')) {
        return null;
      }

      // Look for result elements
      const elements = Array.from(document.querySelectorAll('*'));
      let position = 1;

      for (const el of elements) {
        const text = el.textContent || '';
        if (text.length < 5 || text.length > 200) continue;

        // Match position patterns
        const posMatch = text.match(/^(1st|2nd|3rd|4th|5th|\d+(?:st|nd|rd|th))\s+(.+?)(?:\s+\(|\s+@|\s*$)/i);
        if (posMatch) {
          const horseName = posMatch[2].trim();
          const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';

          if (horseName.length >= 3 && /[a-zA-Z]/.test(horseName)) {
            if (!horses.some(h => h.horseName.toLowerCase() === horseName.toLowerCase())) {
              horses.push({ position, horseName, placing });
              position++;
            }
          }
        }
      }

      return horses.length > 0 ? horses : null;
    });

    await browser.close();
    return results;
  } catch (err) {
    if (browser) await browser.close();
    return null;
  }
}

// Sportsbet scraper
async function scrapeSportsbet(track, date, raceNum, raceName = null, meetingId = null) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    // Sportsbet form guide format
    const url = `https://www.sportsbetform.com.au/`;

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 1000));

    // This requires more specific navigation - for now return null
    // In production, would need track ID mapping
    await browser.close();
    return null;
  } catch (err) {
    if (browser) await browser.close();
    return null;
  }
}

// TABCorp scraper
async function scrapeTAB(track, date, raceNum, raceName = null, meetingId = null) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(8000);
    const trackUpper = track.toUpperCase();
    const trackCode = track.slice(0, 3).toUpperCase();
    const url = `https://www.tab.com.au/racing/${date}/${trackUpper}/${trackCode}/R/${raceNum}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 500));

    const results = await page.evaluate(() => {
      const horses = [];
      const bodyText = document.body.innerText;

      // Check if results available
      if (bodyText.includes('No results found') || bodyText.includes('upcoming')) {
        return null;
      }

      // Look for finishing position pattern
      const rows = document.querySelectorAll('tr, li, div[class*="result"]');
      let position = 1;

      for (const row of rows) {
        const text = row.textContent || '';
        if (text.length < 5 || text.length > 200) continue;

        const posMatch = text.match(/^(1st|2nd|3rd|4th|5th)\s+(.+?)(?:\s+\(|,|\s*$)/i);
        if (posMatch) {
          const horseName = posMatch[2].trim();
          const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';

          if (horseName.length >= 3 && /[a-zA-Z]/.test(horseName)) {
            horses.push({ position, horseName, placing });
            position++;
          }
        }
      }

      return horses.length > 0 ? horses : null;
    });

    await browser.close();
    return results;
  } catch (err) {
    if (browser) await browser.close();
    return null;
  }
}

// Punters scraper
async function scrapePunters(track, date, raceNum, raceName = null) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(8000);
    const trackSlug = track.toLowerCase().replace(/\s+/g, '-');
    // Format: /racing-results/horses/{track}-{YYYYMMDD}/{race-name-slug}/
    const dateStr = date.replace(/-/g, '');

    // Build race slug from race name - convert to lowercase and spaces to dashes
    let raceSlug;
    if (raceName && raceName.trim()) {
      raceSlug = raceName.toLowerCase()
        .replace(/[&]/g, 'and')  // Replace & with 'and'
        .replace(/[^a-z0-9\s]/g, '')  // Remove special chars except spaces
        .replace(/\s+/g, '-')  // Replace spaces with dashes
        .replace(/-+/g, '-')  // Replace multiple dashes with single
        .replace(/^-+|-+$/g, '');  // Remove leading/trailing dashes
      // Append race number to slug
      raceSlug = `${raceSlug}-race-${raceNum}`;
    } else {
      raceSlug = `race-${raceNum}`;
    }

    const url = `https://www.punters.com.au/racing-results/horses/${trackSlug}-${dateStr}/${raceSlug}/`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 500));

    const results = await page.evaluate(() => {
      const horses = [];
      const html = document.documentElement.outerHTML;

      // Extract from JSON-embedded format: "HorseName - J: Jockey - T: Trainer"
      const pattern = /['"]([A-Za-z\s]+?)\s+-\s+J:\s+[A-Za-z\s]+\s+-\s+T:/g;
      let match;
      let position = 1;

      const foundNames = [];
      while ((match = pattern.exec(html)) !== null) {
        foundNames.push(match[1].trim());
      }

      // Remove duplicates (keep order)
      const uniqueNames = [...new Set(foundNames)];

      for (const horseName of uniqueNames) {
        if (horseName.length >= 2 && /[a-zA-Z]/.test(horseName)) {
          const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';
          horses.push({ position, horseName, placing });
          position++;

          if (position > 10) break; // Limit to top 10
        }
      }

      return horses.length > 0 ? horses : null;
    });

    await browser.close();
    return results;
  } catch (err) {
    if (browser) await browser.close();
    return null;
  }
}

// Scrape all sources for a race
async function scrapeRaceResults(track, date, raceNum, raceName = null, meetingId = null) {
  console.log(`  ⏳ ${track} R${raceNum}...`);

  try {
    // Use Punters only - it's the most reliable source
    const results = await scrapePunters(track, date, raceNum, raceName);
    if (results && results.length > 0) {
      console.log(`    ✅ Found results from Punters`);
      return results;
    }
  } catch (err) {
    console.log(`    ⚠️  Punters scrape error: ${err.message}`);
  }

  return null;
}

// Update bet with result and calculate P&L
function updateBetResult(betId, result) {
  try {
    // Get bet details to calculate return
    const bet = db.prepare('SELECT stake, opening_odds, closing_odds FROM bets WHERE id = ?').get(betId);
    if (!bet) return false;

    const odds = bet.closing_odds || bet.opening_odds || 0;
    let returnAmount = 0;
    let profitLoss = 0;

    // Calculate returns based on result
    if (result === 'WIN') {
      returnAmount = bet.stake * odds;
      profitLoss = bet.stake * (odds - 1);
    } else if (result === 'PLACE') {
      // Place pays 1/4 of odds (approximately)
      const placeOdds = 1 + ((odds - 1) / 4);
      returnAmount = bet.stake * placeOdds;
      profitLoss = bet.stake * ((odds - 1) / 4);
    } else if (result === 'LOSS') {
      returnAmount = 0;
      profitLoss = -bet.stake;
    }

    db.prepare(`
      UPDATE bets
      SET result = ?, return_amount = ?, profit_loss = ?, status = 'SETTLED', settled_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(result, returnAmount, profitLoss, betId);
    return true;
  } catch (err) {
    console.error('Update error:', err);
    return false;
  }
}

// In-memory job tracking
const scrapeJobs = new Map();

// Background scraping function
async function scrapeInBackground(pendingBets) {
  const jobId = Date.now().toString();
  const job = {
    id: jobId,
    status: 'running',
    started: new Date(),
    updated: 0,
    total: pendingBets.length,
    results: []
  };

  scrapeJobs.set(jobId, job);

  try {
    console.log(`\n🏇 [Job ${jobId}] Starting auto-scrape of ${pendingBets.length} bets...\n`);

    // Group bets by race
    const betsByRace = new Map();
    for (const bet of pendingBets) {
      const key = `${bet.track}-${bet.date}-${bet.race_num}`;
      if (!betsByRace.has(key)) {
        betsByRace.set(key, { race: bet, bets: [] });
      }
      betsByRace.get(key).bets.push(bet);
    }

    // Scrape each unique race
    for (const [key, { race, bets }] of betsByRace) {
      try {
        const raceResults = await scrapeRaceResults(race.track, race.date, race.race_num, race.race_name, race.meeting_id);

        if (!raceResults || raceResults.length === 0) {
          console.log(`    ℹ️  ${race.track} R${race.race_num}: No results found`);
          continue;
        }

        console.log(`    ✅ ${race.track} R${race.race_num}: Found ${raceResults.length} results`);

        // Match results to bets
        for (const result of raceResults) {
          for (const bet of bets) {
            if (fuzzyMatch(bet.horse, result.horseName)) {
              console.log(`      ✓ Matched: ${bet.horse} -> ${result.horseName} (${result.placing})`);
              updateBetResult(bet.id, result.placing);
              job.updated++;
              job.results.push({
                horse: bet.horse,
                result: result.placing,
                winner: result.horseName
              });
              break;
            }
          }
        }
      } catch (err) {
        console.error(`[Job ${jobId}] Scrape error for ${key}:`, err.message);
      }

      // Minimal rate limit
      await new Promise(r => setTimeout(r, 200));
    }

    job.status = 'completed';
    job.completed = new Date();

    const settledCount = db.prepare('SELECT COUNT(*) as count FROM bets WHERE result IS NOT NULL').get();
    job.totalSettled = settledCount.count;

    console.log(`\n[Job ${jobId}] ✅ Complete: ${job.updated}/${job.total} results updated\n`);

  } catch (err) {
    console.error(`[Job ${jobId}] Fatal error:`, err);
    job.status = 'failed';
    job.error = err.message;
  }
}

// GET /api/results/job/:jobId - Check scraping job status
router.get('/job/:jobId', (req, res) => {
  const job = scrapeJobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      updated: job.updated,
      total: job.total,
      completed: job.completed,
      results: job.results,
      totalSettled: job.totalSettled
    }
  });
});

// POST /api/results/scrape - Start background scraping job
router.post('/scrape', (req, res) => {
  try {
    // Get all pending bets with race and horse details
    const pendingBets = db.prepare(`
      SELECT
        b.id,
        r.track,
        r.date,
        r.race_number as race_num,
        r.race_name,
        r.meeting_id,
        h.name as horse,
        j.name as jockey,
        t.name as trainer,
        b.closing_odds as odds,
        b.stake
      FROM bets b
      JOIN races r ON b.race_id = r.id
      JOIN horses h ON b.horse_id = h.id
      JOIN jockeys j ON b.jockey_id = j.id
      JOIN trainers t ON b.trainer_id = t.id
      WHERE b.result IS NULL
      ORDER BY r.track, r.race_number
    `).all();

    if (pendingBets.length === 0) {
      return res.json({
        success: true,
        message: 'No pending bets to scrape',
        updated: 0,
        pending: 0,
        jobId: null
      });
    }

    // Start scraping in background (non-blocking)
    const jobId = Date.now().toString();
    scrapeInBackground(pendingBets); // Fire and forget

    res.json({
      success: true,
      message: `Started scraping ${pendingBets.length} races from public sources`,
      jobId: jobId,
      pending: pendingBets.length,
      checkUrl: `/api/results/job/${jobId}`
    });

  } catch (err) {
    console.error('Results scrape error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to start scrape'
    });
  }
});

// Load today's races from Punters form guide
router.post('/load-todays-races', (req, res) => {
  try {
    const scriptPath = path.join(__dirname, '../../scripts/load-todays-races.js');

    // Execute the script and capture output
    let output = '';
    let errorOutput = '';

    const process = spawn('node', [scriptPath], {
      cwd: path.join(__dirname, '../..')
    });

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        // Parse the output to get summary stats
        const raceMatch = output.match(/Found (\d+) races/);
        const updatedMatch = output.match(/(\d+) race names updated/);
        const insertedMatch = output.match(/(\d+) new races added/);

        const raceCount = raceMatch ? parseInt(raceMatch[1]) : 0;
        const updatedCount = updatedMatch ? parseInt(updatedMatch[1]) : 0;
        const insertedCount = insertedMatch ? parseInt(insertedMatch[1]) : 0;

        res.json({
          success: true,
          message: `Loaded today's races from Punters form guide`,
          races: raceCount,
          updated: updatedCount,
          inserted: insertedCount,
          total: updatedCount + insertedCount
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to load races',
          details: errorOutput || output
        });
      }
    });

  } catch (err) {
    console.error('Load races error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to load races'
    });
  }
});

export default router;
