#!/usr/bin/env node
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function extractByTabs() {
  console.log('\n🏇 Extracting races by clicking tabs...\n');

  let browser;
  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://www.sportsbetform.com.au/', { 
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    await new Promise(r => setTimeout(r, 2000));

    // Find and click all tabs
    console.log('[1] Finding tabs...');
    const tabCount = await page.evaluate(() => {
      return document.querySelectorAll('[role="tab"], button[class*="tab"], a[class*="tab"]').length;
    });

    console.log(`  Found ${tabCount} tabs\n`);

    const allRaces = new Set<string>();

    // Click each tab and extract races
    for (let i = 0; i < tabCount; i++) {
      console.log(`[2.${i + 1}] Clicking tab ${i + 1}/${tabCount}...`);

      await page.evaluate((index) => {
        const tabs = Array.from(document.querySelectorAll('[role="tab"], button[class*="tab"], a[class*="tab"]'));
        const tab = tabs[index] as HTMLElement;
        if (tab) tab.click();
      }, i);

      await new Promise(r => setTimeout(r, 1500));

      // Extract races from this tab
      const races = await page.evaluate(() => {
        const results: string[] = [];
        const seen = new Set<string>();

        // Try multiple selectors
        const selectors = [
          'a[href*="sportsbetform.com.au"][href*="/form/"]',
          'a[href*="/435"]',
          'a[href*="/394"]',
          'a[href*="/3308"]',
        ];

        for (const selector of selectors) {
          document.querySelectorAll(selector).forEach((link: HTMLAnchorElement) => {
            const href = link.href;
            if (href.match(/sportsbetform\.com\.au\/\d+\/\d+\//)) {
              if (!seen.has(href)) {
                results.push(href);
                seen.add(href);
              }
            }
          });
        }

        return results;
      });

      races.forEach(r => allRaces.add(r));
      console.log(`  Found ${races.length} races (total: ${allRaces.size})`);
    }

    await browser.close();

    // Filter to Australian tracks
    const auIds = ['435971','435950','435960','435967','435959','435951','435955','435963','435954','435966','435965','394663','435964','435957','435956'];
    const auRaces = Array.from(allRaces).filter(url => auIds.some(id => url.includes(`/${id}/`)));

    console.log(`\n✅ Total Australian races: ${auRaces.length}\n`);

    console.log('='.repeat(80));
    auRaces.sort().forEach(url => console.log(url));
    console.log('='.repeat(80));

    // Save
    const fs = await import('fs');
    fs.writeFileSync('TODAY_RACE_LINKS_ALL.txt', auRaces.join('\n'));
    console.log(`\n✓ Saved ${auRaces.length} URLs to TODAY_RACE_LINKS_ALL.txt\n`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

extractByTabs();
