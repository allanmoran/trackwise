import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function test() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://www.racing.com/form/2026-04-07/grafton/race/4/full-form', {
      waitUntil: 'networkidle2',
      timeout: 20000,
    }).catch(() => null);

    await new Promise(r => setTimeout(r, 2000));

    const results = await page.evaluate(() => {
      const selectors = [
        '[class*="table-row"]',
        '[class*="race-entry"]',
        '[class*="horse-detail"]',
        'div[role="row"]',
        'div[class*="entry"]',
        'div[class*="row"]',
      ];

      const output: any = {};

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        const samples = [];

        Array.from(elements).slice(0, 2).forEach(el => {
          const text = (el.textContent || '').substring(0, 100);
          samples.push(text);
        });

        output[selector] = {
          count: elements.length,
          samples,
        };
      }

      return output;
    });

    console.log(JSON.stringify(results, null, 2));

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
