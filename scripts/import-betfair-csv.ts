#!/usr/bin/env node
/**
 * Import Betfair CSV racing data into KB
 * Transforms Betfair SP CSV format into KB import format
 * Usage: npx ts-node scripts/import-betfair-csv.ts <csv-file-url-or-path>
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import fs from 'node:fs';
import https from 'node:https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

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
    // Parse date/time
    const [datePart] = row.event_dt.split(' ');
    const [day, month, year] = datePart.split('-');
    const date = `${year}-${month}-${day}`; // Convert to YYYY-MM-DD

    // Extract track from menu_hint (e.g., "Mildura (AUS)" -> "Mildura")
    const track = row.menu_hint.split('(')[0].trim();

    // Extract race number from event_name (e.g., "R3 1790m Pace M" -> 3)
    const raceMatch = row.event_name.match(/R(\d+)/);
    const raceNum = raceMatch ? parseInt(raceMatch[1]) : 1;

    // Create race key
    const raceKey = `${date}-${track}-${raceNum}`;

    // Get or create race
    if (!races.has(raceKey)) {
      races.set(raceKey, {
        date,
        track,
        raceNum,
        runners: [],
      });
    }

    const race = races.get(raceKey)!;

    // Extract horse name (remove number prefix like "10. Elissas Delight" -> "Elissas Delight")
    const horseName = row.selection_name.replace(/^\d+\.\s+/, '').trim();

    // Determine result (Betfair: 1 = won, 0 = lost, we'll treat as WIN/LOSS)
    const result = row.win_lose === '1' ? 'WIN' : 'LOSS';

    race.runners.push({
      horseName,
      jockey: 'Unknown', // Betfair CSV doesn't have jockey info
      trainer: 'Unknown', // Betfair CSV doesn't have trainer info
      result,
    });
  }

  return Array.from(races.values());
}

async function importToBackend(races: KBRace[]): Promise<void> {
  const url = 'http://localhost:3001/api/kb/import';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(races),
  });

  const data = await response.json();

  if (data.success) {
    console.log(`✅ Imported ${races.length} races`);
    console.log(`   Processed: ${data.racesProcessed} races, ${data.statsUpdated} stats updated`);
  } else {
    console.error('❌ Import failed:', data.message || data.error);
  }
}

async function main() {
  const csvUrl =
    process.argv[2] ||
    'https://promo.betfair.com/betfairsp/prices/dwbfpricesauswin08042026.csv';

  try {
    console.log(`[Betfair KB Import]`);
    console.log(`📥 Downloading CSV from Betfair...`);

    const csv = await downloadCSV(csvUrl);
    console.log(`✓ Downloaded ${csv.split('\n').length - 1} rows`);

    console.log(`🔄 Parsing Betfair format...`);
    const betfairRows = parseCSV(csv);
    console.log(`✓ Parsed ${betfairRows.length} rows`);

    console.log(`📊 Transforming to KB format...`);
    const races = transformToKB(betfairRows);
    console.log(`✓ Transformed into ${races.length} races`);

    // Show sample
    console.log(`\n📋 Sample races:`);
    races.slice(0, 3).forEach((race) => {
      console.log(`  ${race.date} ${race.track} R${race.raceNum}: ${race.runners.length} runners`);
    });

    console.log(`\n⏳ Importing to backend...`);
    await importToBackend(races);

    console.log(`\n✅ KB population complete!`);
  } catch (err) {
    console.error('[Error]', err);
    process.exit(1);
  }
}

main();
