import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function test() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    const url = 'https://www.punters.com.au/racing-results/horses/alice-springs-20260411/ladbrokes-big-bets-handicap-race-1/';

    console.log(`Testing: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await new Promise(r => setTimeout(r, 500));

    const results = await page.evaluate(() => {
      const horses = [];
      const html = document.documentElement.outerHTML;

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
          if (position > 10) break;
        }
      }

      return horses;
    });

    console.log('\nExtracted results:');
    console.log(JSON.stringify(results, null, 2));

    await browser.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
