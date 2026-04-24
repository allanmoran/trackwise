#!/usr/bin/env node
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function extract() {
  let browser;
  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    console.log('[1] Loading sportsbetform.com.au...');
    await page.goto('https://www.sportsbetform.com.au/', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    console.log('[2] Waiting for page to settle...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('[3] Extracting all race links...');
    const races = await page.evaluate(() => {
      const results: {url: string, text: string}[] = [];
      
      // Get all <a> tags
      const allLinks = document.querySelectorAll('a');
      console.log(`Found ${allLinks.length} links total`);
      
      allLinks.forEach((link: HTMLAnchorElement) => {
        const href = link.href;
        const text = link.innerText || link.textContent || '';
        
        // Look for sportsbetform URLs with /form/ pattern
        if (href.includes('sportsbetform.com.au') && href.includes('/form/')) {
          results.push({url: href, text: text.trim()});
        }
      });
      
      return results;
    });

    console.log(`[4] Found ${races.length} race links\n`);

    // Filter Australian track IDs
    const auIds = ['435971','435950','435960','435967','435959','435951','435955','435963','435954','435966','435965','394663','435964','435957','435956'];
    const auRaces = races.filter(r => auIds.some(id => r.url.includes(`/${id}/`)));

    console.log(`✅ Australian races: ${auRaces.length}\n`);
    
    auRaces.forEach(r => console.log(r.url));

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

extract();
