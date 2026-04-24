import db from '../db.js';
import { initializeDatabase } from '../db.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const BASE_URL = 'https://betfair-datascientists.github.io/data/assets';

// Initialize database schema
initializeDatabase();

async function downloadCSV(filename) {
  const url = `${BASE_URL}/${filename}`;
  console.log(`📥 Downloading ${filename}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`   ⚠️ Not found (${response.status})`);
      return null;
    }

    const text = await response.text();
    console.log(`   ✓ Downloaded (${(text.length / 1024).toFixed(1)}KB)`);
    return text;
  } catch (err) {
    console.log(`   ✗ Error: ${err.message}`);
    return null;
  }
}

async function loadBetfairData() {
  console.log('🏇 Loading Betfair ANZ Thoroughbred data...\n');

  try {
    // Get current date and try to fetch current month + previous 2 months
    const now = new Date();
    const months = [];

    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      months.push({ filename: `ANZ_Thoroughbreds_${year}_${month}.csv`, year, month });
    }

    console.log('📅 Fetching recent months:\n');

    let totalRaces = 0;
    let totalRunners = 0;
    let totalSkipped = 0;

    for (const { filename, year, month } of months) {
      const csv = await downloadCSV(filename);
      if (!csv) continue;

      console.log(`\n   📊 Processing ${year}-${month}:`);

      // Parse CSV properly with PapaParse
      const parsed = Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
      });

      if (parsed.errors.length > 0) {
        console.log(`      ⚠️ Parse errors: ${parsed.errors.length}`);
      }

      if (!parsed.data || parsed.data.length === 0) {
        console.log(`      ⚠️ No data rows`);
        continue;
      }

      let racesAdded = 0;
      let runnersAdded = 0;

      for (const fields of parsed.data) {

        try {
          const date = fields['LOCAL_MEETING_DATE'];
          const track = fields['TRACK'];
          const raceNum = parseInt(fields['RACE_NO']);
          const distance = parseInt(fields['DISTANCE']) || null;
          const horseName = fields['SELECTION_NAME'];
          const bsp = parseFloat(fields['WIN_BSP']) || null;
          const result = fields['WIN_RESULT']?.toUpperCase() || null;

          // Validate critical fields
          if (!date || !track || !raceNum || !horseName) continue;

          // Get or create race
          const race = db.prepare(`
            SELECT id FROM races WHERE track = ? AND date = ? AND race_number = ?
          `).get(track, date, raceNum);

          let raceId;
          if (race) {
            raceId = race.id;
          } else {
            const raceResult = db.prepare(`
              INSERT INTO races (track, date, race_number, distance, condition)
              VALUES (?, ?, ?, ?, ?)
            `).run(track, date, raceNum, distance, 'Unknown');
            raceId = raceResult.lastInsertRowid;
            racesAdded++;
          }

          // Get or create horse
          const horseResult = db.prepare(`
            INSERT INTO horses (name) VALUES (?)
            ON CONFLICT(name) DO UPDATE SET name = excluded.name
            RETURNING id
          `).get(horseName);
          const horseId = horseResult?.id;

          // Insert race runner (Betfair data has no jockey/trainer)
          if (horseId) {
            db.prepare(`
              INSERT OR REPLACE INTO race_runners
              (race_id, horse_id, jockey_id, trainer_id, starting_odds, result)
              VALUES (?, ?, NULL, NULL, ?, ?)
            `).run(raceId, horseId, bsp, result);
            runnersAdded++;
          }
        } catch (err) {
          totalSkipped++;
        }
      }

      console.log(`      ✓ Added ${racesAdded} races, ${runnersAdded} runners`);
      totalRaces += racesAdded;
      totalRunners += runnersAdded;
    }

    // Initialize KB values
    console.log('\n\n🔧 Initializing Knowledge Base values...');
    db.prepare(`
      UPDATE horses SET
        strike_rate = COALESCE(strike_rate, 0.20),
        form_score = COALESCE(form_score, 55),
        roi = COALESCE(roi, 0)
      WHERE strike_rate IS NULL OR form_score IS NULL OR roi IS NULL
    `).run();

    db.prepare(`
      UPDATE jockeys SET
        strike_rate = COALESCE(strike_rate, 0.25),
        roi = COALESCE(roi, 0)
      WHERE strike_rate IS NULL OR roi IS NULL
    `).run();

    db.prepare(`
      UPDATE trainers SET
        strike_rate = COALESCE(strike_rate, 0.22),
        roi = COALESCE(roi, 0)
      WHERE strike_rate IS NULL OR roi IS NULL
    `).run();

    const stats = {
      races: db.prepare('SELECT COUNT(*) as cnt FROM races').get().cnt,
      runners: db.prepare('SELECT COUNT(*) as cnt FROM race_runners').get().cnt,
      horses: db.prepare('SELECT COUNT(*) as cnt FROM horses').get().cnt,
      jockeys: db.prepare('SELECT COUNT(*) as cnt FROM jockeys').get().cnt,
      trainers: db.prepare('SELECT COUNT(*) as cnt FROM trainers').get().cnt,
    };

    console.log('   ✓ KB initialized\n');
    console.log('📊 Final Statistics:');
    console.log(`  - Races: ${stats.races}`);
    console.log(`  - Race runners: ${stats.runners}`);
    console.log(`  - Horses: ${stats.horses}`);
    console.log(`  - Jockeys: ${stats.jockeys}`);
    console.log(`  - Trainers: ${stats.trainers}\n`);

    console.log('✅ Betfair data loaded successfully!\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

loadBetfairData();
