#!/usr/bin/env node
/**
 * Test the fixed extraction logic on Gundagai R8
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function testExtraction(url: string) {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();

  try {
    console.log(`Testing URL: ${url}\n`);
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

    const pageTitle = await page.title();
    console.log(`Page: ${pageTitle}\n`);

    // Test the FIXED extraction logic
    const horses = await page.evaluate(() => {
      const result: string[] = [];
      const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 25);

      console.log(`Processing ${rows.length} rows...`);

      rows.forEach((row, idx) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const barrierText = cells[0]?.textContent?.trim() || '';
          const nameText = cells[1]?.textContent?.trim() || '';

          const isBarrier = barrierText.match(/^\d{1,2}$/);
          const isValidLength = nameText.length > 2 && nameText.length < 50;

          if (isBarrier && isValidLength) {
            const lowerName = nameText.toLowerCase();
            const isBadRow = (
              lowerName.includes('foaled') ||
              lowerName.includes('sire') ||
              lowerName.includes('dam') ||
              lowerName.includes('breeder') ||
              lowerName.includes('trainer') ||
              lowerName.includes('jockey') ||
              lowerName.includes('colours') ||
              lowerName.includes('barrier')
            );
            const startsWithLetter = nameText.match(/^[A-Za-z]/);

            if (!isBadRow && startsWithLetter) {
              result.push(nameText);
              console.log(`  ✓ Row ${idx}: Barrier ${barrierText} → ${nameText}`);
            } else {
              console.log(`  ✗ Row ${idx}: Barrier ${barrierText} → ${nameText} (filtered: badRow=${isBadRow}, letter=${!startsWithLetter})`);
            }
          } else {
            if (idx < 5) {
              console.log(`  - Row ${idx}: Barrier="[${barrierText}]" Name="[${nameText}]" (skip: barrier=${!isBarrier}, length=${!isValidLength})`);
            }
          }
        }
      });

      return result;
    });

    console.log(`\n✅ Found horses: ${horses.join(', ')}`);

    // Check for targets
    const TARGET_HORSES = ['Jannik', 'A Book Of Days', 'Rubi Air', 'Spirits Burn Deep', 'Ace Of Lace'];
    const found = horses.filter(h =>
      TARGET_HORSES.some(target => h.toLowerCase().includes(target.toLowerCase()))
    );

    console.log(`\n🎯 Target horses found: ${found.join(', ')}`);

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
    try {
      await browser.close();
    } catch {}
  }
}

testExtraction('https://www.sportsbetform.com.au/436044/3308967/');
