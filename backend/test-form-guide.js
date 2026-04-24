import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function scrapeFormGuide() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000);

    const url = 'https://www.punters.com.au/form-guide/';
    console.log(`Fetching: ${url}\n`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    const races = await page.evaluate(() => {
      const raceData = [];

      // Look for race links in the form guide
      const links = Array.from(document.querySelectorAll('a[href*="/form-guide/"]'));

      for (const link of links) {
        const href = link.href;
        const text = link.textContent.trim();

        // Extract date, track, race from URL
        // Format: /form-guide/{date}/{track}/{race}/
        const match = href.match(/form-guide\/(\d{4})-(\d{2})-(\d{2})\/([a-z-]+)\/([a-z0-9-]+)\//i);

        if (match && match[1] === '2026' && match[2] === '04' && match[3] === '11') {
          const date = `${match[1]}-${match[2]}-${match[3]}`;
          const track = match[4];
          const race = match[5];

          raceData.push({
            date,
            track: track.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            race,
            displayText: text,
            href: href.substring(0, 80) + '...'
          });
        }
      }

      return raceData;
    });

    console.log(`Found ${races.length} races for 2026-04-11:\n`);

    // Group by track
    const byTrack = {};
    for (const race of races) {
      if (!byTrack[race.track]) {
        byTrack[race.track] = [];
      }
      byTrack[race.track].push(race);
    }

    for (const [track, trackRaces] of Object.entries(byTrack)) {
      console.log(`\n📍 ${track}:`);
      trackRaces.forEach((race, i) => {
        console.log(`   R${i+1}: ${race.displayText}`);
      });
    }

    console.log(`\n✅ Total: ${races.length} races`);

    await browser.close();
  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

scrapeFormGuide();
