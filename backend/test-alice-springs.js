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
    // Format: /racing-results/horses/{track}-{YYYYMMDD}/{race-slug}/
    const url = 'https://www.punters.com.au/racing-results/horses/alice-springs-20260411/alice-springs-r1/';

    console.log(`Testing: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(e => console.log('Goto error:', e.message));
    await new Promise(r => setTimeout(r, 500));

    const content = await page.evaluate(() => ({
      title: document.title,
      bodyLength: document.body.innerText.length,
      firstPart: document.body.innerText.substring(0, 300),
    }));

    console.log(JSON.stringify(content, null, 2));
    await browser.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
