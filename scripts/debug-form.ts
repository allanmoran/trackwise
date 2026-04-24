import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function debug() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://www.racing.com/form/2026-04-07/grafton/race/4/full-form', {
      waitUntil: 'networkidle2',
      timeout: 20000,
    }).catch(() => null);

    await new Promise(r => setTimeout(r, 2000));

    // Get ALL element classes that might contain horse data
    const allElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const classList = new Set<string>();

      // Look for elements with text containing horse name patterns
      Array.from(elements).forEach(el => {
        const text = el.textContent || '';
        // Look for numbers at start + horse name pattern
        if (text.match(/^\d+\.\s+[A-Z][a-z]+/) && text.length < 300) {
          const classes = el.className || '';
          if (classes) classList.add(classes.split(' ')[0]);
        }
      });

      return Array.from(classList).slice(0, 20);
    });

    console.log('Element classes found:', allElements);

    // Now try to find horse divs
    const horseElements = await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      const horseDivs = divs.filter(d => {
        const text = d.textContent || '';
        return text.match(/^\d+\.\s+[A-Z]/) && text.length < 500;
      });

      return horseDivs.map(d => ({
        class: d.className,
        text: d.textContent?.substring(0, 150) || '',
      }));
    });

    console.log('Horse divs found:', horseElements.length);
    horseElements.slice(0, 5).forEach((h, i) => {
      console.log(`\n[${i}] Class: ${h.class}`);
      console.log(`Text: ${h.text}`);
    });

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

debug();
