import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import db from '../src/db.js';

puppeteer.use(StealthPlugin());

async function scrapeRaceNames() {
  let browser;
  try {
    console.log('🏇 Scraping race names from Punters...\n');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Get racing results page which lists all races for the day
    const url = 'https://www.punters.com.au/racing-results/';
    console.log(`📄 Fetching racing results page...\n`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 1000));

    // Extract all race result links
    const races = await page.evaluate(() => {
      const raceData = [];
      const links = Array.from(document.querySelectorAll('a[href*="/racing-results/horses/"]'));

      for (const link of links) {
        const href = link.href;
        // URL format: /racing-results/horses/{track-slug}-{YYYYMMDD}/{race-name-slug}/
        const match = href.match(/racing-results\/horses\/([a-z-]+)-(\d{8})\/([a-z-0-9-]+)\//);

        if (match) {
          const trackSlug = match[1];
          const dateStr = match[2]; // YYYYMMDD
          const raceSlug = match[3];
          const displayText = link.textContent.trim();

          // Extract race number from display text or slug
          let raceNum = null;
          const numMatch = displayText.match(/R(?:ace\s+)?(\d+)/i) || raceSlug.match(/race[- ]?(\d+)/i);
          if (numMatch) {
            raceNum = parseInt(numMatch[1]);
          }

          if (raceNum && dateStr === '20260411') {
            raceData.push({
              trackSlug,
              trackName: trackSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
              dateStr,
              raceNum,
              raceName: displayText,
              raceSlug,
              href
            });
          }
        }
      }

      return raceData;
    });

    console.log(`✅ Found ${races.length} races\n`);

    if (races.length === 0) {
      console.log('⚠️ No races found on main page. Trying individual track pages...\n');
      await browser.close();
      return;
    }

    // Update database
    console.log('📝 Updating database:\n');

    const updateStmt = db.prepare(`
      UPDATE races
      SET race_name = ?
      WHERE track = ? AND date = '2026-04-11' AND race_number = ?
    `);

    let updated = 0;
    for (const race of races) {
      // Replace any existing race name with the actual name from Punters
      const result = updateStmt.run(race.raceName, race.trackName, race.raceNum);
      if (result.changes > 0) {
        console.log(`  ✅ ${race.trackName} R${race.raceNum}: "${race.raceName}"`);
        updated++;
      }
    }

    console.log(`\n✅ Updated ${updated} race names in database`);

    // Show summary
    const racesSummary = db.prepare(`
      SELECT track, COUNT(*) as count
      FROM races
      WHERE date = '2026-04-11' AND race_name IS NOT NULL AND race_name != ''
      GROUP BY track
    `).all();

    console.log('\n📊 Race names by track:');
    for (const summary of racesSummary) {
      console.log(`  ${summary.track}: ${summary.count} races`);
    }

    await browser.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  process.exit(0);
}

scrapeRaceNames();
