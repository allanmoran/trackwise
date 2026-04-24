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

    const data = await page.evaluate(() => {
      const horseElements = Array.from(document.querySelectorAll('[class*="race-entry"]'));

      console.log(`Found ${horseElements.length} horse elements`);

      const parsed: any[] = [];

      horseElements.slice(0, 3).forEach((el, idx) => {
        const text = el.textContent || '';

        const nameMatch = text.match(/^(\d+)\.\s+([^(]+)/);
        const careerMatch = text.match(/C\s*(\d+):(\d+)-(\d+)-\d+/);

        parsed.push({
          idx,
          textLength: text.length,
          textStart: text.substring(0, 80),
          nameMatched: !!nameMatch,
          careerMatched: !!careerMatch,
          nameResult: nameMatch ? [nameMatch[1], nameMatch[2]] : null,
          careerResult: careerMatch ? [careerMatch[1], careerMatch[2], careerMatch[3]] : null,
        });
      });

      return parsed;
    });

    console.log(JSON.stringify(data, null, 2));

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
