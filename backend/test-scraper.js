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
    page.setDefaultNavigationTimeout(8000);

    const urls = [
      'https://www.racing.com/form/2026-04-11/ascot/race/1',
      'https://www.tab.com.au/racing/2026-04-11/ASCOT/ASC/R/1',
      'https://www.punters.com.au/racing-results/horses/ascot-20260411/pepsi-plate-race-1/',
    ];

    for (const url of urls) {
      console.log(`\n\n=== Testing ${url} ===`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
        await new Promise(r => setTimeout(r, 500));

        const content = await page.evaluate(() => {
          return {
            title: document.title,
            url: window.location.href,
            bodyLength: document.body.innerText.length,
            firstParagraph: document.body.innerText.substring(0, 500),
            hasResult: document.body.innerText.includes('Result') || document.body.innerText.includes('RESULT'),
          };
        });

        console.log(JSON.stringify(content, null, 2));
      } catch (err) {
        console.error('Error:', err.message);
      }
    }

    await browser.close();
  } catch (err) {
    console.error('Fatal:', err);
  }
}

test();
