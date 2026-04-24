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
    const url = 'https://www.punters.com.au/racing-results/horses/ascot-20260411/pepsi-plate-race-1/';

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await new Promise(r => setTimeout(r, 500));

    // Get raw HTML
    const html = await page.content();

    // Look for horse data in JSON or data attributes
    const jsonMatches = html.match(/{"[^}]*horse[^}]*"/gi);
    if (jsonMatches) {
      console.log('Found ' + jsonMatches.length + ' JSON-like matches with "horse"');
    }

    // Look for script tags with data
    const scriptMatches = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
    console.log('Found ' + (scriptMatches ? scriptMatches.length : 0) + ' script tags');

    // Try to find horse names with regex
    const namePattern = /(?:horse|runner|name)["\']?\s*:\s*["\']([^"\']+)["\']/gi;
    let match;
    const horses = [];
    while ((match = namePattern.exec(html)) !== null) {
      horses.push(match[1]);
    }

    console.log('\nPossible horse names from JSON fields:');
    console.log(horses.slice(0, 20));

    // Also try looking at DOM structure
    const structure = await page.evaluate(() => {
      // Get all links that might contain horse names
      const links = Array.from(document.querySelectorAll('a')).map(a => ({
        text: a.textContent.substring(0, 50),
        href: a.href
      }));

      // Get all elements with specific classes
      const horses = Array.from(document.querySelectorAll('[class*="horse"], [class*="runner"], [class*="result"]')).map(el => ({
        class: el.className,
        text: el.textContent.substring(0, 100)
      }));

      return { links, horses };
    });

    console.log('\n\nDOM structure:');
    console.log(JSON.stringify(structure, null, 2).substring(0, 500));

    await browser.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
