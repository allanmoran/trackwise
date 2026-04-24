import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function inspectPage() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    const url = 'https://www.sportsbetform.com.au/436044/3308955/';
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    // Get page structure info
    const pageInfo = await page.evaluate(() => {
      const info = {
        title: document.title,
        headings: [],
        tables: [],
        divClasses: new Set(),
        plainText: document.body.innerText.split('\n').slice(0, 50)
      };

      // Get all headings
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
        info.headings.push({
          tag: h.tagName,
          text: h.innerText?.trim().substring(0, 100)
        });
      });

      // Get table info
      document.querySelectorAll('table').forEach((t, idx) => {
        const rows = t.querySelectorAll('tr');
        const cols = t.querySelectorAll('td, th');
        info.tables.push({
          index: idx,
          rows: rows.length,
          cols: cols.length,
          firstRowText: rows[0]?.innerText?.substring(0, 100)
        });
      });

      // Get div classes
      document.querySelectorAll('div[class]').forEach(d => {
        Array.from(d.classList).forEach(c => {
          if (c.includes('runner') || c.includes('horse') || c.includes('form') || 
              c.includes('odd') || c.includes('odds') || c.includes('row') || c.includes('card')) {
            info.divClasses.add(c);
          }
        });
      });

      return info;
    });

    console.log('📄 Page Structure Analysis\n');
    console.log(`Title: ${pageInfo.title}\n`);

    console.log('Headings:');
    pageInfo.headings.forEach(h => {
      console.log(`  ${h.tag}: ${h.text}`);
    });

    console.log(`\nTables Found: ${pageInfo.tables.length}`);
    pageInfo.tables.forEach(t => {
      console.log(`  Table ${t.index}: ${t.rows} rows, ${t.cols} cols`);
      console.log(`    First row: ${t.firstRowText}`);
    });

    console.log(`\nRelevant CSS Classes:`);
    Array.from(pageInfo.divClasses).forEach(c => {
      console.log(`  .${c}`);
    });

    console.log('\nFirst 50 lines of page text:');
    console.log('-'.repeat(80));
    pageInfo.plainText.forEach(line => {
      if (line.trim()) console.log(line.substring(0, 100));
    });

    await browser.close();
  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

inspectPage();
