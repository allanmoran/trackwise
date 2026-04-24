import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function inspect() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    console.log('Loading racing.com form page...');
    await page.goto('https://www.racing.com/form/2026-04-07/grafton/race/4/full-form', {
      waitUntil: 'networkidle2',
      timeout: 20000,
    }).catch(e => console.warn('Load warning:', e.message));

    // Wait for content
    await new Promise(r => setTimeout(r, 2000));

    // Get visible text
    const bodyText = await page.evaluate(() => document.body.innerText);

    console.log('\n=== PAGE TEXT (first 800 chars) ===');
    console.log(bodyText.substring(0, 800));

    // Check for common selectors
    const selectors = {
      tabRows: await page.$$('[role="row"]'),
      divRows: await page.$$('[class*="row"]'),
      tables: await page.$$('table'),
      trElements: await page.$$('tr'),
    };

    console.log('\n=== DOM Elements Found ===');
    console.log(`[role="row"]: ${selectors.tabRows.length}`);
    console.log(`[class*="row"]: ${selectors.divRows.length}`);
    console.log(`<table>: ${selectors.tables.length}`);
    console.log(`<tr>: ${selectors.trElements.length}`);

    // Try to extract horse data
    const horseData = await page.evaluate(() => {
      const results: any[] = [];

      // Try different selector patterns
      const patterns = [
        'tr td',
        '[role="row"] > *',
        '[class*="runner"]',
        '[class*="horse"]',
        '[class*="form-row"]',
        '.runner-row td',
      ];

      for (const pattern of patterns) {
        const elements = document.querySelectorAll(pattern);
        if (elements.length > 0) {
          console.log(`Pattern "${pattern}" found ${elements.length} elements`);
          // Get first few items
          Array.from(elements).slice(0, 6).forEach(el => {
            const text = el.textContent?.trim() || '';
            if (text.length > 0 && text.length < 100) {
              results.push({ pattern, text });
            }
          });
        }
      }

      return results;
    });

    console.log('\n=== Extracted Data Samples ===');
    horseData.slice(0, 15).forEach(item => {
      console.log(`[${item.pattern}] ${item.text}`);
    });

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

inspect();
