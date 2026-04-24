import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const sources = {
  sportsbet: {
    url: 'https://www.sportsbetform.com.au/track-conditions/',
    name: 'Sportsbet Form'
  },
  racenet: {
    url: 'https://www.racenet.com.au/track-conditions',
    name: 'RaceNet'
  },
  pureform: {
    url: 'https://www.pureform.com.au/cond.php',
    name: 'PureForm'
  }
};

async function extractFromSportsbet(page) {
  return await page.evaluate(() => {
    const conditions = {};
    const pageText = document.body.innerText;
    const lines = pageText.split('\n');
    
    // Look for track condition data
    // Format: "Track	Races	Condition	Weather	..."
    // Data: "Albury	1  2  3  4  5  6  7  	Good 4	clear sky..."
    
    let inDataSection = false;
    for (const line of lines) {
      if (line.includes('Track') && line.includes('Condition')) {
        inDataSection = true;
        continue;
      }
      
      if (inDataSection && line.trim().length > 0) {
        const parts = line.split('\t').map(p => p.trim());
        if (parts.length >= 3) {
          const track = parts[0];
          const conditionRaw = parts[2]; // e.g., "Good 4"
          
          // Extract condition word
          const condMatch = conditionRaw.match(/(FIRM|GOOD|SOFT|HEAVY|MUDDY|FAST|WET|YIELDING|DEAD)/i);
          if (condMatch && track && track.length > 2) {
            conditions[track] = {
              condition: condMatch[1].toUpperCase(),
              raw: conditionRaw,
              weather: parts[3] || null,
              temp: parts[4] || null
            };
          }
        }
      }
    }
    
    return conditions;
  });
}

async function extractFromRaceNet(page) {
  return await page.evaluate(() => {
    const conditions = {};
    
    // Try multiple strategies
    // Strategy 1: Look for track name + condition pattern in text
    const pageText = document.body.innerText;
    const lines = pageText.split('\n').filter(l => l.trim().length > 0);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      
      // Look for condition keywords
      const condMatch = line.match(/(FIRM|GOOD|SOFT|HEAVY|MUDDY|FAST|WET|YIELDING|DEAD)/i);
      if (condMatch) {
        // Track name likely before condition
        const trackMatch = lines[Math.max(0, i-2)].match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        if (trackMatch) {
          conditions[trackMatch[1]] = {
            condition: condMatch[1].toUpperCase(),
            raw: line
          };
        }
      }
    }
    
    return conditions;
  });
}

async function extractFromPureForm(page) {
  return await page.evaluate(() => {
    const conditions = {};
    const pageText = document.body.innerText;
    const lines = pageText.split('\n').filter(l => l.trim().length > 0);
    
    // Look for pattern: "Track: Condition"
    for (const line of lines) {
      const match = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*).*?(FIRM|GOOD|SOFT|HEAVY|MUDDY|FAST|WET|YIELDING|DEAD)/i);
      if (match) {
        conditions[match[1]] = {
          condition: match[2].toUpperCase(),
          raw: line
        };
      }
    }
    
    return conditions;
  });
}

async function testSource(sourceKey, sourceData) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📍 Testing: ${sourceData.name}`);
  console.log(`🔗 URL: ${sourceData.url}`);
  console.log('='.repeat(70));

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
    
    await page.goto(sourceData.url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));

    let conditions = {};
    
    if (sourceKey === 'sportsbet') {
      conditions = await extractFromSportsbet(page);
    } else if (sourceKey === 'racenet') {
      conditions = await extractFromRaceNet(page);
    } else if (sourceKey === 'pureform') {
      conditions = await extractFromPureForm(page);
    }

    await browser.close();

    if (Object.keys(conditions).length > 0) {
      console.log(`✅ SUCCESS - Extracted ${Object.keys(conditions).length} tracks:`);
      Object.entries(conditions).slice(0, 10).forEach(([track, data]) => {
        console.log(`  • ${track.padEnd(20)} → ${data.condition.padEnd(7)} (${data.raw})`);
      });
      return { success: true, count: Object.keys(conditions).length, data: conditions };
    } else {
      console.log(`⚠️  No conditions extracted`);
      return { success: false, count: 0 };
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    if (browser) await browser.close();
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('🔍 Extracting track condition data from multiple sources...\n');
  
  const results = {};
  for (const [key, data] of Object.entries(sources)) {
    results[key] = await testSource(key, data);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('📊 SUMMARY');
  console.log('='.repeat(70));
  
  Object.entries(results).forEach(([key, result]) => {
    const status = result.success ? '✅' : '❌';
    const count = result.count ? ` (${result.count} tracks)` : '';
    console.log(`${status} ${sources[key].name.padEnd(20)} ${count}`);
  });

  process.exit(0);
}

main().catch(console.error);
