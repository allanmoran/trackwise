import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function debugTable() {
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

    // Get table structure
    const tableInfo = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return { error: 'No table found' };

      const thead = table.querySelector('thead');
      const tbody = table.querySelector('tbody');

      const headers = [];
      if (thead) {
        thead.querySelectorAll('th').forEach((th, idx) => {
          headers.push(`Col${idx}: ${th.innerText?.trim().substring(0, 20)}`);
        });
      }

      const rows = [];
      if (tbody) {
        tbody.querySelectorAll('tr').forEach((tr, ridx) => {
          if (ridx > 3) return; // Just first 3 rows
          const cells = [];
          tr.querySelectorAll('td').forEach((td, cidx) => {
            cells.push(`C${cidx}=${td.innerText?.trim().substring(0, 30)}`);
          });
          rows.push(`Row${ridx}: [${cells.join('] [')}]`);
        });
      }

      return {
        headerCount: headers.length,
        headers,
        rows
      };
    });

    console.log('\n📊 TABLE STRUCTURE\n');
    console.log(`Headers (${tableInfo.headerCount}):`);
    tableInfo.headers.forEach(h => console.log(`  ${h}`));

    console.log(`\nFirst 3 data rows:`);
    tableInfo.rows.forEach(r => console.log(`  ${r}`));

    await browser.close();
  } catch (err) {
    console.error('Error:', err.message);
  }

  process.exit(0);
}

debugTable();
