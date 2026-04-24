import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import db from '../src/db.js';

puppeteer.use(StealthPlugin());

async function scrapeSportsbetForm() {
  let browser;
  try {
    console.log('🏇 Scraping Sportsbet Form Guide for today\'s races...\n');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    const url = 'https://www.sportsbetform.com.au/';
    console.log(`📄 Fetching: ${url}\n`);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (err) {
      console.log('⚠️  Page load timed out, continuing anyway...');
    }

    // Wait for content to render
    await new Promise(r => setTimeout(r, 5000));

    // Extract all races and runners from the page
    const races = await page.evaluate(() => {
      const raceData = [];

      // Find each track section
      const trackElements = document.querySelectorAll('[data-track], .track-section, h2, h3');

      let currentTrack = '';
      let currentRaceNum = 0;

      for (const el of trackElements) {
        const text = el.textContent?.trim() || '';

        // Detect track name (usually in heading)
        if (text && /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(text) && text.length > 3) {
          currentTrack = text;
          currentRaceNum = 0;
          console.log(`Found track: ${currentTrack}`);
          continue;
        }

        // Find race rows (usually in tables or divs with runner info)
        const raceRows = el.querySelectorAll('tr, [data-race], .race-row');

        for (const row of raceRows) {
          const cells = row.querySelectorAll('td, div');
          if (cells.length < 3) continue;

          const runners = [];
          let raceTime = '';
          let raceNum = '';

          // Extract data from cells
          for (let i = 0; i < cells.length; i++) {
            const cellText = cells[i].textContent?.trim() || '';

            // Race number/time
            if (!raceNum && /^R?\d+$/.test(cellText)) {
              raceNum = cellText.replace('R', '');
            }

            // Race time (HH:MM format)
            if (!raceTime && /^\d{2}:\d{2}$/.test(cellText)) {
              raceTime = cellText;
            }

            // Runner info (barrier, horse name, jockey, odds)
            // Look for patterns with numbers and text
            if (cells[i].querySelector('[data-barrier], .barrier, .runner')) {
              const runner = {
                barrier: cells[i].textContent?.match(/\d+/)?.[0],
                horse: cells[i].textContent?.match(/[A-Z][a-z\s]+/)?.[0],
                jockey: '',
                trainer: '',
                odds: cells[i].textContent?.match(/\d+\.\d+/)?.[0],
              };

              if (runner.horse) {
                runners.push(runner);
              }
            }
          }

          if (runners.length > 0 && currentTrack) {
            raceData.push({
              track: currentTrack,
              raceNum: raceNum || ++currentRaceNum,
              raceTime,
              runners
            });
          }
        }
      }

      return raceData;
    });

    console.log(`\n✅ Found ${races.length} races\n`);

    if (races.length === 0) {
      console.log('⚠️  No races extracted. The page structure may be different.');
      console.log('   Try visiting the URL directly to see the current format.');
      await browser.close();
      process.exit(0);
    }

    // Show sample races
    console.log('📊 Sample races found:');
    races.slice(0, 3).forEach(r => {
      console.log(`   ${r.track} Race ${r.raceNum}: ${r.runners.length} runners`);
    });

    console.log('\n📝 Updating database...\n');

    const today = new Date().toISOString().split('T')[0];
    let raceInserted = 0;
    let runnerInserted = 0;

    for (const race of races) {
      try {
        // Insert or get race
        const checkRace = db.prepare(`
          SELECT id FROM races WHERE track = ? AND date = ? AND race_number = ?
        `).get(race.track, today, race.raceNum);

        let raceId;

        if (checkRace) {
          raceId = checkRace.id;
          db.prepare(`
            UPDATE races SET race_time = ? WHERE id = ?
          `).run(race.raceTime, raceId);
        } else {
          const result = db.prepare(`
            INSERT INTO races (track, date, race_number, race_time)
            VALUES (?, ?, ?, ?)
          `).run(race.track, today, race.raceNum, race.raceTime);
          raceId = result.lastInsertRowid;
          raceInserted++;
        }

        // Insert runners
        for (const runner of race.runners) {
          try {
            // Find or create horse
            let horse = db.prepare('SELECT id FROM horses WHERE name = ?').get(runner.horse);
            let horseId;

            if (!horse) {
              const horseResult = db.prepare(`
                INSERT INTO horses (name, strike_rate, place_rate, roi, class_rating, avg_odds)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(runner.horse, 0.15, 0.30, -0.2, 50, runner.odds || 5.0);
              horseId = horseResult.lastInsertRowid;
            } else {
              horseId = horse.id;
            }

            // Check if runner already exists
            const checkRunner = db.prepare(`
              SELECT id FROM race_runners
              WHERE race_id = ? AND horse_id = ? AND barrier = ?
            `).get(raceId, horseId, runner.barrier);

            if (!checkRunner) {
              db.prepare(`
                INSERT INTO race_runners (race_id, horse_id, barrier, starting_odds)
                VALUES (?, ?, ?, ?)
              `).run(raceId, horseId, runner.barrier, runner.odds || 0);
              runnerInserted++;
            }
          } catch (err) {
            console.log(`     ⚠️  Runner ${runner.horse}: ${err.message}`);
          }
        }

        console.log(`  ✓ ${race.track} R${race.raceNum}: ${race.runners.length} runners added`);
      } catch (err) {
        console.log(`  ✗ ${race.track} R${race.raceNum}: ${err.message}`);
      }
    }

    console.log(`\n✅ Complete!`);
    console.log(`   ${raceInserted} new races inserted`);
    console.log(`   ${runnerInserted} new runners inserted`);

    await browser.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  process.exit(0);
}

scrapeSportsbetForm();
