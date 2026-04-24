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

    const url = 'https://www.punters.com.au/racing-results/horses/ascot-20260411/pepsi-plate-race-1/';
    console.log(`Testing ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 500));

    const results = await page.evaluate(() => {
      const horses = [];

      // Try to find result rows - likely in divs or table rows with position info
      // Looking for patterns like "1st", "2nd", etc.
      const allElements = document.querySelectorAll('*');

      let position = 1;
      for (const el of allElements) {
        const text = el.textContent || '';

        // Look for position indicators
        const posMatch = text.match(/^(1st|2nd|3rd|4th|5th|4|3|2|1)\s+/);
        if (posMatch && text.length > 10 && text.length < 300) {
          // This might be a result row
          // Try to find horse name in nearby elements
          const horseName = el.textContent
            .split('\n')
            .find(line => line.trim() && !/^(J:|T:|Time|Margin|SP|\d+\.|Win|Place|Resulted|Good)/.test(line.trim()));

          if (horseName && horseName.trim().length > 2) {
            horses.push({
              position,
              text: el.textContent.substring(0, 200)
            });
            position++;
          }
        }
      }

      return horses;
    });

    console.log('Extracted results:');
    console.log(JSON.stringify(results, null, 2));

    // Also try more direct HTML parsing
    const htmlResults = await page.evaluate(() => {
      // Look at the actual HTML structure
      const horseData = [];

      // Try finding divs with result classes
      const resultDivs = document.querySelectorAll('[class*="result"], [class*="horse"], [class*="runner"]');
      console.log('Found ' + resultDivs.length + ' potential result elements');

      // More direct: look for text that contains horse info
      const allText = document.body.innerText.split('\n');
      for (let i = 0; i < allText.length; i++) {
        const line = allText[i].trim();
        if (/^(1st|2nd|3rd|4th|5th)/.test(line)) {
          // Collect next few lines
          const chunk = allText.slice(i, i+5).join(' | ');
          horseData.push(chunk);
        }
      }

      return horseData;
    });

    console.log('\n\nDirect text parsing:');
    console.log(JSON.stringify(htmlResults, null, 2));

    await browser.close();
  } catch (err) {
    console.error('Fatal:', err);
  }
}

test();
