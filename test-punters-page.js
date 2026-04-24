import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function testPage() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(10000);

    const raceUrl = 'https://www.punters.com.au/racing/ascot/race-1/';
    console.log(`Testing URL: ${raceUrl}\n`);

    await page.goto(raceUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));

    // Get page content and log relevant parts
    const pageContent = await page.evaluate(() => {
      // Log all divs with data-test or runner in class
      const elements = document.querySelectorAll('[class*="runner"], [data-test*="runner"], .runner-row');
      console.log(`Found ${elements.length} runner elements`);
      
      // Get a sample of the HTML structure
      const html = document.documentElement.outerHTML;
      const lines = html.split('\n');
      
      // Find lines with jockey or trainer
      const relevant = lines.filter((l, idx) => 
        (l.toLowerCase().includes('jockey') || l.toLowerCase().includes('trainer')) && idx < 5000
      ).slice(0, 20);
      
      return {
        foundElements: elements.length,
        sampleHTML: relevant,
        title: document.title
      };
    });

    console.log('Page Title:', pageContent.title);
    console.log('Found runner elements:', pageContent.foundElements);
    console.log('\nSample HTML lines with jockey/trainer:');
    pageContent.sampleHTML.forEach(line => {
      console.log(line.substring(0, 200));
    });

    await page.close();
    await browser.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

testPage();
