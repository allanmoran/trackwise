#!/usr/bin/env node
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function scrapeRaces(urls: string[]) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const formData: Record<string, Record<number, Record<number, string>>> = {};
    
    const trackMap: Record<string, string> = {
      '435639': 'Geraldton',
      '435951': 'Alice Springs',
      '436088': 'Ascot',
      '435964': 'Ballina',
      '436054': 'Bowen',
      '435969': 'Caulfield',
      '435974': 'Hobart',
      '436045': 'Kalgoorlie',
      '436046': 'Rockhampton',
      '436050': 'Sunshine Coast',
      '436170': 'Gundagai',
      '436171': 'Port Augusta',
      '436172': 'Swan Hill',
      '436182': 'Terang',
      '436183': 'Wellington',
    };

    for (const url of urls) {
      console.log(`\n🔍 Scraping: ${url}`);
      
      const match = url.match(/\/(\d+)\/(\d+)\//);
      if (!match) {
        console.log('  ✗ Could not parse URL\n');
        continue;
      }

      const [, trackId] = match;
      const track = trackMap[trackId];
      if (!track) {
        console.log(`  ✗ Unknown track ID: ${trackId}\n`);
        continue;
      }

      try {
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(20000);
        await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => null);
        await new Promise(r => setTimeout(r, 1500));

        const pageInfo = await page.evaluate(() => {
          return {
            title: document.title,
            text: document.body.innerText
          };
        });

        const titleMatch = pageInfo.title.match(/Race\s+(\d+)/i);
        const raceNum = titleMatch ? parseInt(titleMatch[1]) : 0;

        if (!raceNum) {
          console.log('  ✗ Could not extract race number from title\n');
          await page.close();
          continue;
        }

        const barriers = await page.evaluate(() => {
          const result: Record<number, string> = {};
          const lines = document.body.innerText.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z\s\-']+?)(?:\s+[A-Z]|\s*$)/);
            if (match) {
              const barrier = parseInt(match[1]);
              let horseName = match[2].trim().replace(/\s+/g, ' ');
              
              if (horseName.includes('day since') || horseName.includes('days since')) {
                continue;
              }
              
              if (horseName.length > 2 && horseName.length < 50 && barrier > 0 && barrier < 30) {
                result[barrier] = horseName;
              }
            }
          }

          return Object.keys(result).length > 0 ? result : null;
        });

        if (barriers) {
          if (!formData[track]) formData[track] = {};
          formData[track][raceNum] = barriers;
          console.log(`  ✓ ${track} R${raceNum}: ${Object.keys(barriers).length} horses`);
        } else {
          console.log(`  ⚠ No barriers extracted\n`);
        }

        await page.close();
      } catch (err) {
        console.log(`  ✗ Error: ${(err as any).message?.substring(0, 50)}\n`);
      }
    }

    await browser.close();

    console.log('\n' + '='.repeat(70));
    console.log('📋 ADD THIS TO settle-from-form-data.ts formData:\n');
    
    for (const [track, races] of Object.entries(formData).sort()) {
      console.log(`  '${track}': {`);
      for (const [raceNum, barriers] of Object.entries(races).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
        console.log(`    ${raceNum}: {`);
        for (const [barrier, horseName] of Object.entries(barriers).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
          const escaped = horseName.replace(/'/g, "\\'");
          console.log(`      ${barrier}: '${escaped}',`);
        }
        console.log(`    },`);
      }
      console.log(`  },`);
    }
    
    console.log('='.repeat(70) + '\n');

  } catch (err) {
    console.error('Fatal error:', err);
  }
}

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.log('Usage: npx tsx scrape-specific-races.ts <url1> <url2> ...');
  process.exit(1);
}

scrapeRaces(urls);
