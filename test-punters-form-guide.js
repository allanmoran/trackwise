import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fetch from 'node-fetch';

puppeteer.use(StealthPlugin());

async function testPage() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(10000);

    // Try a form-guide URL (based on older approach)
    const raceUrl = 'https://www.punters.com.au/form-guide/horses/ascot-20260411/race-1/';
    console.log(`Testing form-guide URL: ${raceUrl}\n`);

    try {
      await page.goto(raceUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await new Promise(r => setTimeout(r, 1000));

      const csvUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*=".csv"]'));
        return links.length > 0 ? links[0].href : null;
      });

      if (csvUrl) {
        console.log('✓ CSV URL found:', csvUrl);
        
        // Download and inspect CSV
        const resp = await fetch(csvUrl);
        const csv = await resp.text();
        const lines = csv.split('\n').slice(0, 5);
        console.log('\nCSV header and first 3 rows:');
        lines.forEach(line => console.log(line.substring(0, 150)));
      } else {
        console.log('⚠️ No CSV link found');
      }
    } catch (err) {
      console.log(`⚠️ Form-guide URL error: ${err.message}`);
    }

    // Try Punters race betting odds page
    const betUrl = 'https://www.punters.com.au/odds/racing/ascot';
    console.log(`\nTesting betting odds URL: ${betUrl}\n`);

    await page.goto(betUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));

    const raceInfo = await page.evaluate(() => {
      // Look for race cards with runner info
      const runners = [];
      
      // Try different selectors
      document.querySelectorAll('[class*="race"], [data-test*="race"]').forEach(el => {
        const text = el.textContent;
        if (text.includes('R') || text.includes('Race')) {
          runners.push(text.substring(0, 200));
        }
      });
      
      return runners.slice(0, 5);
    });

    console.log('Race info found:', raceInfo.length, 'elements');
    raceInfo.forEach(info => console.log(info));

    await page.close();
    await browser.close();
  } catch (err) {
    console.error('Fatal error:', err.message);
  }
  process.exit(0);
}

testPage();
