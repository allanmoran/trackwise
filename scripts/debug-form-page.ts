import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function debugPage(url: string) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        allLinks: Array.from(document.querySelectorAll('a')).slice(0, 10).map(a => ({
          text: (a as HTMLAnchorElement).textContent?.substring(0, 50),
          href: (a as HTMLAnchorElement).href?.substring(0, 100)
        })),
        bodyText: document.body.innerText?.substring(0, 500)
      };
    });

    console.log('Page Title:', pageInfo.title);
    console.log('\nFirst 10 Links:');
    pageInfo.allLinks.forEach((link, i) => {
      console.log(`  ${i+1}. "${link.text}" -> ${link.href}`);
    });
    console.log('\nBody Text (first 500 chars):');
    console.log(pageInfo.bodyText);

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

debugPage('https://www.sportsbetform.com.au/2026-04-11/');
