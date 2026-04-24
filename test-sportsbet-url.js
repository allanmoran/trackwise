import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Try different Sportsbet URL formats
  const urls = [
    'https://www.sportsbet.com.au/horse-racing/australia-nz/alice-springs/race-1',
    'https://www.sportsbet.com.au/horse-racing/australia-nz/alice-springs',
    'https://www.sportsbet.com.au/horse-racing/',
    'https://www.sportsbet.com.au/',
  ];

  for (const url of urls) {
    try {
      console.log(`\nTesting: ${url}`);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      console.log(`  Status: ${response.status()}`);
      const title = await page.title();
      console.log(`  Title: ${title.substring(0, 60)}`);
      const pageUrl = await page.url();
      console.log(`  Final URL: ${pageUrl.substring(0, 80)}`);
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  await browser.close();
})();
