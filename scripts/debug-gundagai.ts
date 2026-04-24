#!/usr/bin/env node
/**
 * Debug scraping for Gundagai R8 to see what's wrong
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function debugGundagai() {
  const url = 'https://www.sportsbetform.com.au/436044/3308967/';
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();

  try {
    console.log('Fetching:', url);
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

    const pageTitle = await page.title();
    console.log('Title:', pageTitle);

    // Get raw row data
    const rowData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 25);
      return rows.map((row, idx) => {
        const cells = Array.from(row.querySelectorAll('td'));
        return {
          index: idx,
          cellCount: cells.length,
          cell0: cells[0]?.textContent?.trim() || '',
          cell1: cells[1]?.textContent?.trim() || '',
          cell2: cells[2]?.textContent?.trim() || ''
        };
      });
    });

    console.log('\n=== First 20 rows of table ===');
    rowData.forEach(r => {
      const barrier = r.cell0.match(/^\d{1,2}$/) ? '✓' : '✗';
      console.log(`${barrier} Row ${r.index.toString().padStart(2)}: cells=[${r.cellCount}] [${r.cell0}] [${r.cell1}] [${r.cell2}]`);
    });

    // Test the extraction with ALL filtering steps visible
    const extractedData = await page.evaluate(() => {
      const result: {name: string, barrier: string, passed: boolean}[] = [];
      const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 25);

      rows.forEach((row, idx) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const barrierText = cells[0]?.textContent?.trim() || '';
          const nameText = cells[1]?.textContent?.trim() || '';

          const passBarrier = !!barrierText.match(/^\d{1,2}$/);
          const passLength = nameText.length > 2 && nameText.length < 50;

          if (passBarrier && passLength) {
            const lowerName = nameText.toLowerCase();
            const passBadWords = !(
              lowerName.includes('foaled') ||
              lowerName.includes('sire') ||
              lowerName.includes('dam') ||
              lowerName.includes('breeder') ||
              lowerName.includes('trainer') ||
              lowerName.includes('jockey') ||
              lowerName.includes('colours') ||
              lowerName.includes('barrier')
            );
            const passLetter = !!nameText.match(/^[A-Za-z]/);

            const passed = passBarrier && passLength && passBadWords && passLetter;

            result.push({
              name: nameText,
              barrier: barrierText,
              passed
            });
          }
        }
      });

      return result;
    });

    console.log('\n=== Extraction results ===');
    extractedData.forEach(item => {
      const symbol = item.passed ? '✅' : '❌';
      console.log(`${symbol} B${item.barrier}: ${item.name}`);
    });

    // Check if target horses are in the extracted list
    const targetHorses = ['Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace'];
    const extractedNames = extractedData.filter(d => d.passed).map(d => d.name);

    console.log('\n=== Target horse check ===');
    targetHorses.forEach(target => {
      const found = extractedNames.some(name => name.toLowerCase().includes(target.toLowerCase()));
      console.log(`${found ? '✅' : '❌'} ${target}`);
    });

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
    try {
      await browser.close();
    } catch {}
  }
}

debugGundagai();
