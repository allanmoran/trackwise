#!/usr/bin/env node
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function scrapeRacesByDate(dateUrl: string) {
  let browser;
  try {
    console.log(`🔍 Scraping races from: ${dateUrl}\n`);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(dateUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Find all race links
    const raceData = await page.evaluate(() => {
      const races: any[] = [];
      const allLinks = Array.from(document.querySelectorAll('a'));
      
      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link as HTMLAnchorElement).textContent?.trim() || '';
        
        // Look for barrier patterns like "4,6,8"
        if (/^\d+,\d+/.test(text) && href.includes('sportsbetform.com.au') && href.match(/\/\d+\/\d+\/$/)) {
          races.push({ url: href, barriers: text });
        }
      }
      
      return races;
    });

    console.log(`Found ${raceData.length} races\n`);

    if (raceData.length === 0) {
      console.log('No races found. Check the page structure.\n');
      await browser.close();
      return;
    }

    const trackMap: Record<string, string> = {
      '435951': 'Alice Springs', '436088': 'Ascot', '435964': 'Ballina',
      '436054': 'Bowen', '435969': 'Caulfield', '435974': 'Hobart',
      '436045': 'Kalgoorlie', '436046': 'Rockhampton', '436050': 'Sunshine Coast',
      '436170': 'Gundagai', '436171': 'Port Augusta', '436172': 'Swan Hill',
      '436182': 'Terang', '436183': 'Wellington',
    };

    const formDataByTrack: Record<string, Record<number, Record<number, string>>> = {};
    let trackRaceCount: Record<string, number> = {};

    for (const race of raceData) {
      const match = race.url.match(/(\d+)\/(\d+)\//);
      if (!match) continue;

      const [, trackId] = match;
      const track = trackMap[trackId];
      if (!track) continue;

      if (!trackRaceCount[track]) trackRaceCount[track] = 0;
      trackRaceCount[track]++;
      const raceNum = trackRaceCount[track];

      console.log(`📍 ${track} R${raceNum} (barriers: ${race.barriers})...`);

      try {
        const racePage = await browser.newPage();
        racePage.setDefaultNavigationTimeout(20000);
        await racePage.goto(race.url, { waitUntil: 'domcontentloaded' }).catch(() => null);
        await new Promise(r => setTimeout(r, 1500));

        const barriers = await racePage.evaluate(() => {
          const result: Record<number, string> = {};
          const lines = document.body.innerText.split('\n');

          for (const line of lines) {
            const match = line.trim().match(/^(\d{1,2})\s+([A-Za-z\s\-']+?)(?:\s+[A-Z]|\s*$)/);
            if (match) {
              const barrier = parseInt(match[1]);
              const horseName = match[2].trim().replace(/\s+/g, ' ');
              
              if (horseName.length > 2 && horseName.length < 50 && barrier > 0 && barrier < 30) {
                result[barrier] = horseName;
              }
            }
          }
          return Object.keys(result).length > 0 ? result : null;
        });

        if (barriers) {
          if (!formDataByTrack[track]) formDataByTrack[track] = {};
          formDataByTrack[track][raceNum] = barriers;
          console.log(`  ✓ Got ${Object.keys(barriers).length} horses\n`);
        } else {
          console.log(`  ⚠ No barriers found\n`);
        }

        await racePage.close();
      } catch (err) {
        console.log(`  ✗ Error\n`);
      }
    }

    await browser.close();

    // Generate code
    console.log('\n' + '='.repeat(70));
    console.log('📋 ADD THIS TO settle-from-form-data.ts:\n');
    
    let code = '';
    for (const [track, races] of Object.entries(formDataByTrack).sort()) {
      code += `  '${track}': {\n`;
      for (const [raceNum, barriers] of Object.entries(races).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
        code += `    ${raceNum}: {\n`;
        for (const [barrier, horseName] of Object.entries(barriers).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
          const escaped = horseName.replace(/'/g, "\\'");
          code += `      ${barrier}: '${escaped}',\n`;
        }
        code += `    },\n`;
      }
      code += `  },\n`;
    }
    
    console.log(code);
    console.log('='.repeat(70) + '\n');

  } catch (err) {
    console.error('Fatal error:', err);
  }
}

scrapeRacesByDate(process.argv[2] || 'https://www.sportsbetform.com.au/2026-04-11/');
