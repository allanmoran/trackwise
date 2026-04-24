import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import db from '../src/db.js';

puppeteer.use(StealthPlugin());

async function populateKBFromPunters() {
  let browser;
  try {
    console.log('📚 Populating Knowledge Base from Punters race pages...\n');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Get today's AU/NZ racing races only (filter out international)
    const today = new Date().toISOString().split('T')[0];
    const auNzTracks = [
      // Australian tracks
      'Ascot', 'Caulfield', 'Doomben', 'Morphettville', 'Randwick', 'Alice Springs', 'Narrogin',
      'Newcastle', 'Toowoomba', 'Lismore', 'Bowen', 'Goulburn', 'Hillston', 'Innisfail', 'Kilcoy',
      'Maxwelton', 'Noorama', 'Warialda', 'Werribee', 'Sandown', 'Moonee Valley', 'Flemington',
      // New Zealand tracks
      'Riccarton', 'Hastings', 'Ellerslie', 'Tauranga', 'Cambridge', 'New Plymouth', 'Avondale',
      'Matamata', 'Rotorua', 'Te Awamutu', 'Methven', 'Timaru'
    ];

    const races = db.prepare(`
      SELECT id, track, race_number, race_name, date
      FROM races
      WHERE date = ? AND track IN (${auNzTracks.map(() => '?').join(',')})
      ORDER BY track, race_number
    `).all(today, ...auNzTracks);

    if (races.length === 0) {
      console.log('⚠️ No AU races found for today.');
      await browser.close();
      return;
    }

    console.log(`📊 Found ${races.length} AU races for ${today}\n`);

    let processedRaces = 0;
    let updateCount = 0;

    for (const race of races) {
      try {
        // Build Punters race URL
        const trackSlug = race.track.toLowerCase().replace(/\s+/g, '-');
        const dateFormatted = race.date.replace(/-/g, '');
        const raceSlug = race.race_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') + `-race-${race.race_number}`;

        const raceUrl = `https://www.punters.com.au/form-guide/horses/${trackSlug}-${dateFormatted}/${raceSlug}/`;

        console.log(`\n⏳ ${race.track} R${race.race_number}`);

        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(12000);

        try {
          await page.goto(raceUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
          // Wait longer to ensure page is fully loaded before extracting CSV link
          await new Promise(r => setTimeout(r, 1200));

          // Find CSV URL on the page
          const csvUrl = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*=".csv"]'));
            return links.length > 0 ? links[0].href : null;
          });

          if (!csvUrl) {
            console.log(`   ⚠️ No CSV found`);
            await page.close();
            continue;
          }

          console.log(`   📄 Fetching CSV...`);

          // Fetch CSV using native fetch with browser headers
          let csvText;
          let usedHtmlFallback = false;

          try {
            const csvResponse = await fetch(csvUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/csv,text/plain,*/*',
                'Referer': 'https://www.punters.com.au/'
              }
            });

            // Handle rate limiting with wait
            if (csvResponse.status === 429) {
              console.log(`   ⚠️ Rate limited (429) - falling back to HTML parsing`);
              usedHtmlFallback = true;
            } else if (!csvResponse.ok) {
              console.log(`   ⚠️ CSV fetch failed: ${csvResponse.status} - falling back to HTML`);
              usedHtmlFallback = true;
            } else {
              csvText = await csvResponse.text();
            }
          } catch (fetchErr) {
            console.log(`   ⚠️ CSV fetch error - falling back to HTML: ${fetchErr.message}`);
            usedHtmlFallback = true;
          }

          // Fallback: extract from HTML if CSV failed
          if (usedHtmlFallback) {
            const htmlResult = await page.evaluate(() => {
              const html = document.documentElement.outerHTML;
              const runners = [];

              // Extract from "HorseName - J: Jockey - T: Trainer" pattern
              const pattern = /['"]([A-Za-z\s]+?)\s+-\s+J:\s+[A-Za-z\s]+\s+-\s+T:/g;
              let match;
              let position = 1;

              const foundNames = [];
              while ((match = pattern.exec(html)) !== null) {
                foundNames.push(match[1].trim());
              }

              // Deduplicate
              const uniqueNames = [...new Set(foundNames)];

              for (const horseName of uniqueNames) {
                if (horseName.length >= 2 && /[a-zA-Z]/.test(horseName)) {
                  runners.push(horseName);
                  position++;
                  if (position > 10) break;
                }
              }

              return runners.length > 0 ? runners : null;
            });

            if (htmlResult && htmlResult.length > 0) {
              console.log(`   📄 Extracted ${htmlResult.length} runners from HTML`);
              // Create fake CSV-like data for consistent processing
              csvText = 'position,name,jockey,trainer,odds\n';
              htmlResult.forEach((name, idx) => {
                csvText += `${idx + 1},"${name}","Unknown","Unknown",0\n`;
              });
            } else {
              console.log(`   ⚠️ No runners found`);
              await page.close();
              continue;
            }
          }

          const lines = csvText.split('\n').filter(l => l.trim());

          // Parse CSV (simple parsing)
          const runners = [];
          for (let i = 1; i < lines.length; i++) {
            const fields = lines[i].split(',').map(f => f.trim().replace(/^"|"$/g, ''));

            // Debug: log first few lines
            if (i <= 2) {
              console.log(`      DEBUG Line ${i}: fields=${fields.length}, [${fields.slice(0, 4).join(' | ')}]`);
            }

            if (fields.length < 2 || !fields[0]) continue;

            runners.push({
              position: parseInt(fields[0]) || i,
              name: fields[1] || '',
              jockey: null, // CSV format doesn't include jockey in fields[2]
              trainer: null, // CSV format doesn't include trainer in fields[3]
              odds: parseFloat(fields[fields.length - 1]) || null,
            });
          }

          console.log(`   ✓ Found ${runners.length} runners (will filter invalid entries)`);

          // Store runner data
          let skipped = 0;
          for (const runner of runners) {
            // Only skip if horse name is missing - jockey/trainer can be NULL
            if (!runner.name) {
              skipped++;
              continue;
            }

            // Skip obvious parse errors: numeric or single-letter jockeys/trainers
            if (runner.jockey && /^\d+$/.test(runner.jockey)) {
              skipped++;
              continue;
            }
            if (runner.trainer && /^\d+$/.test(runner.trainer)) {
              skipped++;
              continue;
            }

            // Insert/update horse
            const horseId = db.prepare(`
              INSERT INTO horses (name) VALUES (?)
              ON CONFLICT(name) DO UPDATE SET name = excluded.name
              RETURNING id
            `).get(runner.name)?.id;

            // Insert/update jockey (allow NULL)
            let jockeyId = null;
            if (runner.jockey) {
              jockeyId = db.prepare(`
                INSERT INTO jockeys (name) VALUES (?)
                ON CONFLICT(name) DO UPDATE SET name = excluded.name
                RETURNING id
              `).get(runner.jockey)?.id;
            }

            // Insert/update trainer (allow NULL)
            let trainerId = null;
            if (runner.trainer) {
              trainerId = db.prepare(`
                INSERT INTO trainers (name) VALUES (?)
                ON CONFLICT(name) DO UPDATE SET name = excluded.name
                RETURNING id
              `).get(runner.trainer)?.id;
            }

            // Store in race_runners - require horse but allow NULL jockey/trainer
            if (horseId) {
              db.prepare(`
                INSERT OR REPLACE INTO race_runners (race_id, horse_id, jockey_id, trainer_id, starting_odds)
                VALUES (?, ?, ?, ?, ?)
              `).run(race.id, horseId, jockeyId, trainerId, runner.odds);

              updateCount++;
            }
          }

          if (runners.length - skipped > 0) {
            console.log(`   ✓ Stored ${runners.length - skipped}/${runners.length} runners (${skipped} skipped)`);
          } else if (runners.length > 0) {
            console.log(`   ⚠️ All ${runners.length} runners filtered out`);
          }

          await page.close();
          processedRaces++;
        } catch (pageErr) {
          console.log(`   ✗ Error: ${pageErr.message}`);
          await page.close();
        }
      } catch (raceErr) {
        console.log(`   ✗ Error: ${raceErr.message}`);
      }

      // Add delay between races to avoid rate limiting
      // Use random delay between 3-5 seconds to avoid bot detection
      const delay = 3000 + Math.random() * 2000;
      await new Promise(r => setTimeout(r, delay));
    }

    console.log(`\n✅ Complete!`);
    console.log(`   ${processedRaces} races processed`);
    console.log(`   ${updateCount} runner records stored`);

    await browser.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (browser) await browser.close();
  }

  process.exit(0);
}

populateKBFromPunters();
