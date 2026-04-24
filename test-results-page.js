import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  
  const resultsUrl = 'https://www.sportsbet.com.au/racing-schedule/results/';
  console.log(`Fetching results page: ${resultsUrl}\n`);

  await page.goto(resultsUrl, { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  const bodyText = await page.evaluate(() => document.body.innerText);
  
  console.log('===== RESULTS PAGE CONTENT (first 3000 chars) =====\n');
  console.log(bodyText.substring(0, 3000));

  await browser.close();
})();
