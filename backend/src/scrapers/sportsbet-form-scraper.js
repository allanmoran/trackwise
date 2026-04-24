/**
 * Sportsbet Form Scraper
 * Extracts race details and runner data from sportsbetform.com.au
 *
 * URL format: https://www.sportsbetform.com.au/{RACE_ID}/{MEETING_ID}/
 * Example: https://www.sportsbetform.com.au/436044/3308955/
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import db from '../db.js';
import { RacePredictor } from '../ml/predictor.js';
import fetch from 'node-fetch';

puppeteer.use(StealthPlugin());

export class SportsbetFormScraper {
  /**
   * Track mapping from TODAY_RACE_LINKS.txt
   */
  static trackMapping = {
    "435951": { track: "Alice Springs", races: { "3308201": 1, "3308203": 2, "3308206": 3, "3308207": 4, "3308208": 5, "3308209": 6, "3308210": 7 } },
    "435955": { track: "Goulburn", races: { "3308251": 1, "3308254": 2, "3308256": 3, "3308259": 4, "3308262": 5, "3308265": 6 } },
    "435956": { track: "Doomben", races: { "3308252": 1, "3308255": 2, "3308258": 3, "3308261": 4, "3308264": 5, "3308267": 6, "3308270": 7, "3308273": 8 } },
    "435963": { track: "Benalla", races: { "3308321": 1, "3308322": 2, "3308324": 3, "3308325": 4, "3308328": 5, "3308330": 6, "3308335": 7 } },
    "435964": { track: "Ballina", races: { "3308323": 1, "3308326": 2, "3308329": 3, "3308333": 4, "3308337": 5, "3308341": 6 } },
    "435965": { track: "Warrnambool", races: { "3308327": 1, "3308332": 2, "3308339": 3, "3308343": 4, "3308346": 5, "3308349": 6, "3308352": 7, "3308355": 8 } },
    "435966": { track: "Rockhampton", races: { "3308331": 1, "3308336": 2, "3308340": 3, "3308344": 4, "3308347": 5, "3308350": 6, "3308354": 7, "3308356": 8 } },
    "435967": { track: "Toowoomba", races: { "3308334": 1, "3308338": 2, "3308342": 3, "3308345": 4, "3308348": 5, "3308351": 6, "3308353": 7 } },
    "435974": { track: "Caulfield", races: { "3308409": 1, "3308412": 2, "3308414": 3, "3308416": 4, "3308418": 5, "3308420": 6, "3308422": 7, "3308424": 8, "3308426": 9, "3308427": 10 } },
    "435975": { track: "Werribee", races: { "3308419": 1, "3308421": 2, "3308423": 3, "3308425": 4, "3308428": 5, "3308429": 6, "3308430": 7 } },
    "435979": { track: "Morphettville", races: { "3308444": 1, "3308446": 2, "3308448": 3, "3308449": 4, "3308452": 5, "3308453": 6, "3308454": 7, "3308455": 8, "3308456": 9, "3308457": 10 } },
    "436044": { track: "Geraldton", races: { "3308955": 1, "3308956": 2, "3308958": 3, "3308960": 4, "3308962": 5, "3308964": 6, "3308966": 7, "3308967": 8 } },
    "436048": { track: "Kalgoorlie", races: { "3308987": 1, "3308995": 2, "3309002": 3, "3309004": 4 } },
    "436054": { track: "Bowen", races: { "3309020": 1, "3309027": 2, "3309031": 3, "3309033": 4, "3309035": 5 } },
    "436088": { track: "Ascot", races: { "3309360": 1, "3309361": 2, "3309363": 3, "3309364": 4, "3309367": 5, "3309372": 6, "3309375": 7, "3309378": 8, "3309381": 9, "3309383": 10 } },
    "436089": { track: "Narrogin", races: { "3309362": 1, "3309365": 2, "3309369": 3, "3309371": 4, "3309374": 5, "3309377": 6, "3309380": 7, "3309384": 8 } },
    "436344": { track: "Newcastle", races: { "3311437": 1, "3311438": 2, "3311439": 3, "3311440": 4, "3311442": 5, "3311444": 6, "3311446": 7 } },
    "436782": { track: "Grafton", races: {} },
    "436784": { track: "Naracoorte", races: {} },
    "436800": { track: "Sale", races: {} },
    "437021": { track: "Sunshine Coast", races: {} },
    "437080": { track: "Terang", races: {} },
    "437171": { track: "Wagga", races: {} }
  };

  /**
   * Parse URL to extract race and meeting IDs with track lookup
   */
  static parseUrl(url) {
    const match = url.match(/sportsbetform\.com\.au\/(\d+)\/(\d+)/);
    if (!match) {
      throw new Error('Invalid Sportsbet form URL format');
    }

    const raceId = match[1];
    const meetingId = match[2];
    const mapping = this.trackMapping[raceId];

    let track = 'Unknown';
    let raceNumber = 0;

    if (mapping) {
      track = mapping.track;
      raceNumber = mapping.races[meetingId] || 0;
    }

    return {
      raceId: raceId,
      meetingId: meetingId,
      track: track,
      raceNumber: raceNumber,
      url: url.replace(/\/$/, '') // Remove trailing slash
    };
  }

  /**
   * Parse race data from captured API response
   */
  static parseRaceDataFromAPI(responseBody, pageUrl) {
    try {
      // The response is likely HTML or JSON - try to extract runner data
      // Look for patterns that indicate horse data

      // Extract track name from URL or response
      const trackMatch = responseBody.match(/Gundagai|Hobart|Kalgoorlie|Wellington|Rockhampton|[A-Za-z]+\s+Race\s+\d+/);

      // Look for runner row patterns in the response
      const runners = [];

      // Try to find tab-separated or structured runner data
      const lines = responseBody.split('\n');
      let inRunnerSection = false;

      for (const line of lines) {
        if (line.includes('No') && line.includes('Name') && line.includes('Trainer')) {
          inRunnerSection = true;
          continue;
        }

        if (inRunnerSection) {
          // Try to parse as runner data
          // Format: Position \t Name \t Trainer \t Jockey \t ... \t Odds
          const parts = line.split(/\s{2,}|\t/).filter(p => p.trim());

          if (parts.length < 4) continue;

          const position = parseInt(parts[0]);
          if (isNaN(position) || position < 1 || position > 30) continue;

          const horseName = parts[1]?.trim();
          const trainer = parts[2]?.trim();
          const jockey = parts[3]?.trim();

          if (!horseName || horseName.length < 2) continue;

          // Find odds (usually in last columns)
          let odds = null;
          for (let i = parts.length - 1; i >= Math.max(0, parts.length - 3); i--) {
            const val = parseFloat(parts[i]);
            if (!isNaN(val) && val > 0.5 && val < 1000) {
              odds = val;
              break;
            }
          }

          runners.push({
            position,
            horse: horseName,
            jockey: jockey && jockey !== '-' ? jockey : null,
            trainer: trainer && trainer.length > 2 ? trainer : null,
            odds,
            weight: null,
            barrier: null
          });
        }
      }

      return {
        runners: runners.filter(r => r.horse && r.horse.length > 1),
        track: trackMatch ? trackMatch[0].split(/\s+/)[0] : 'Unknown',
        raceNumber: runners.length > 0 ? 1 : 0,  // Placeholder
        distance: null,
        raceClass: 'Unknown'
      };
    } catch (err) {
      console.warn(`⚠️ Failed to parse API response: ${err.message}`);
      return null;
    }
  }

  /**
   * Scrape race details and runners from Sportsbet form page
   */
  static async scrapeRace(url) {
    console.log(`🏇 Scraping: ${url}`);

    const ids = this.parseUrl(url);
    let browser;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ],
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(45000);

      // Capture network requests to find and extract race data API
      const capturedRequests = [];
      let capturedRaceDataBody = null;
      page.on('response', async (response) => {
        const url = response.url();
        const status = response.status();

        if (status === 200 && (url.includes('form') || url.includes('race') || url.includes('api') || url.includes('theme/'))) {
          try {
            const body = await response.text();
            if (body.length > 100 && (body.includes('No') || body.includes('01') || body.includes('Trainer'))) {
              const hasRunners = body.includes('Trainer') && body.includes('Jockey');
              capturedRequests.push({
                url: url.substring(url.length - 100),
                size: body.length,
                hasRunners
              });
              // Save the first response with runner data for later parsing
              if (hasRunners && !capturedRaceDataBody) {
                capturedRaceDataBody = body;
              }
            }
          } catch (e) {
            // Binary or error response
          }
        }
      });

      console.log(`📡 Navigating to ${ids.url}`);
      await page.goto(ids.url, { waitUntil: 'networkidle2', timeout: 45000 });

      // The page loads but race card doesn't render until triggered
      // Try clicking on any visible race time link to trigger race card loading
      console.log(`🔍 Triggering race card...`);
      await page.evaluate(() => {
        // Find and click the first race link with a time (HH:MM format)
        const links = Array.from(document.querySelectorAll('a'));
        for (const link of links) {
          const text = link.textContent.trim();
          // Look for time format (HH:MM)
          if (text.match(/^\d{1,2}:\d{2}$/)) {
            link.click();
            break;
          }
        }
      });

      console.log(`✓ Clicked race link, waiting for content...`);
      await new Promise(r => setTimeout(r, 3000)); // Give page time to load race card

      // Get initial page state
      let initialText = await page.evaluate(() => document.body.innerText);
      console.log(`📋 Page text length: ${initialText.length} chars`);
      console.log(`   - Contains "Race overview": ${initialText.includes('Race overview')}`);
      console.log(`   - Sidebar only?: ${initialText.length < 5000}`);

      console.log(`⏳ Waiting for race content (with longer timeout)...`);
      try {
        await page.waitForFunction(() => {
          const text = document.body.innerText;
          // Wait for actual runner data: numbers that look like barriers + horse names
          const hasRunnerData = /\d{1,2}\s+[A-Z]/.test(text) || // barrier + horse pattern
                               /\d{1,2}\.\s+[A-Z]/.test(text) || // numbered list
                               text.match(/barrier|jockey|trainer/i);
          const hasRaceInfo = text.includes('Race overview') || text.length > 8000;
          return hasRunnerData && hasRaceInfo;
        }, { timeout: 25000, polling: 1000 });
        console.log(`✓ Race data loaded`);
      } catch (err) {
        console.warn(`⚠️ Race data load timeout - continuing anyway`);
      }

      // Add extra time for JavaScript execution
      await new Promise(r => setTimeout(r, 3000));

      await new Promise(r => setTimeout(r, 1500)); // Additional wait

      // Multi-strategy runner extraction
      const pageData = await page.evaluate(() => {
        const results = {
          runners: [],
          strategy: 'none',
          pageTitle: document.title,
          pageTextLength: document.body.innerText.length
        };

        const pageText = document.body.innerText;

        // STRATEGY 1: Extract from table rows (most reliable)
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td, th');
            if (cells.length >= 2) {
              const firstCell = cells[0]?.textContent?.trim();
              const secondCell = cells[1]?.textContent?.trim();
              const barrier = parseInt(firstCell);

              if (barrier > 0 && barrier < 30 && secondCell && secondCell.length > 2) {
                // Extract odds from last column or second-to-last (usually where odds are)
                let odds = null;
                for (let i = cells.length - 1; i >= Math.max(0, cells.length - 3); i--) {
                  const cellText = cells[i]?.textContent?.trim() || '';
                  const parsed = parseFloat(cellText);
                  // Odds are typically floats between 1.0 and 999
                  if (!isNaN(parsed) && parsed >= 1.0 && parsed <= 999) {
                    odds = parsed;
                    break;
                  }
                }

                results.runners.push({
                  barrier: barrier,
                  horse: secondCell,
                  jockey: cells[3]?.textContent?.trim() || null,
                  trainer: cells[2]?.textContent?.trim() || null,
                  odds: odds
                });
              }
            }
          }
        }
        if (results.runners.length > 0) {
          results.strategy = 'table';
          return results;
        }

        // STRATEGY 2: Parse innerText with line-by-line analysis
        const lines = pageText.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          const parts = line.split(/\s{2,}|\t/);

          if (parts.length >= 2) {
            const barrier = parseInt(parts[0]);
            const horseName = parts[1]?.trim();

            if (barrier > 0 && barrier < 30 && horseName && horseName.length > 1 &&
                !horseName.match(/^\d+$/) && !horseName.match(/^[A-Z\s]+$/)) {
              // Try to find odds in later parts
              let odds = null;
              for (let j = parts.length - 1; j >= Math.max(2, parts.length - 3); j--) {
                const parsed = parseFloat(parts[j]);
                if (!isNaN(parsed) && parsed >= 1.0 && parsed <= 999) {
                  odds = parsed;
                  break;
                }
              }

              results.runners.push({
                barrier: barrier,
                horse: horseName,
                jockey: parts[3]?.trim() || null,
                trainer: parts[2]?.trim() || null,
                odds: odds
              });
            }
          }
        }
        if (results.runners.length > 0) {
          results.strategy = 'text-lines';
          return results;
        }

        // STRATEGY 3: Look for numbered list patterns (1. Horse, 2. Horse)
        const numberedLines = pageText.match(/^\s*(\d{1,2})[\s.)\-]+([A-Za-z\s\-']{3,})/gm) || [];
        for (const match of numberedLines) {
          const parsed = match.match(/^[\s]*(\d{1,2})[\s.)\-]+([A-Za-z\s\-']+)/);
          if (parsed) {
            // Try to find odds in the remaining text after horse name
            let odds = null;
            const remainingText = match.substring(match.indexOf(parsed[2]) + parsed[2].length);
            const oddsMatch = remainingText.match(/[\d.]+/);
            if (oddsMatch) {
              const potentialOdds = parseFloat(oddsMatch[0]);
              if (!isNaN(potentialOdds) && potentialOdds >= 1.0 && potentialOdds <= 999) {
                odds = potentialOdds;
              }
            }

            results.runners.push({
              barrier: parseInt(parsed[1]),
              horse: parsed[2].trim(),
              jockey: null,
              trainer: null,
              odds: odds
            });
          }
        }
        if (results.runners.length > 0) {
          results.strategy = 'numbered-list';
          return results;
        }

        // STRATEGY 4: Extract from DOM divs with data attributes or classes
        const runnersFromDivs = [];
        document.querySelectorAll('[data-barrier], [class*="runner"], [class*="entry"]').forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.match(/^\d{1,2}\s+[A-Z]/)) {
            const match = text.match(/^(\d{1,2})\s+([A-Za-z\s\-']+)/);
            if (match) {
              // Try to find odds in the element text or siblings
              let odds = null;
              const remainingText = text.substring(text.indexOf(match[2]) + match[2].length);
              const oddsMatch = remainingText.match(/[\d.]+/);
              if (oddsMatch) {
                const potentialOdds = parseFloat(oddsMatch[0]);
                if (!isNaN(potentialOdds) && potentialOdds >= 1.0 && potentialOdds <= 999) {
                  odds = potentialOdds;
                }
              }

              runnersFromDivs.push({
                barrier: parseInt(match[1]),
                horse: match[2].trim(),
                jockey: null,
                trainer: null,
                odds: odds
              });
            }
          }
        });
        if (runnersFromDivs.length > 0) {
          results.runners = runnersFromDivs;
          results.strategy = 'divs';
          return results;
        }

        // Return empty if all strategies failed
        return results;
      });

      console.log(`📊 Page: ${pageData.pageTextLength} chars, Strategy: ${pageData.strategy}`);
      if (pageData.strategy !== 'none') {
        console.log(`✓ Used ${pageData.strategy} extraction`);
      } else {
        console.log(`⚠️  No extraction strategy succeeded`);
      }

      // Skip API response parsing since it's JavaScript code, not data
      // Use page.evaluate() which works reliably with the rendered page
      let fullData = null;

      // If we don't have data yet, extract race data and runners from page text
      if (!fullData) {
        fullData = await page.evaluate(() => {
        const pageText = document.body.innerText;
        const raceOverviewIdx = pageText.indexOf('Race overview');

        // Known Australian racetracks for reliable track extraction
        const knownTracks = ['Gundagai', 'Hobart', 'Kalgoorlie', 'Wellington', 'Rockhampton', 'Sunshine Coast', 'Swan Hill', 'Terang', 'Port Augusta', 'Cessnock', 'Nowra', 'Coffs Harbour', 'Grafton', 'Port Macquarie', 'Tamworth', 'Armidale', 'Bathurst', 'Orange', 'Wagga Wagga', 'Albury', 'Bendigo', 'Ballarat', 'Geelong', 'Williamstown', 'Moonee Valley', 'Caulfield', 'Sandown', 'Flemington', 'Yarra Valley', 'Colac', 'Wodonga', 'Echuca', 'Seymour', 'Healesville', 'Sale', 'Warragul', 'Ararat', 'Hamilton', 'Casterton', 'Mildura', 'Wangaratta', 'Shepparton', 'Kilmore', 'Kyneton', 'Taree', 'Naracoorte', 'Warwick', 'Ipswich', 'Doomben', 'Mornington', 'Pakenham', 'Werribee', 'Castlemaine', 'Benalla', 'Goulburn', 'Maroubra', 'Darwin', 'Mary', 'Ballina', 'Toowoomba', 'Alice Springs', 'Ascot', 'Narrogin', 'Newcastle', 'Bowen'];
        let detectedTrack = 'Unknown';
        const pageTextUpper = pageText.toUpperCase();
        for (const track of knownTracks) {
          if (pageText.includes(track) || pageTextUpper.includes(track.toUpperCase())) {
            detectedTrack = track;
            break;
          }
        }

        // If no "Race overview" found, try fallback extraction methods
        let runners = [];
        let usesFallback = false;

        if (raceOverviewIdx === -1) {
          // FALLBACK 1: Look for numbered list pattern - very lenient
          const lines = pageText.split('\n');
          for (const line of lines) {
            const match = line.match(/^[\s]*(\d{1,2})[\s.)\-]*([A-Za-z\s\-']+?)(?:\s|$)/);
            if (match) {
              const barrier = parseInt(match[1]);
              const horse = match[2].trim();
              if (barrier > 0 && barrier < 30 && horse && horse.length > 2 && !horse.match(/^[A-Z\s]+$/)) {
                runners.push({
                  position: barrier,
                  horse: horse,
                  jockey: null,
                  trainer: null,
                  odds: null,
                  weight: null,
                  barrier: barrier
                });
              }
            }
          }

          if (runners.length > 0) {
            usesFallback = true;
          }

          // If still no runners, try extracting any capitalized words that might be horse names with numbers
          if (runners.length === 0) {
            for (const line of lines) {
              // Look for lines with pattern: number spaces horsename
              const parts = line.split(/\s{2,}|\t/);
              if (parts.length >= 1) {
                const firstPart = parts[0]?.trim();
                const secondPart = parts[1]?.trim();

                const barrier = parseInt(firstPart);
                if (barrier > 0 && barrier < 30 && !isNaN(barrier) && secondPart && secondPart.length > 2) {
                  // Check if second part looks like a horse name (capitalized)
                  if (secondPart.match(/^[A-Z]/)) {
                    runners.push({
                      position: barrier,
                      horse: secondPart,
                      jockey: parts[3]?.trim() || null,
                      trainer: parts[2]?.trim() || null,
                      odds: null,
                      weight: null,
                      barrier: barrier
                    });
                  }
                }
              }
            }
            if (runners.length > 0) {
              usesFallback = true;
            }
          }

          if (runners.length === 0) {
            return {
              runners: [],
              track: detectedTrack,
              raceNumber: 0,
              distance: null,
              raceClass: 'Unknown',
              error: 'No race overview found and fallback extraction failed',
              debugSample: pageText.substring(0, 1500)
            };
          }
        } else {
          // Original extraction when "Race overview" is found
          runners = [];
        }

        // Extract from the race overview section (original method when Race overview is found)
        if (raceOverviewIdx !== -1) {
          const headerStart = Math.max(0, raceOverviewIdx - 500);
          const headerSection = pageText.substring(headerStart, raceOverviewIdx + 100);

          // Extract track, race number, and time - be very specific to avoid newlines
          const headerMatch = headerSection.match(/\n([A-Za-z\s]+?)\s+Race\s+(\d+)[^\n]*?(\d{1,2}:\d{2})/m) ||
                             headerSection.match(/([A-Za-z\s]+?)\s+Race\s+(\d+)[^\n]*?(\d{1,2}:\d{2})/) ||
                             headerSection.match(/\n([A-Za-z\s]+?)\s+Race\s+(\d+)/m) ||
                             headerSection.match(/([A-Za-z\s]+?)\s+Race\s+(\d+)/);
          const distanceMatch = headerSection.match(/(\d+)\s*[mM]etres?/);
          const classMatch = headerSection.match(/(HANDICAP|3YO|2YO|MAIDEN|CLASS|STAKE)/i);

          let runnerSection = pageText.substring(raceOverviewIdx);
          const sectionEnd = runnerSection.search(/\n(Gear Changes|Nominations|Scratched)/i);
          if (sectionEnd > 0) {
            runnerSection = runnerSection.substring(0, sectionEnd);
          }

          const lines = runnerSection.split('\n');
          runners = [];

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!line || line.match(/^[A-Z][a-z]+\s+[A-Z]/) || line.match(/^--/)) {
              continue;
            }

            const parts = line.split(/\s{2,}|\t/);
            if (parts.length < 4) continue;

            const position = parts[0].trim();
            const horseName = parts[1]?.trim();
            const trainer = parts[2]?.trim();
            const jockeyRaw = parts[3]?.trim();

            const posNum = parseInt(position);
            if (isNaN(posNum) || posNum < 1 || posNum > 30) continue;

            if (!horseName || horseName.length < 2 ||
                horseName.match(/^\d{1,2}:\d{2}$/) ||
                horseName.match(/^[\d\s,]*$/)) {
              continue;
            }

            let odds = null;
            for (let j = parts.length - 1; j >= Math.max(0, parts.length - 3); j--) {
              const cell = parts[j]?.trim();
              if (cell && cell.match(/^\d+\.?\d*$/) && cell !== 'Scr' && cell !== '-') {
                const oddVal = parseFloat(cell);
                if (oddVal > 0.5 && oddVal < 1000) {
                  odds = oddVal;
                  break;
                }
              }
            }

            let jockey = null;
            if (jockeyRaw && jockeyRaw.length > 1 && !jockeyRaw.match(/^\d/)) {
              jockey = jockeyRaw.split('(')[0].trim();
            }

            runners.push({
              position: posNum,
              horse: horseName,
              jockey,
              trainer: trainer && trainer.length > 2 ? trainer : null,
              odds,
              weight: null,
              barrier: posNum
            });
          }
        }

        // Extract header info (track, race number) from page text
        // Multiple patterns to extract race number
        let headerMatch = pageText.match(/\n?([A-Za-z\s]+?)\s+(?:Race|R)\s+(\d+)[^\n]*?(\d{1,2}:\d{2})?/m) ||
                          pageText.match(/([A-Za-z\s]+?)\s+(?:Race|R)\s+(\d+)/);

        // Fallback patterns for race number if main pattern fails
        let raceNum = headerMatch ? parseInt(headerMatch[2]) : 0;
        if (raceNum === 0) {
          const raceMatch = pageText.match(/Race\s*#?(\d+)/i) ||
                           pageText.match(/R(\d+)\s/);
          raceNum = raceMatch ? parseInt(raceMatch[1]) : 0;
        }

        const distanceMatch = pageText.match(/(\d+)\s*[mM]etres?/);
        const classMatch = pageText.match(/(HANDICAP|3YO|2YO|MAIDEN|CLASS|STAKE)/i);

        // Extract track condition (Firm, Good, Soft, Heavy, Muddy, Fast, etc.)
        const conditionMatch = pageText.match(/(FIRM|GOOD|SOFT|HEAVY|MUDDY|FAST|WET|YIELDING|DEAD)/i);
        const trackCondition = conditionMatch ? conditionMatch[1].toUpperCase() : null;

        return {
          runners,
          track: detectedTrack !== 'Unknown' ? detectedTrack : (headerMatch ? headerMatch[1].trim().split(/[\s\n]+/).filter(w => w.length > 0).join(' ') : 'Unknown'),
          raceNumber: raceNum,
          raceTime: headerMatch && headerMatch[3] ? headerMatch[3] : '',
          distance: distanceMatch ? parseInt(distanceMatch[1]) : null,
          raceClass: classMatch ? classMatch[1] : 'Unknown',
          trackCondition: trackCondition,
          debugSample: pageText.substring(0, 1500),
          debugLineCount: pageText.split('\n').length,
          usedFallback: usesFallback
        };
        });

        // Log the debug info
        if (fullData.debugSample) {
          console.log(`📄 Race section sample (first 2000 chars):`);
          console.log(fullData.debugSample);
          console.log(`\n📊 Total lines in race section: ${fullData.debugLineCount}`);
        }
      }

      // If pageData has runners from any strategy, use those
      if (pageData.runners && pageData.runners.length > 0) {
        console.log(`\n👥 Extracted ${pageData.runners.length} runners (${pageData.strategy})`);
        fullData.runners = pageData.runners.map(r => ({
          position: r.barrier,
          horse: r.horse,
          jockey: r.jockey,
          trainer: r.trainer,
          odds: r.odds || null,
          weight: null,
          barrier: r.barrier
        }));
      } else if (pageData.strategy === 'none') {
        console.log(`\n⚠️  No runners extracted - all strategies failed`);
      }

      console.log(`\n👥 Extracted ${fullData.runners.length} runners`);
      if (fullData.runners.length > 0) {
        console.log('Sample runners:');
        fullData.runners.slice(0, 3).forEach(r => {
          console.log(`  B${r.barrier}. ${r.horse}`);
        });
      }

      await page.close();
      await browser.close();

      // Use URL-based track info where available, fallback to page-detected track
      // This allows page content detection to rescue runs where meeting ID isn't in trackMapping
      const trackFromMapping = ids.track !== 'Unknown' ? ids.track : null;
      const raceNumberFromMapping = ids.raceNumber > 0 ? ids.raceNumber : null;

      const finalTrack = trackFromMapping || fullData.track || 'Unknown';
      const finalRaceNumber = raceNumberFromMapping || fullData.raceNumber || 0;

      // Log what we used
      if (!trackFromMapping && fullData.track && fullData.track !== 'Unknown') {
        console.log(`🔄 Using page-detected track: ${fullData.track} (mapping had no entry for raceId ${ids.raceId})`);
      }
      if (!raceNumberFromMapping && fullData.raceNumber && fullData.raceNumber > 0) {
        console.log(`🔄 Using page-detected race number: ${fullData.raceNumber}`);
      }

      return {
        track: finalTrack,
        raceNumber: finalRaceNumber,
        raceTime: fullData.raceTime,
        raceName: `${finalTrack} Race ${finalRaceNumber}`,
        distance: fullData.distance,
        raceClass: fullData.raceClass,
        runners: fullData.runners.filter(r => r.horse && r.horse.length > 1),
        url: ids.url,
        scrapedAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('❌ Scrape error:', err.message);
      if (browser) await browser.close();
      throw err;
    }
  }

  /**
   * Load scraped race into Knowledge Base
   */
  static loadIntoKB(raceData) {
    console.log('\n💾 Loading into Knowledge Base...');

    try {
      // Reject Unknown tracks - they indicate scraper failure
      if (!raceData.track || raceData.track === 'Unknown') {
        throw new Error('Cannot load race with Unknown track - scraper failed to detect track from page');
      }

      const today = new Date().toISOString().split('T')[0];

      // If we have runners but no race number, generate one from DB sequence
      if (raceData.raceNumber === 0 && raceData.runners && raceData.runners.length > 0) {
        const maxRaceNum = db.prepare(`
          SELECT MAX(race_number) as max_num FROM races WHERE track = ? AND date = ?
        `).get(raceData.track, today);
        raceData.raceNumber = (maxRaceNum?.max_num || 0) + 1;
        console.log(`🔄 Generated race number from sequence: ${raceData.raceNumber}`);
      }

      // Reject races with 0 number and no runners
      if (raceData.raceNumber === 0) {
        throw new Error('Cannot load race with race number 0 and no runners - insufficient data');
      }

      const raceResult = db.prepare(`
        INSERT INTO races (track, date, race_number, race_name, race_time, distance, condition, track_condition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(track, date, race_number) DO UPDATE SET
          race_name = excluded.race_name,
          race_time = excluded.race_time,
          distance = excluded.distance,
          condition = excluded.condition,
          track_condition = excluded.track_condition
        RETURNING id
      `).get(
        raceData.track,
        today,
        raceData.raceNumber,
        raceData.raceName,
        raceData.raceTime || '',
        raceData.distance,
        raceData.raceClass,
        raceData.trackCondition || null
      );

      const raceId = raceResult.id;
      console.log(`  ✓ Race ID: ${raceId}`);

      let runnersLoaded = 0;

      // Batch insert optimization: use transaction for all runners
      const insertRunner = db.prepare(`
        INSERT OR REPLACE INTO race_runners
        (race_id, horse_id, jockey_id, trainer_id, barrier, starting_odds)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertHorse = db.prepare(`
        INSERT INTO horses (name) VALUES (?)
        ON CONFLICT(name) DO UPDATE SET name = excluded.name
        RETURNING id
      `);
      const insertJockey = db.prepare(`
        INSERT INTO jockeys (name) VALUES (?)
        ON CONFLICT(name) DO UPDATE SET name = excluded.name
        RETURNING id
      `);
      const insertTrainer = db.prepare(`
        INSERT INTO trainers (name) VALUES (?)
        ON CONFLICT(name) DO UPDATE SET name = excluded.name
        RETURNING id
      `);

      const transaction = db.transaction((runners) => {
        for (const runner of runners) {
          try {
            const horseResult = insertHorse.get(runner.horse);
            let jockeyId = null;
            if (runner.jockey) {
              const jockeyResult = insertJockey.get(runner.jockey);
              jockeyId = jockeyResult.id;
            }
            let trainerId = null;
            if (runner.trainer) {
              const trainerResult = insertTrainer.get(runner.trainer);
              trainerId = trainerResult.id;
            }
            insertRunner.run(raceId, horseResult.id, jockeyId, trainerId, runner.barrier, runner.odds);
            runnersLoaded++;
          } catch (err) {
            console.log(`    ⚠️ Skip "${runner.horse}": ${err.message}`);
          }
        }
      });

      transaction(raceData.runners);

      console.log(`  ✓ Loaded ${runnersLoaded}/${raceData.runners.length} runners`);
      console.log(`\n✅ Successfully loaded ${raceData.track} R${raceData.raceNumber}`);

      return { raceId, runnersLoaded, track: raceData.track, raceNumber: raceData.raceNumber, runnerIds: [] };
    } catch (err) {
      console.error('❌ KB load error:', err.message);
      throw err;
    }
  }

  /**
   * Full pipeline: scrape + load
   */
  static async scrapeAndLoad(url) {
    try {
      const raceData = await this.scrapeRace(url);
      const result = this.loadIntoKB(raceData);
      return result;
    } catch (err) {
      console.error('❌ Pipeline error:', err.message);
      throw err;
    }
  }

  /**
   * Full pipeline: scrape + load + predict (with picks)
   * Optional: capture live odds from Sportsbet betting interface
   */
  static async scrapeLoadAndPredict(url, captureLiveOdds = false) {
    try {
      const raceData = await this.scrapeRace(url);
      const loadResult = this.loadIntoKB(raceData);

      // Automatically capture track condition from Sportsbet track conditions page
      if (raceData.track && raceData.track !== 'Unknown' && !raceData.trackCondition) {
        const today = new Date().toISOString().split('T')[0];
        const condition = await this.fetchTrackConditionFromRacingCom(raceData.track, today, raceData.raceNumber);
        if (condition) {
          db.prepare(`UPDATE races SET track_condition = ? WHERE id = ?`).run(condition, loadResult.raceId);
          console.log(`🌤️ Updated condition: ${condition}`);
        }
      }

      // Optionally capture live odds from Sportsbet betting interface
      if (captureLiveOdds && raceData.track && raceData.track !== 'Unknown') {
        const today = new Date().toISOString().split('T')[0];
        const oddsData = await this.captureLiveOdds(raceData.track, today, raceData.raceNumber);
        const updated = this.updateLiveOdds(
          loadResult.raceId,
          raceData.track,
          today,
          raceData.raceNumber,
          oddsData.odds
        );
        console.log(`📊 Live odds: ${updated}/${oddsData.count} runners updated`);
      }

      // Generate predictions and picks for this race
      console.log(`\n🎯 Generating predictions for race ${loadResult.raceId}...`);
      const allPicks = RacePredictor.generatePicksWithPredictions(loadResult.raceId);

      // Return top picks sorted by EV (or probability if EV is null)
      const topPicks = allPicks
        .sort((a, b) => {
          const evA = Math.max(a.ev_win || -999, a.ev_place || -999);
          const evB = Math.max(b.ev_win || -999, b.ev_place || -999);
          if (evB !== evA) return evB - evA; // Sort by EV first
          return b.predicted_win_prob - a.predicted_win_prob; // Then by prob
        })
        .slice(0, 5); // Top 5 picks

      console.log(`📊 Generated ${topPicks.length} top predictions`);
      if (topPicks.length > 0) {
        topPicks.forEach((p, i) => {
          const evDisplay = p.ev_win !== null ? `${(p.ev_win * 100).toFixed(1)}%` : `prob: ${p.predicted_win_prob}%`;
          console.log(`  ${i + 1}. ${p.horse} (${p.jockey || 'N/A'}) @ $${p.odds || 'N/A'} - ${evDisplay}`);
        });
      }

      return {
        ...loadResult,
        picks: topPicks,
        allPicks: allPicks
      };
    } catch (err) {
      console.error('❌ Predict pipeline error:', err.message);
      throw err;
    }
  }

  /**
   * Auto-place bets for high-EV picks
   */
  static async autoBetPicks(picks, raceId, minEv = 0.10) {
    console.log(`\n💰 Auto-placing bets for race ${raceId} (min EV: ${(minEv * 100).toFixed(1)}%)...`);

    // Get race info
    const race = db.prepare('SELECT track, race_number, date FROM races WHERE id = ?').get(raceId);
    if (!race) {
      console.warn(`⚠️ Race ${raceId} not found`);
      return { betsPlaced: 0, betsSkipped: 0 };
    }

    // Get bankroll for stake calculation
    const bankroll = db.prepare('SELECT COALESCE(SUM(profit_loss), 1000) as total FROM bets WHERE settled_at IS NOT NULL').get().total || 1000;
    const unitStake = Math.max(10, Math.min(100, bankroll * 0.02)); // 2% of bankroll, $10-$100 per bet

    const betsToPlace = [];
    let lowEvSkipped = 0;

    for (const pick of picks) {
      // Only bet on high-EV picks
      const evWin = pick.ev_win || 0;
      const evPlace = pick.ev_place || 0;
      const bestEv = Math.max(evWin, evPlace);

      if (bestEv < minEv) {
        lowEvSkipped++;
        continue;
      }

      // Determine bet type based on EV
      const betType = evPlace > evWin ? 'PLACE' : 'WIN';

      betsToPlace.push({
        race_id: raceId,
        horse: pick.horse,
        jockey: pick.jockey,
        trainer: pick.trainer,
        bet_type: betType,
        stake: unitStake,
        opening_odds: pick.odds || 0,
        ev_percent: (bestEv * 100).toFixed(2),
        confidence: Math.round(pick.predicted_win_prob)
      });
    }

    console.log(`📋 Prepared ${betsToPlace.length} bets (${lowEvSkipped} skipped for low EV)`);

    // Place the bets via API
    if (betsToPlace.length > 0) {
      try {
        const response = await fetch('http://localhost:3001/api/bets/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bets: betsToPlace })
        });

        const result = await response.json();
        const placedCount = result.placed || 0;
        const filteredCount = Array.isArray(result.filtered) ? result.filtered.length : 0;
        const duplicateCount = Array.isArray(result.duplicates) ? result.duplicates.length : 0;

        console.log(`✅ Placed ${placedCount}/${betsToPlace.length} bets`);
        if (filteredCount > 0) console.log(`   Filtered: ${filteredCount}`);
        if (duplicateCount > 0) console.log(`   Duplicates: ${duplicateCount}`);

        return {
          betsPlaced: placedCount,
          betsSkipped: lowEvSkipped + filteredCount + duplicateCount
        };
      } catch (err) {
        console.warn(`⚠️ Failed to place bets: ${err.message}`);
        return { betsPlaced: 0, betsSkipped: betsToPlace.length + lowEvSkipped };
      }
    }

    return { betsPlaced: 0, betsSkipped: lowEvSkipped };
  }

  /**
   * Full pipeline: scrape + load + predict + auto-bet
   */
  static async scrapeLoadPredictAndBet(url, minEv = 0.10) {
    try {
      const result = await this.scrapeLoadAndPredict(url);

      // Auto-place bets for high-EV picks
      const betResult = await this.autoBetPicks(result.picks, result.raceId, minEv);

      return {
        ...result,
        betResult
      };
    } catch (err) {
      console.error('❌ Full pipeline error:', err.message);
      throw err;
    }
  }

  /**
   * Fetch track condition from Racing.com form guide
   * Fallback source when Sportsbet doesn't have condition data
   */
  static async fetchTrackConditionFromRacingCom(track, raceDate, raceNumber) {
    console.log(`\n🌤️ Fetching track condition from Sportsbet for ${track} R${raceNumber}...`);

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ],
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(15000);

      // Sportsbet track conditions page - has live table with all track conditions
      const url = `https://www.sportsbetform.com.au/track-conditions/`;

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));

      // Extract track condition for the specific track from Sportsbet table
      const condition = await page.evaluate((trackName) => {
        const pageText = document.body.innerText;
        const lines = pageText.split('\n').filter(l => l.trim().length > 0);

        // Sportsbet format: "Track\tRaces\tCondition\tWeather\t..."
        // Data rows: "Albury\t1  2  3  4  5  6  7  \tGood 4\tclear sky\t20\t76%\tWNW at 1.72kph"

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Check if line starts with track name (case insensitive)
          if (line.toLowerCase().includes(trackName.toLowerCase())) {
            // Parse tab-separated values
            const parts = line.split('\t').map(p => p.trim());

            // First part should be track name, third part should be condition
            if (parts.length >= 3 && parts[0].toLowerCase().includes(trackName.toLowerCase())) {
              const conditionRaw = parts[2]; // e.g., "Good 4" or "Soft 5"

              // Extract condition word (GOOD, SOFT, FIRM, HEAVY, etc.)
              const condMatch = conditionRaw.match(/(FIRM|GOOD|SOFT|HEAVY|MUDDY|FAST|WET|YIELDING|DEAD)/i);
              if (condMatch) {
                return condMatch[1].toUpperCase();
              }
            }
          }
        }

        return null;
      }, track);

      if (condition) {
        console.log(`  ✅ Found condition from Sportsbet: ${condition}`);
      } else {
        console.log(`  ℹ️ Track not found on Sportsbet conditions page`);
      }

      await browser.close();

      if (condition) {
        console.log(`  ✅ Found condition: ${condition}`);
        return condition;
      } else {
        console.log(`  ℹ️ No condition found on Sportsbet`);
        return null;
      }
    } catch (err) {
      if (browser) await browser.close();
      console.warn(`  ⚠️ Track condition fetch failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Capture live/current odds from Sportsbet betting interface
   * Returns odds mapped to horse names with timestamp
   */
  static async captureLiveOdds(track, raceDate, raceNumber) {
    console.log(`\n💰 Capturing live odds for ${track} R${raceNumber}...`);

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ],
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(20000);

      // Navigate to Sportsbet betting page
      // Format: https://www.sportsbet.com.au/racing/{DATE}/{TRACK}/race-{RACE_NUM}
      const trackSlug = track.toLowerCase().replace(/\s+/g, '-');
      const dateStr = raceDate.replace(/-/g, '');
      const url = `https://www.sportsbet.com.au/racing/${raceDate}/${trackSlug}/r${raceNumber}`;

      console.log(`  📍 Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500))); // Wait for betting interface to load

      // Extract odds from betting interface
      const oddsData = await page.evaluate(() => {
        const odds = {};
        const timestamp = new Date().toISOString();

        // Strategy 1: Look for odds in betting cards with horse names
        const cards = document.querySelectorAll('[class*="runner"], [class*="selection"], [class*="bet-option"]');
        for (const card of cards) {
          const text = card.textContent || '';

          // Extract horse name (usually first substantial text)
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length > 0) {
            const horseName = lines[0];

            // Look for odds pattern (like "2.50", "$2.50", "1.95")
            for (const line of lines) {
              const oddsMatch = line.match(/\$?(\d+\.\d{2})/);
              if (oddsMatch) {
                const oddsValue = parseFloat(oddsMatch[1]);
                if (oddsValue >= 1.0 && oddsValue <= 999 && horseName.length >= 2) {
                  odds[horseName] = {
                    odds: oddsValue,
                    captured: timestamp
                  };
                  break;
                }
              }
            }
          }
        }

        // Strategy 2: Look for table rows with odds
        if (Object.keys(odds).length === 0) {
          const rows = document.querySelectorAll('table tbody tr, [role="row"]');
          for (const row of rows) {
            const cells = row.querySelectorAll('td, [role="cell"]');
            if (cells.length >= 2) {
              const horseName = cells[0]?.textContent?.trim();
              const oddsCell = cells[cells.length - 1]?.textContent?.trim() ||
                             cells[cells.length - 2]?.textContent?.trim();

              if (horseName && oddsCell) {
                const oddsMatch = oddsCell.match(/\$?(\d+\.\d{2})/);
                if (oddsMatch) {
                  const oddsValue = parseFloat(oddsMatch[1]);
                  if (oddsValue >= 1.0 && oddsValue <= 999) {
                    odds[horseName] = {
                      odds: oddsValue,
                      captured: timestamp
                    };
                  }
                }
              }
            }
          }
        }

        return {
          odds,
          timestamp,
          count: Object.keys(odds).length
        };
      });

      await browser.close();

      if (Object.keys(oddsData.odds).length > 0) {
        console.log(`  ✅ Captured ${oddsData.count} live odds`);
        return oddsData;
      } else {
        console.log(`  ⚠️ No odds found on page`);
        return { odds: {}, timestamp: new Date().toISOString(), count: 0 };
      }
    } catch (err) {
      if (browser) await browser.close();
      console.warn(`  ⚠️ Live odds capture failed: ${err.message}`);
      return { odds: {}, timestamp: new Date().toISOString(), count: 0 };
    }
  }

  /**
   * Update race_runners with live odds from Sportsbet
   */
  static updateLiveOdds(raceId, track, raceDate, raceNumber, oddsMap) {
    try {
      if (!oddsMap || Object.keys(oddsMap).length === 0) {
        console.log(`  ℹ️ No odds to update`);
        return 0;
      }

      // Get all runners for this race
      const runners = db.prepare(`
        SELECT rr.id, h.name as horse_name
        FROM race_runners rr
        JOIN horses h ON rr.horse_id = h.id
        WHERE rr.race_id = ?
      `).all(raceId);

      let updated = 0;
      const normalized = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

      for (const runner of runners) {
        // Find matching odds (fuzzy match)
        for (const [horseName, oddsData] of Object.entries(oddsMap)) {
          if (normalized(runner.horse_name) === normalized(horseName)) {
            db.prepare(`
              UPDATE race_runners
              SET closing_odds = ?
              WHERE id = ?
            `).run(oddsData.odds, runner.id);
            updated++;
            console.log(`  ✓ ${runner.horse_name}: $${oddsData.odds}`);
            break;
          }
        }
      }

      return updated;
    } catch (err) {
      console.error(`  ❌ Failed to update odds: ${err.message}`);
      return 0;
    }
  }

  /**
   * Extract all race URLs from Sportsbet form main page
   */
  static async scrapeRaceUrls() {
    console.log(`🌐 Scraping Sportsbet form main page for race URLs...`);

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ],
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(45000);

      await page.goto('https://www.sportsbetform.com.au/', { waitUntil: 'networkidle2', timeout: 45000 });

      // Extract all race links from the page
      const raceUrls = await page.evaluate(() => {
        const urls = [];

        // Find all links that match the race URL pattern
        const links = Array.from(document.querySelectorAll('a[href]'));

        for (const link of links) {
          const href = link.getAttribute('href');
          // Match pattern: /RACE_ID/MEETING_ID/ or /RACE_ID/MEETING_ID
          if (href && href.match(/^\/\d+\/\d+\/?$/)) {
            const fullUrl = `https://www.sportsbetform.com.au${href}`;
            const text = link.textContent.trim();
            urls.push({
              url: fullUrl,
              label: text,
              href: href
            });
          }
        }

        return urls;
      });

      await browser.close();

      console.log(`✓ Found ${raceUrls.length} race links`);
      return raceUrls;
    } catch (err) {
      if (browser) await browser.close();
      console.error('❌ Failed to scrape race URLs:', err.message);
      throw err;
    }
  }

  /**
   * Extract race URLs for specific tracks from Sportsbet
   */
  static async scrapeRaceUrlsByTracks(trackNames) {
    console.log(`🌐 Extracting URLs for tracks: ${trackNames.join(', ')}`);

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ],
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(45000);

      const allUrls = [];

      for (const trackName of trackNames) {
        console.log(`  Scraping ${trackName}...`);
        try {
          await page.goto('https://www.sportsbetform.com.au/', { waitUntil: 'networkidle2', timeout: 45000 });

          // Click on the track name in the sidebar to show its races
          const clicked = await page.evaluate((track) => {
            const trackElements = Array.from(document.querySelectorAll('*')).filter(el =>
              el.textContent.trim() === track && el.tagName !== 'SCRIPT'
            );

            for (const el of trackElements) {
              // Try to click on the track or its parent link
              const link = el.closest('a') || el.tagName === 'A' ? el : null;
              if (link) {
                link.click();
                return true;
              }
              // Try clicking the element itself if it's clickable
              if (el.onclick || el.getAttribute('data-track')) {
                el.click();
                return true;
              }
            }
            return false;
          }, trackName);

          if (clicked) {
            await new Promise(r => setTimeout(r, 1000)); // Wait for page to update

            // Extract race URLs for this track
            const trackUrls = await page.evaluate(() => {
              const urls = [];
              const links = Array.from(document.querySelectorAll('a[href]'));

              for (const link of links) {
                const href = link.getAttribute('href');
                if (href && href.match(/^\/\d+\/\d+\/?$/)) {
                  const fullUrl = `https://www.sportsbetform.com.au${href}`;
                  urls.push(fullUrl);
                }
              }

              return urls;
            });

            console.log(`    ✓ Found ${trackUrls.length} races for ${trackName}`);
            allUrls.push(...trackUrls);
          } else {
            console.warn(`    ⚠️ Could not click on ${trackName}`);
          }
        } catch (err) {
          console.warn(`    ⚠️ Error scraping ${trackName}: ${err.message}`);
        }
      }

      await browser.close();

      console.log(`✓ Total URLs extracted: ${allUrls.length}`);
      return allUrls;
    } catch (err) {
      if (browser) await browser.close();
      console.error('❌ Failed to scrape by tracks:', err.message);
      throw err;
    }
  }
}

export default SportsbetFormScraper;
