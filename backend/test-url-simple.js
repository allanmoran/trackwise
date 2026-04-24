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
    page.setDefaultNavigationTimeout(20000);
    page.setDefaultTimeout(20000);

    const url = 'https://www.punters.com.au/racing-results/horses/alice-springs-20260411/ladbrokes-big-bets-handicap-race-1/';
    console.log(`Testing: ${url}\n`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (err) {
      console.log(`Goto failed with ${err.message}, trying anyway...`);
    }

    await new Promise(r => setTimeout(r, 1000));

    const pageTitle = await page.title();
    const bodyLength = await page.evaluate(() => document.body.innerText.length);

    console.log(`Page title: ${pageTitle}`);
    console.log(`Body length: ${bodyLength}`);

    if (bodyLength > 0) {
      console.log('✅ Page loaded successfully\n');

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
            horses.push({
              position,
              horseName,
              placing: position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS'
            });
            position++;
            if (position > 9) break;
          }
        }
        return horses;
      });

      console.log('Results:');
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log('❌ Page body is empty');
    }

    await browser.close();
  } catch (err) {
    console.error('Fatal error:', err.message);
  }

  process.exit(0);
}

test();
