import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import db from '../db.js';

puppeteer.use(StealthPlugin());

async function scrapePuntersJockeyTrainer() {
  console.log('🏇 Scraping Jockey & Trainer data from Punters...\n');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Get distinct races with runners from our KB
    const races = db.prepare(`
      SELECT DISTINCT r.id, r.track, r.date, r.race_number
      FROM races r
      JOIN race_runners rr ON r.id = rr.race_id
      WHERE r.track IN ('Morphettville', 'Caulfield', 'Randwick', 'Ascot', 'Doomben')
      LIMIT 20
    `).all();

    console.log(`📊 Scraping jockey/trainer for ${races.length} races\n`);

    let jockeysFound = 0;
    let trainersFound = 0;
    let linked = 0;

    for (const race of races) {
      try {
        // Build Punters race URL
        const trackSlug = race.track.toLowerCase().replace(/\s+/g, '-');
        const dateFormatted = race.date.replace(/-/g, '');
        const raceUrl = `https://www.punters.com.au/racing/${trackSlug}/race-${race.race_number}/`;

        console.log(`⏳ ${race.track} R${race.race_number}`);

        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(10000);

        try {
          await page.goto(raceUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await new Promise(r => setTimeout(r, 800));

          // Extract jockey/trainer data from race details
          const jockeyTrainerData = await page.evaluate(() => {
            const runners = [];
            const runnerElements = document.querySelectorAll('[data-test-id*="runner"]');

            // Try multiple selectors for runner info
            document.querySelectorAll('.runner-row, [class*="runner"], .form-row').forEach(row => {
              const horseName = row.querySelector('[class*="horse"], .horse-name, a[href*="horse"]')?.textContent?.trim();
              const jockey = row.querySelector('[class*="jockey"]')?.textContent?.trim();
              const trainer = row.querySelector('[class*="trainer"]')?.textContent?.trim();

              if (horseName && jockey && trainer) {
                runners.push({ horseName, jockey, trainer });
              }
            });

            return runners;
          });

          if (jockeyTrainerData.length > 0) {
            console.log(`   ✓ Found ${jockeyTrainerData.length} runners with jockey/trainer`);

            // Insert jockeys and trainers
            for (const data of jockeyTrainerData) {
              // Insert jockey
              const jockeyResult = db.prepare(`
                INSERT OR IGNORE INTO jockeys (name, strike_rate, roi)
                VALUES (?, 0.22, 0)
              `).run(data.jockey);

              if (jockeyResult.changes > 0) jockeysFound++;

              // Insert trainer
              const trainerResult = db.prepare(`
                INSERT OR IGNORE INTO trainers (name, strike_rate, roi)
                VALUES (?, 0.20, 0)
              `).run(data.trainer);

              if (trainerResult.changes > 0) trainersFound++;

              // Link to horse
              const horse = db.prepare('SELECT id FROM horses WHERE name = ?').get(data.horseName);
              const jockey = db.prepare('SELECT id FROM jockeys WHERE name = ?').get(data.jockey);
              const trainer = db.prepare('SELECT id FROM trainers WHERE name = ?').get(data.trainer);

              if (horse && jockey && trainer) {
                const updateResult = db.prepare(`
                  UPDATE race_runners
                  SET jockey_id = ?, trainer_id = ?
                  WHERE horse_id = ? AND race_id = ? AND (jockey_id IS NULL OR trainer_id IS NULL)
                `).run(jockey.id, trainer.id, horse.id, race.id);

                if (updateResult.changes > 0) linked++;
              }
            }
          } else {
            console.log(`   ⚠️ Could not extract jockey/trainer data`);
          }

          await page.close();
        } catch (pageErr) {
          console.log(`   ✗ Error: ${pageErr.message}`);
          await page.close();
        }
      } catch (raceErr) {
        console.log(`   ✗ Error: ${raceErr.message}`);
      }

      // Rate limiting delay
      const delay = 2000 + Math.random() * 2000;
      await new Promise(r => setTimeout(r, delay));
    }

    console.log(`\n✅ Complete!`);
    console.log(`   ${jockeysFound} new jockeys added`);
    console.log(`   ${trainersFound} new trainers added`);
    console.log(`   ${linked} runners linked\n`);

    await browser.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (browser) await browser.close();
  }

  process.exit(0);
}

scrapePuntersJockeyTrainer();
