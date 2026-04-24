/**
 * scripts/real-races-fetcher.ts
 * Fetches REAL race data from TAB.com.au (most reliable source)
 * NO mock data - only actual races happening today (AUS/NZ only)
 */

import puppeteer, { Browser } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export interface RaceInfo {
  track: string;
  raceNum: number;
  raceName: string;
  raceTime: string;
  horses: Array<{
    name: string;
    odds: number;
  }>;
}

// AUS/NZ track names (full names as returned by TAB)
const AUSTZ_TRACKS = new Set([
  // Queensland
  'EAGLE FARM', 'GOLD COAST', 'SUNSHINE COAST', 'DOOMBEN', 'ALBION PARK', 'CAPALABA', 'CALOUNDRA',
  // Victoria
  'MOONEE VALLEY', 'FLEMINGTON', 'PAKENHAM', 'SANDOWN', 'CAULFIELD', 'GEELONG', 'HEALESVILLE', 'SALE', 'BALLARAT', 'BENDIGO',
  // NSW
  'RANDWICK', 'ROSEHILL', 'WARWICK FARM', 'BATHURST', 'KEMBLA', 'WYONG', 'GRAFTON', 'HAMILTON', 'NEWCASTLE',
  // Western Australia
  'ASCOT', 'PERTH', 'BELMONT', 'BUNBURY',
  // South Australia
  'MORPHETTVILLE', 'FORESTVILLE', 'MURRAY BRIDGE', 'MURRAY BRIDGE STRAIGHT',
  // Tasmania
  'HOBART', 'LAUNCESTON',
  // New Zealand
  'AVONDALE', 'CAMBRIDGE', 'MATAMATA', 'WELLINGTON', 'HASTINGS', 'SUMMERLAND', 'RUAKAKA', 'AWAPUNI', 'ASCOT PARK',
]);

export async function fetchRealRaces(): Promise<RaceInfo[]> {
  let browser: Browser | null = null;
  const allRaces: RaceInfo[] = [];

  try {
    console.log('\n═══ FETCHING REAL RACES FROM TAB.COM.AU ═══\n');

    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Load TAB today's racing
    console.log('[TAB] Loading today\'s racing page...');
    await page.goto('https://www.tab.com.au/racing/meetings/today/R', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for race links to load
    await new Promise(r => setTimeout(r, 2000));

    // Extract all race links for today
    const raceLinks = await page.evaluate(() => {
      const results: Array<{
        track: string;
        trackCode: string;
        raceNum: number;
        href: string;
        time: string;
      }> = [];

      const links = document.querySelectorAll('a[href*="/racing/"]');
      const seen = new Set<string>();

      links.forEach((link) => {
        const href = link.getAttribute('href') || '';
        const text = link.textContent?.trim() || '';

        // Match: /racing/YYYY-MM-DD/TRACK/CODE/R/N
        const match = href.match(/\/racing\/\d{4}-\d{2}-\d{2}\/([A-Z\s]+?)\/([A-Z]+)\/R\/(\d+)/);

        if (match && text) {
          const [, trackName, trackCode, raceNum] = match;
          const key = `${trackName}_R${raceNum}`;

          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              track: trackName.trim(),
              trackCode: trackCode.trim(),
              raceNum: parseInt(raceNum),
              href,
              time: text.match(/(\d+h\s+\d+m|\d+m\s+\d+s)/)?.[0] || '',
            });
          }
        }
      });

      return results;
    });

    console.log(`[TAB] Found ${raceLinks.length} race links`);

    // Filter to AUS/NZ only (by track name)
    const ausNzRaces = raceLinks.filter(r => AUSTZ_TRACKS.has(r.track));
    console.log(`[TAB] Filtered to ${ausNzRaces.length} AUS/NZ races\n`);

    if (ausNzRaces.length === 0) {
      console.warn('⚠ No AUS/NZ races found');
      return [];
    }

    // Process each race to get field details
    for (let i = 0; i < Math.min(ausNzRaces.length, 20); i++) {
      const race = ausNzRaces[i];

      try {
        console.log(`[TAB] Fetching ${race.track} R${race.raceNum}...`);

        // Navigate to race page
        const raceUrl = race.href.startsWith('http') ? race.href : `https://www.tab.com.au${race.href}`;
        await page.goto(raceUrl, {
          waitUntil: 'networkidle0',
          timeout: 20000,
        }).catch(() => null);

        // Wait for form to load
        await new Promise(r => setTimeout(r, 1500));

        // Extract horses and odds
        const raceInfo = await page.evaluate(() => {
          const horses: Array<{ name: string; odds: number }> = [];

          // Look for runner rows (various selectors to be flexible)
          const runners = document.querySelectorAll('[class*="runner"], [class*="row"], tr');

          runners.forEach((runner) => {
            try {
              const nameEl = runner.querySelector('[class*="name"], td:first-child, span');
              const oddsEl = runner.querySelector('[class*="odds"], [class*="price"], td:last-child');

              if (nameEl && oddsEl) {
                const name = nameEl.textContent?.trim() || '';
                const oddsText = oddsEl.textContent?.trim() || '';
                const odds = parseFloat(oddsText) || 0;

                if (name && name.length > 0 && name.length < 50 && odds > 0 && odds < 100) {
                  if (!horses.some(h => h.name === name)) {
                    horses.push({ name, odds });
                  }
                }
              }
            } catch (err) {
              // Skip
            }
          });

          return horses.filter(h => h.odds > 1 && h.odds < 50);
        });

        if (raceInfo.length >= 8) {
          allRaces.push({
            track: race.track,
            raceNum: race.raceNum,
            raceName: `${race.track} R${race.raceNum}`,
            raceTime: race.time,
            horses: raceInfo,
          });
          console.log(`  ✓ ${raceInfo.length} horses found`);
        } else {
          console.log(`  ✗ Only ${raceInfo.length} horses (need 8+)`);
        }
      } catch (err) {
        console.error(`  Error fetching race: ${err}`);
      }
    }

    console.log(`\n✓ Successfully fetched ${allRaces.length} real race fields\n`);

    return allRaces;
  } catch (err) {
    console.error('[REAL-RACES] Fatal error:', err);
    return [];
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
}
