import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function debugScraper() {
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

    // Try different selector approaches
    const results = await page.evaluate(() => {
      const results = {};

      // Approach 1: tbody tr
      results.tbodyTr = [];
      document.querySelectorAll('tbody tr').forEach((tr, idx) => {
        if (idx > 2) return;
        const cells = tr.querySelectorAll('td');
        results.tbodyTr.push({
          rowIdx: idx,
          cellCount: cells.length,
          cells: Array.from(cells).map(c => c.innerText?.trim().substring(0, 30))
        });
      });

      // Approach 2: table tr (direct)
      results.tableTr = [];
      document.querySelectorAll('table tr').forEach((tr, idx) => {
        if (idx > 2) return;
        const cells = tr.querySelectorAll('td');
        if (cells.length > 0) {
          results.tableTr.push({
            rowIdx: idx,
            cellCount: cells.length,
            cells: Array.from(cells).map(c => c.innerText?.trim().substring(0, 30))
          });
        }
      });

      return results;
    });

    console.log('\n🔍 Scraper Debugging\n');
    
    console.log('tbody tr approach:');
    results.tbodyTr.forEach(r => {
      console.log(`  Row ${r.rowIdx}: ${r.cellCount} cells`);
      console.log(`    [${r.cells.slice(0, 5).join('] [')}]...`);
    });

    console.log('\ntable tr approach:');
    results.tableTr.forEach(r => {
      console.log(`  Row ${r.rowIdx}: ${r.cellCount} cells`);
      console.log(`    [${r.cells.slice(0, 5).join('] [')}]...`);
    });

    await browser.close();
  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

debugScraper();
