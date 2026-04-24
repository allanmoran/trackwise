#!/usr/bin/env node
/**
 * Import multiple days of Betfair CSV racing data
 * Downloads Betfair SP data for multiple dates to build larger KB
 *
 * Usage: npx tsx scripts/import-betfair-multi-days.ts
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import fs from 'node:fs';
import https from 'node:https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '');

interface BetfairRow {
  event_id: string;
  menu_hint: string;
  event_name: string;
  event_dt: string;
  selection_id: string;
  selection_name: string;
  win_lose: '0' | '1';
  bsp: string;
}

interface KBRace {
  date: string;
  track: string;
  raceNum: number;
  runners: Array<{
    horseName: string;
    jockey: string;
    trainer: string;
    result: 'WIN' | 'PLACE' | 'LOSS';
  }>;
}

async function downloadCSV(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCSV(csv: string): BetfairRow[] {
  const lines = csv.split('\n').filter((l) => l.trim());
  const headers = lines[0].split(',').map((h) => h.toLowerCase().trim());
  const rows: BetfairRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row: BetfairRow = {
      event_id: values[0],
      menu_hint: values[1],
      event_name: values[2],
      event_dt: values[3],
      selection_id: values[4],
      selection_name: values[5],
      win_lose: values[6] as '0' | '1',
      bsp: values[7],
    };
    rows.push(row);
  }

  return rows;
}

function transformToKB(betfairRows: BetfairRow[]): KBRace[] {
  const races = new Map<string, KBRace>();

  for (const row of betfairRows) {
    const [datePart] = row.event_dt.split(' ');
    const [day, month, year] = datePart.split('-');
    const date = `${year}-${month}-${day}`;

    const track = row.menu_hint.split('(')[0].trim();
    const raceMatch = row.event_name.match(/R(\d+)/);
    const raceNum = raceMatch ? parseInt(raceMatch[1]) : 1;

    const raceKey = `${date}-${track}-${raceNum}`;

    if (!races.has(raceKey)) {
      races.set(raceKey, {
        date,
        track,
        raceNum,
        runners: [],
      });
    }

    const race = races.get(raceKey)!;
    const horseName = row.selection_name.replace(/^\d+\.\s+/, '').trim();
    const result = row.win_lose === '1' ? 'WIN' : 'LOSS';

    race.runners.push({
      horseName,
      jockey: 'Unknown',
      trainer: 'Unknown',
      result,
    });
  }

  return Array.from(races.values());
}

async function importToBackend(races: KBRace[], dateStr: string): Promise<number> {
  const url = 'http://localhost:3001/api/kb/import';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(races),
  });

  const data = await response.json();

  if (data.success) {
    console.log(`✅ [${dateStr}] Imported ${races.length} races, ${data.statsUpdated} runners updated`);
    return data.statsUpdated;
  } else {
    console.error(`❌ [${dateStr}] Import failed:`, data.message || data.error);
    return 0;
  }
}

/**
 * Generate dates for Betfair CSV downloads
 * Betfair provides daily CSV files with format: dwbfpricesaus[DATE].csv
 */
function generateDates(daysBack: number): string[] {
  const dates: string[] = [];
  const today = new Date();

  for (let i = 0; i < daysBack; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    dates.push(`${year}${month}${day}`);
  }

  return dates;
}

async function main() {
  const daysBack = parseInt(process.argv[2] ?? '14', 10); // Default: 14 days

  console.log('[Betfair Multi-Day Import]');
  console.log(`📥 Importing ${daysBack} days of Betfair racing data...\n`);

  let totalRaces = 0;
  let totalRunners = 0;

  const dates = generateDates(daysBack);

  for (const dateStr of dates) {
    try {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      const displayDate = `${year}-${month}-${day}`;

      const url = `https://promo.betfair.com/betfairsp/prices/dwbfpricesaus${dateStr}win.csv`;

      console.log(`📥 Downloading ${displayDate}...`);

      const csv = await downloadCSV(url);
      console.log(`  ✓ Downloaded ${csv.split('\n').length - 1} rows`);

      const betfairRows = parseCSV(csv);
      console.log(`  ✓ Parsed ${betfairRows.length} rows`);

      const races = transformToKB(betfairRows);
      console.log(`  ✓ Transformed into ${races.length} races`);

      const runners = await importToBackend(races, displayDate);
      totalRaces += races.length;
      totalRunners += runners;

      // Rate limiting
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.log(`  ⚠ ${dateStr}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n✅ Import complete!`);
  console.log(`   Total races: ${totalRaces}`);
  console.log(`   Total runners: ${totalRunners}`);
  console.log(`   KB is now ready for better predictions\n`);

  await sql.end();
}

main().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
