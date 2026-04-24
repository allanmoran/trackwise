/**
 * Race Results Feeder
 * Processes ALL race results (not just bets) and updates horse/jockey/trainer career stats
 * Feeds all day's races back into the Knowledge Base
 */

import express from 'express';
import db from '../db.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const router = express.Router();

/**
 * Scrape all race results for a given date and update KB
 * Called daily after races complete
 */
async function scrapeAndFeedRaceResults(date) {
  console.log(`\n📊 Feeding all race results from ${date} into KB...`);

  // Get all races for the date from our races table
  const races = db.prepare(`
    SELECT id, track, race_number, race_name, distance, condition
    FROM races
    WHERE date = ?
    ORDER BY track, race_number
  `).all(date);

  if (races.length === 0) {
    console.log(`   ⚠️  No races found for ${date}`);
    return { success: false, message: 'No races found for date' };
  }

  console.log(`   Found ${races.length} races`);

  let resultsProcessed = 0;
  let horsesUpdated = 0;

  // Process each race
  for (const race of races) {
    try {
      const raceResults = await scrapeRaceFromPunters(race.track, date, race.race_number, race.race_name);

      if (!raceResults || raceResults.length === 0) {
        console.log(`   ℹ️  No results found for ${race.track} R${race.race_number}`);
        continue;
      }

      console.log(`   ✅ ${race.track} R${race.race_number}: ${raceResults.length} results`);

      // Update horse stats for all finishers
      for (const result of raceResults) {
        const updated = updateHorseFromRaceResult(result.horseName, result.placing, race.id);
        if (updated) horsesUpdated++;
      }

      resultsProcessed++;
    } catch (err) {
      console.error(`   ❌ Error processing ${race.track} R${race.race_number}:`, err.message);
    }
  }

  return {
    success: true,
    racesProcessed: resultsProcessed,
    horsesUpdated,
    message: `Processed ${resultsProcessed} races, updated ${horsesUpdated} horse stats`
  };
}

/**
 * Scrape race results from punters.com.au
 */
async function scrapeRaceFromPunters(track, date, raceNum, raceName) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(8000);

    const trackSlug = track.toLowerCase().replace(/\s+/g, '-');
    const dateStr = date.replace(/-/g, '');
    const raceSlug = raceName
      ?.toLowerCase()
      .replace(/[&]/g, 'and')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    const url = `https://www.punters.com.au/racing-results/horses/${trackSlug}-${dateStr}/${raceSlug}-race-${raceNum}/`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 500));

    const results = await page.evaluate(() => {
      const horses = [];
      const html = document.documentElement.outerHTML;

      // Extract horse names from pattern
      const pattern = /['"]([A-Za-z\s]+?)\s+-\s+J:\s+[A-Za-z\s]+\s+-\s+T:/g;
      let match;
      let position = 1;

      const foundNames = [];
      while ((match = pattern.exec(html)) !== null) {
        foundNames.push(match[1].trim());
      }

      const uniqueNames = [...new Set(foundNames)];

      for (const horseName of uniqueNames) {
        if (horseName.length >= 2 && /[a-zA-Z]/.test(horseName)) {
          const placing = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';
          horses.push({ position, horseName, placing });
          position++;

          if (position > 15) break;
        }
      }

      return horses.length > 0 ? horses : null;
    });

    await browser.close();
    return results;
  } catch (err) {
    if (browser) await browser.close();
    console.error(`   Scrape error for ${track} R${raceNum}:`, err.message);
    return null;
  }
}

/**
 * Update horse stats from a single race result
 */
function updateHorseFromRaceResult(horseName, placing, raceId) {
  try {
    // Find horse by name (fuzzy match)
    const horse = db.prepare(`
      SELECT id FROM horses WHERE LOWER(name) LIKE ?
    `).get(`%${horseName.toLowerCase().substring(0, 5)}%`);

    if (!horse) {
      // Create new horse entry if not found
      db.prepare(`
        INSERT OR IGNORE INTO horses (name) VALUES (?)
      `).run(horseName);

      return false;
    }

    // Update horse career stats based on race result
    const currentStats = db.prepare(`
      SELECT career_wins, career_places, career_bets
      FROM horses
      WHERE id = ?
    `).get(horse.id);

    let newWins = currentStats?.career_wins || 0;
    let newPlaces = currentStats?.career_places || 0;
    let newBets = (currentStats?.career_bets || 0) + 1;

    if (placing === 'WIN') {
      newWins++;
      newPlaces++;
    } else if (placing === 'PLACE') {
      newPlaces++;
    }

    const strikeRate = newWins / newBets;
    const placeRate = newPlaces / newBets;

    db.prepare(`
      UPDATE horses
      SET career_wins = ?,
          career_places = ?,
          career_bets = ?,
          strike_rate = ?,
          place_rate = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newWins, newPlaces, newBets, strikeRate, placeRate, horse.id);

    return true;
  } catch (err) {
    console.error(`   Error updating ${horseName}:`, err.message);
    return false;
  }
}

/**
 * POST /api/race-results/feed-all
 * Process all race results for a date and feed into KB
 */
router.post('/feed-all', async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.body;

    console.log(`\n🔄 Race Results Feeder triggered for ${date}`);

    const result = await scrapeAndFeedRaceResults(date);

    if (result.success) {
      // Also trigger KB update to recalculate stats
      console.log('\n🔄 Updating KB stats after feeding results...');
      await triggerKBUpdate();
    }

    res.json({
      success: result.success,
      message: result.message,
      racesProcessed: result.racesProcessed,
      horsesUpdated: result.horsesUpdated,
      date
    });
  } catch (err) {
    console.error('Race results feeder error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/race-results/today
 * Show which races have been fed into KB today
 */
router.get('/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const raceStats = db.prepare(`
      SELECT
        r.track,
        r.race_number,
        r.race_name,
        COUNT(DISTINCT rr.horse_id) as runners,
        SUM(CASE WHEN rr.result IS NOT NULL THEN 1 ELSE 0 END) as results_recorded
      FROM races r
      LEFT JOIN race_runners rr ON r.id = rr.race_id
      WHERE r.date = ?
      GROUP BY r.id
      ORDER BY r.track, r.race_number
    `).all(today);

    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT rr.horse_id) as unique_horses,
        SUM(CASE WHEN rr.result IS NOT NULL THEN 1 ELSE 0 END) as results_recorded,
        COUNT(*) as total_runners
      FROM race_runners rr
      JOIN races r ON rr.race_id = r.id
      WHERE r.date = ?
    `).get(today);

    res.json({
      success: true,
      date: today,
      summary: {
        totalRaces: raceStats.length,
        totalRunners: stats.total_runners,
        resultsRecorded: stats.results_recorded,
        uniqueHorses: stats.unique_horses,
        percentageComplete: stats.total_runners > 0
          ? ((stats.results_recorded / stats.total_runners) * 100).toFixed(1) + '%'
          : '0%'
      },
      races: raceStats
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Helper to trigger KB update after feeding results
 */
async function triggerKBUpdate() {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:3001/api/kb/update-from-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      console.log(`✅ KB Updated: ${data.summary}`);
    }
  } catch (err) {
    console.error(`⚠️  KB update error:`, err.message);
  }
}

export default router;
