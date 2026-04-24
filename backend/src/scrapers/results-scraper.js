/**
 * Results Scraper - Extract completed race results from Punters
 * Using Punters form-guide pages which have comprehensive Australian racing results
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import db from '../db.js';

puppeteer.use(StealthPlugin());

// Normalize horse name for matching
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// Fuzzy match horse names
function fuzzyMatch(betHorse, resultHorse) {
  const bet = normalizeName(betHorse);
  const result = normalizeName(resultHorse);

  if (!bet || !result) return false;

  // Exact match
  if (bet === result) return true;

  // Substring match
  if (bet.includes(result) || result.includes(bet)) return true;

  // Similar length - 70% character match
  const matches = Array.from(bet).filter(c => result.includes(c)).length;
  return matches >= Math.min(bet.length, result.length) * 0.7;
}

// Scrape results from Punters form-guide for a track/date
async function scrapeRaceResultsFromPunters(browser, track, date, raceNumber) {
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000);

    const trackSlug = track.toLowerCase().replace(/\s+/g, '-');
    const dateStr = date.replace(/-/g, ''); // YYYYMMDD

    const formGuideUrl = `https://www.punters.com.au/form-guide/horses/${trackSlug}-${dateStr}/`;

    try {
      await page.goto(formGuideUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (err) {
      if (page) await page.close();
      return null;
    }

    await new Promise(r => setTimeout(r, 1200));

    // Extract results from page
    const results = await page.evaluate(() => {
      const horses = [];
      const bodyText = document.body.innerText;
      const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      // Look for position markers (1st, 2nd, 3rd) and extract horse names
      let position = 0;
      for (let i = 0; i < lines.length && horses.length < 5; i++) {
        const line = lines[i];

        // Match position indicators: "1st", "2nd", "3rd", "4th", "5th"
        const posMatch = line.match(/^(1st|2nd|3rd|4th|5th)$/i);
        if (posMatch) {
          position = parseInt(posMatch[1].charAt(0)); // Extract digit

          // Look ahead for horse name (usually in next 1-3 lines)
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const nextLine = lines[j];

            // Horse entry format: "3. Strassman (4)" or similar
            const horseMatch = nextLine.match(/^\d+\.\s+([A-Za-z\s&\-']+?)\s*\(/);
            if (horseMatch) {
              const horseName = horseMatch[1].trim();

              if (horseName && horseName.length >= 2 && /[a-zA-Z]/.test(horseName)) {
                let placing = 'LOSS';
                if (position === 1) {
                  placing = 'WIN';
                } else if (position <= 3) {
                  placing = 'PLACE';
                }

                horses.push({ position, horseName, placing });
                i = j; // Move past this entry
                break;
              }
            }
          }
        }
      }

      return horses.length > 0 ? horses : null;
    });

    if (page) await page.close();
    return results;

  } catch (err) {
    if (page) await page.close();
    return null;
  }
}

// Update bet result and calculate P&L
function updateBetResult(betId, result) {
  try {
    const bet = db.prepare('SELECT stake, opening_odds, closing_odds FROM bets WHERE id = ?').get(betId);
    if (!bet) return false;

    const odds = bet.closing_odds || bet.opening_odds || 0;
    let returnAmount = 0;
    let profitLoss = 0;

    if (result === 'WIN') {
      returnAmount = bet.stake * odds;
      profitLoss = bet.stake * (odds - 1);
    } else if (result === 'PLACE') {
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
    console.error('  Error updating bet:', err.message);
    return false;
  }
}

// Main scraping engine
export async function scrapeAllResults() {
  try {
    // Get all pending bets grouped by race
    const pendingBets = db.prepare(`
      SELECT
        b.id,
        b.horse_id,
        r.track,
        r.date,
        r.race_number,
        r.race_name,
        h.name as horse_name,
        b.opening_odds,
        b.closing_odds,
        b.stake
      FROM bets b
      JOIN races r ON b.race_id = r.id
      JOIN horses h ON b.horse_id = h.id
      WHERE b.result IS NULL
      ORDER BY r.track, r.date, r.race_number
    `).all();

    if (pendingBets.length === 0) {
      return { success: true, updated: 0, total: 0, message: 'No pending bets' };
    }

    console.log(`\n🏇 Scraping results for ${pendingBets.length} pending bets from Punters...\n`);

    // Group by race
    const betsByRace = new Map();
    for (const bet of pendingBets) {
      const key = `${bet.track}|${bet.date}|${bet.race_number}`;
      if (!betsByRace.has(key)) {
        betsByRace.set(key, {
          track: bet.track,
          date: bet.date,
          race_number: bet.race_number,
          bets: []
        });
      }
      betsByRace.get(key).bets.push(bet);
    }

    let totalUpdated = 0;
    const results = [];
    let browser;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      // Scrape each unique race
      for (const [key, raceData] of betsByRace) {
        try {
          const raceResults = await scrapeRaceResultsFromPunters(
            browser,
            raceData.track,
            raceData.date,
            raceData.race_number
          );

          if (!raceResults || raceResults.length === 0) {
            console.log(`  ℹ️  ${raceData.track} R${raceData.race_number}: No results found`);
            continue;
          }

          console.log(`  ✅ ${raceData.track} R${raceData.race_number}: Found ${raceResults.length} results`);

          // Match results to bets
          for (const result of raceResults) {
            for (const bet of raceData.bets) {
              if (fuzzyMatch(bet.horse_name, result.horseName)) {
                console.log(`    ✓ ${bet.horse_name} → ${result.horseName} (${result.placing})`);
                updateBetResult(bet.id, result.placing);
                totalUpdated++;
                results.push({
                  betId: bet.id,
                  horse: bet.horse_name,
                  result: result.placing,
                  odds: bet.closing_odds || bet.opening_odds
                });
                break;
              }
            }
          }
        } catch (err) {
          console.error(`Error scraping ${key}:`, err.message);
        }

        // Rate limit: 300ms between races
        await new Promise(r => setTimeout(r, 300));
      }

      if (browser) await browser.close();
    } catch (err) {
      console.error('Browser error:', err.message);
      if (browser) await browser.close();
    }

    console.log(`\n✅ Complete: ${totalUpdated}/${pendingBets.length} bets updated\n`);

    return {
      success: true,
      updated: totalUpdated,
      total: pendingBets.length,
      results
    };

  } catch (err) {
    console.error('Fatal error:', err);
    return {
      success: false,
      error: err.message,
      updated: 0,
      total: 0
    };
  }
}

export default {
  scrapeAllResults
};
