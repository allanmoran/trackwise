import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import db from '../src/db.js';

puppeteer.use(StealthPlugin());

async function fetchTrackConditions() {
  let browser;
  try {
    console.log('🏇 Fetching track conditions from Sportsbet...\n');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(20000);

    // Sportsbet track conditions page
    const url = 'https://www.sportsbetform.com.au/track-conditions/';
    console.log(`📄 Fetching: ${url}\n`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (err) {
      console.log('Page load timed out, continuing anyway...');
    }

    // Wait for content to load
    await new Promise(r => setTimeout(r, 3000));

    // Extract track conditions from the page
    const conditions = await page.evaluate(() => {
      const data = {};

      // Look for track condition elements (adjust selectors based on actual page structure)
      // Common patterns: track name followed by condition (Good, Dead, Slow, Heavy, Soft, etc.)
      const elements = document.querySelectorAll('[data-track], .track-condition, .condition-status');

      for (const el of elements) {
        const trackName = el.getAttribute('data-track') || el.textContent.match(/^[A-Za-z\s]+/)?.[0];
        const condition = el.textContent.match(/(Good|Dead|Slow|Heavy|Soft|Firm|Fast|Good to Firm|Good to Soft)/i)?.[0];

        if (trackName && condition) {
          data[trackName.trim()] = condition;
        }
      }

      return data;
    });

    console.log('✅ Track Conditions Found:');
    for (const [track, condition] of Object.entries(conditions)) {
      console.log(`   ${track}: ${condition}`);
    }

    // Update database with track conditions
    if (Object.keys(conditions).length > 0) {
      console.log('\n📝 Updating database...\n');

      const today = new Date().toISOString().split('T')[0];
      let updated = 0;

      for (const [trackName, trackCondition] of Object.entries(conditions)) {
        try {
          db.prepare(`
            UPDATE races
            SET track_condition = ?
            WHERE track = ? AND date = ?
          `).run(trackCondition, trackName, today);

          updated++;
          console.log(`  ✓ ${trackName}: Set to "${trackCondition}"`);
        } catch (err) {
          console.log(`  ✗ ${trackName}: ${err.message}`);
        }
      }

      console.log(`\n✅ Updated ${updated} races with track conditions`);
    } else {
      console.log('\n⚠️ No track conditions found on page');
      console.log('   The page may require additional scrolling or JavaScript rendering');
    }

    await browser.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  process.exit(0);
}

fetchTrackConditions();
