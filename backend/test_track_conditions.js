import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const urls = [
  { name: 'RaceNet', url: 'https://www.racenet.com.au/track-conditions' },
  { name: 'Punters', url: 'https://www.punters.com.au/form-guide/track-conditions/' },
  { name: 'Sportsbet Form', url: 'https://www.sportsbetform.com.au/track-conditions/' },
  { name: 'ATC', url: 'https://www.australianturfclub.com.au/weather-and-tracks/' },
  { name: 'PureForm', url: 'https://www.pureform.com.au/cond.php' }
];

async function testUrl(urlData) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${urlData.name}`);
  console.log(`URL: ${urlData.url}`);
  console.log('='.repeat(60));

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

    // Navigate
    console.log('📍 Navigating...');
    await page.goto(urlData.url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
    
    // Wait for any JS to render
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));

    // Get page content
    const pageData = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const html = document.body.innerHTML;
      
      return {
        textLength: pageText.length,
        htmlLength: html.length,
        textSnippet: pageText.substring(0, 500),
        title: document.title,
        // Look for condition keywords
        hasFirm: pageText.includes('FIRM'),
        hasGood: pageText.includes('GOOD'),
        hasSoft: pageText.includes('SOFT'),
        hasHeavy: pageText.includes('HEAVY'),
        // Extract first 3 paragraphs
        lines: pageText.split('\n').filter(l => l.trim().length > 0).slice(0, 20)
      };
    });

    console.log(`✅ Page loaded successfully`);
    console.log(`📄 Title: ${pageData.title}`);
    console.log(`📊 Text length: ${pageData.textLength} chars`);
    console.log(`\n📋 First lines:`);
    pageData.lines.forEach((line, i) => {
      if (i < 10) console.log(`  ${i+1}. ${line.substring(0, 80)}`);
    });

    console.log(`\n🔍 Condition keywords found:`);
    console.log(`  FIRM: ${pageData.hasFirm ? '✅' : '❌'}`);
    console.log(`  GOOD: ${pageData.hasGood ? '✅' : '❌'}`);
    console.log(`  SOFT: ${pageData.hasSoft ? '✅' : '❌'}`);
    console.log(`  HEAVY: ${pageData.hasHeavy ? '✅' : '❌'}`);

    await browser.close();
    return { success: true, data: pageData };
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    if (browser) await browser.close();
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('🏃 Testing track condition sources...\n');
  
  for (const urlData of urls) {
    await testUrl(urlData);
    // Wait between requests
    await new Promise(r => setTimeout(r, 1000));
  }
  
  process.exit(0);
}

main().catch(console.error);
