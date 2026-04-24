import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function scrapeFormBarriers(url: string) {
  let browser;
  try {
    console.log('Scraping:', url);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 2000));

    const barriers = await page.evaluate(() => {
      const result: Record<number, string> = {};
      const bodyText = document.body.innerText;
      const lines = bodyText.split('\n');

      console.log('Total lines:', lines.length);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Try to match barrier patterns
        const match = line.match(/^(\d{1,2})\s+([A-Za-z\s\-']+?)(?:\s+[A-Z]|\s*$)/);
        if (match) {
          const barrier = parseInt(match[1]);
          let horseName = match[2].trim()
            .replace(/\s+/g, ' ')
            .trim();

          if (horseName.length > 2 && horseName.length < 50 && barrier > 0 && barrier < 30) {
            result[barrier] = horseName;
          }
        }
      }

      return result;
    });

    await browser.close();
    return barriers;
  } catch (err) {
    console.error('Error:', err);
    if (browser) await browser.close();
    return {};
  }
}

scrapeFormBarriers('https://www.sportsbetform.com.au/435951/3308201/').then(result => {
  console.log('\nExtracted barriers:', result);
  console.log('Total horses:', Object.keys(result).length);
  process.exit(0);
});
