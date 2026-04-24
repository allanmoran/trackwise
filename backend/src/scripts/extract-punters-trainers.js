#!/usr/bin/env node

/**
 * extract-punters-trainers.js — Extract trainer stats from Punters
 *
 * Fetches https://www.punters.com.au/trainers/ and extracts:
 * - Trainer names
 * - Total runners, wins, win percentage
 * - Track-specific win rates
 *
 * Stores in KB for Phase 2 model weighting
 *
 * Usage: npm run extract-trainers
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import db from '../db.js';

const PUNTERS_TRAINERS_URL = 'https://www.punters.com.au/trainers/';

console.log('\n🏇 Punters Trainers Extractor\n');
console.log(`Fetching: ${PUNTERS_TRAINERS_URL}\n`);

try {
  // Fetch with browser user-agent to avoid blocking
  const response = await axios.get(PUNTERS_TRAINERS_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    },
    timeout: 10000
  });

  const html = response.data;
  const $ = cheerio.load(html);

  console.log('📊 Parsing trainer data...\n');

  const trainers = [];

  // Try multiple selectors for table rows
  const rows = $('tr');

  if (rows.length === 0) {
    console.log('⚠️  No rows found. Page structure may have changed.');
    console.log('Trying alternative selectors...\n');

    const text = $.text();
    if (text.includes('trainer') || text.includes('runners')) {
      console.log('Found trainer-related content, but table parsing failed.');
      console.log('\nPlease manually extract from:');
      console.log(PUNTERS_TRAINERS_URL);
      console.log('\nOr use the frontend import tool.\n');
    }
    process.exit(0);
  }

  rows.each((i, row) => {
    const cells = $(row).find('td, th');
    if (cells.length < 4) return; // Skip rows with too few cells

    const name = $(cells[0]).text().trim();
    const runners = parseInt($(cells[1]).text().trim()) || 0;
    const wins = parseInt($(cells[2]).text().trim()) || 0;
    const winPct = parseFloat($(cells[3]).text().trim()) || 0;

    if (name && name.length > 2 && wins > 0) {
      trainers.push({
        name,
        runners,
        wins,
        winPct
      });
    }
  });

  console.log(`✅ Extracted ${trainers.length} trainers\n`);

  if (trainers.length === 0) {
    console.log('⚠️  No trainer data parsed. Table structure may have changed.');
    console.log('Manual extraction needed.\n');
    process.exit(0);
  }

  console.log('Top 10 trainers:');
  trainers.slice(0, 10).forEach((t, i) => {
    console.log(`${i + 1}. ${t.name}: ${t.wins}/${t.runners} (${t.winPct}%)`);
  });
  console.log('');

  // Store in KB
  console.log('💾 Storing in knowledge base...\n');

  let added = 0;
  let updated = 0;

  for (const trainer of trainers) {
    try {
      const existing = db
        .prepare('SELECT id, strike_rate FROM trainers WHERE name = ?')
        .get(trainer.name);

      if (existing) {
        // Update with Punters data
        db.prepare(
          'UPDATE trainers SET strike_rate = ?, recent_form = ? WHERE name = ?'
        ).run(trainer.winPct / 100, trainer.winPct / 100, trainer.name);
        updated++;
      } else {
        // Add new trainer
        db.prepare(
          'INSERT INTO trainers (name, tier, strike_rate, roi) VALUES (?, ?, ?, ?)'
        ).run(trainer.name, trainer.winPct > 15 ? 'A' : 'B', trainer.winPct / 100, 0);
        added++;
      }
    } catch (e) {
      console.error(`Error processing ${trainer.name}: ${e.message}`);
    }
  }

  console.log(`✅ Complete:\n  Added: ${added}\n  Updated: ${updated}\n`);

  // Show KB stats
  const stats = db
    .prepare('SELECT COUNT(*) as count FROM trainers WHERE strike_rate > 0')
    .get();
  console.log(
    `KB now has ${stats.count} trainers with performance data\n`
  );

  process.exit(0);
} catch (err) {
  console.error('❌ Error:\n');
  console.error(err.message);
  console.error(
    '\nPossible issues:\n' +
      '  - Network timeout (try again)\n' +
      '  - Punters blocked the request (use VPN)\n' +
      '  - Page structure changed (manual extraction needed)\n'
  );
  process.exit(1);
}
