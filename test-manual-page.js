import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  
  const testUrl = 'https://www.sportsbet.com.au/horse-racing/australia-nz/ballina/race-1-10358006';
  console.log(`Fetching: ${testUrl}\n`);

  await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2500));

  const bodyText = await page.evaluate(() => document.body.innerText);
  
  // Show first 2000 characters of body text
  console.log('===== PAGE CONTENT (first 2500 chars) =====\n');
  console.log(bodyText.substring(0, 2500));
  console.log('\n===== SEARCH FOR KEY TERMS =====');
  console.log(`Has "1st": ${bodyText.includes('1st')}`);
  console.log(`Has "Result": ${bodyText.toLowerCase().includes('result')}`);
  console.log(`Has "Finished": ${bodyText.includes('Finished')}`);
  console.log(`Has "Win": ${bodyText.includes('Win')}`);

  await browser.close();
})();
