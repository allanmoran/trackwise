import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import db from '../src/db.js';

puppeteer.use(StealthPlugin());

async function loadTodaysRaces() {
  let browser;
  try {
    console.log('🏇 Loading today\'s races from Punters form guide...\n');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(20000);

    const url = 'https://www.punters.com.au/form-guide/';
    console.log(`📄 Fetching: ${url}\n`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (err) {
      console.log('Page load timed out, continuing anyway...');
    }

    await new Promise(r => setTimeout(r, 3000));

    // Extract all race information from the page
    const races = await page.evaluate(() => {
      const raceData = [];
      const seen = new Set();

      // Look for race links
      const links = Array.from(document.querySelectorAll('a[href*="/form-guide/"]'));

      for (const link of links) {
        const href = link.href;
        const displayText = link.textContent.trim();

        // Skip links with just numbers (odds) - we want actual race names
        if (/^\d+(?:\s*,\s*\d+)*$/.test(displayText)) {
          continue;
        }

        // Extract date, track, race from URL
        // Format: /form-guide/horses/{track-slug}-{date}/{race-slug}
        const match = href.match(/form-guide\/horses\/([a-z-]+)-(\d{4})(\d{2})(\d{2})\/([a-z0-9-]+)/i);

        if (match) {
          const trackSlug = match[1];
          const date = `${match[2]}-${match[3]}-${match[4]}`;
          const raceSlug = match[5];

          // Format track name from slug
          const trackName = trackSlug
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

          // Extract race number from slug (e.g., "race-1" -> 1, or "pepsi-plate-race-1" -> 1)
          const numMatch = raceSlug.match(/race[- ]?(\d+)/i);
          const raceNum = numMatch ? parseInt(numMatch[1]) : null;

          // Extract race name: remove "R{num}" prefix if present (e.g., "R1Pepsi Plate" -> "Pepsi Plate")
          let raceName = displayText.replace(/^R\d+/, '').trim();

          if (raceNum && !seen.has(`${date}|${trackName}|${raceNum}`)) {
            raceData.push({
              date,
              trackName,
              trackSlug,
              raceNum,
              raceName: raceName || `Race ${raceNum}`,
              raceSlug,
              href
            });
            seen.add(`${date}|${trackName}|${raceNum}`);
          }
        }
      }

      return raceData;
    });

    console.log(`✅ Found ${races.length} races\n`);

    if (races.length === 0) {
      console.log('⚠️ No races found on the form guide page');
      await browser.close();
      return;
    }

    // Group by track
    const byTrack = {};
    for (const race of races) {
      if (!byTrack[race.trackName]) {
        byTrack[race.trackName] = [];
      }
      byTrack[race.trackName].push(race);
    }

    console.log('📊 Races by track:');
    for (const [track, trackRaces] of Object.entries(byTrack)) {
      console.log(`\n  ${track}: ${trackRaces.length} races`);
      trackRaces.forEach(r => {
        console.log(`    R${r.raceNum}: ${r.raceName}`);
      });
    }

    // Update or insert races into database
    console.log('\n📝 Updating database...\n');

    const insertStmt = db.prepare(`
      INSERT INTO races (track, date, race_number, race_name)
      VALUES (?, ?, ?, ?)
    `);

    const updateStmt = db.prepare(`
      UPDATE races SET race_name = ? WHERE track = ? AND date = ? AND race_number = ?
    `);

    let inserted = 0;
    let updated = 0;

    for (const race of races) {
      const checkStmt = db.prepare(`
        SELECT id FROM races WHERE track = ? AND date = ? AND race_number = ?
      `);

      const existing = checkStmt.get(race.trackName, race.date, race.raceNum);

      try {
        if (existing) {
          updateStmt.run(race.raceName, race.trackName, race.date, race.raceNum);
          updated++;
          console.log(`  ✓ ${race.trackName} R${race.raceNum}: Updated race name`);
        } else {
          insertStmt.run(race.trackName, race.date, race.raceNum, race.raceName);
          inserted++;
          console.log(`  ✓ ${race.trackName} R${race.raceNum}: Added new race`);
        }
      } catch (err) {
        console.log(`  ✗ ${race.trackName} R${race.raceNum}: ${err.message}`);
      }
    }

    console.log(`\n✅ Complete!`);
    console.log(`   ${inserted} new races added`);
    console.log(`   ${updated} race names updated`);

    // Show summary
    const summary = db.prepare(`
      SELECT track, COUNT(*) as count
      FROM races
      WHERE date = ?
      GROUP BY track
      ORDER BY track
    `).all(races[0]?.date);

    console.log('\n📊 Database now contains:');
    for (const row of summary) {
      console.log(`   ${row.track}: ${row.count} races`);
    }

    await browser.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  process.exit(0);
}

loadTodaysRaces();
