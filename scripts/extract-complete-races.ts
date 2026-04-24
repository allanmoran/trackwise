#!/usr/bin/env node
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function extract() {
  console.log('\n🏇 Extracting all Australian races (aggressive loading)...\n');

  let browser;
  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    
    console.log('[1] Loading page...');
    await page.goto('https://www.sportsbetform.com.au/', { 
      waitUntil: 'networkidle0',
      timeout: 90000,
    });

    console.log('[2] Multiple scroll passes...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2);
      });
      await new Promise(r => setTimeout(r, 1500));
    }

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 1000));

    console.log('[3] Extracting all race links...');
    const races = await page.evaluate(() => {
      const results: string[] = [];
      const seen = new Set<string>();
      
      // Get all <a> tags on page
      const links = document.querySelectorAll('a');
      
      links.forEach((link: HTMLAnchorElement) => {
        const href = link.href;
        
        // Match Sportsbet Form race pattern
        if (href.includes('sportsbetform.com.au') && 
            href.match(/\/(\d+)\/(\d+)\/$/)) {
          
          if (!seen.has(href)) {
            results.push(href);
            seen.add(href);
          }
        }
      });

      return results;
    });

    await browser.close();

    // Filter to Australian track IDs
    const auIds = ['435971','435950','435960','435967','435959','435951','435955','435963','435954','435966','435965','394663','435964','435957','435956'];
    const auRaces = races.filter(url => auIds.some(id => url.includes(`/${id}/`)));

    console.log(`\n✅ Extracted: ${auRaces.length} Australian races\n`);
    
    console.log('='.repeat(80));
    auRaces.forEach(url => console.log(url));
    console.log('='.repeat(80));

    // Save
    const fs = await import('fs');
    fs.writeFileSync('TODAY_RACE_LINKS_ALL.txt', auRaces.join('\n'));
    console.log(`\n✓ Saved to TODAY_RACE_LINKS_ALL.txt\n`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

extract();
