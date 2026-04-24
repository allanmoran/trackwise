#!/usr/bin/env node

/**
 * extract-punters-jockeys.js — Extract jockey stats from Punters
 *
 * Fetches https://www.punters.com.au/jockeys/ and extracts:
 * - Jockey names
 * - Total rides, wins, win percentage
 * - Track-specific win rates
 *
 * Stores in KB for Phase 2 model weighting
 *
 * Usage: npm run extract-jockeys
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import db from '../db.js';

const PUNTERS_JOCKEYS_URL = 'https://www.punters.com.au/jockeys/';

console.log('\n🏇 Punters Jockeys Extractor\n');
console.log(`Fetching: ${PUNTERS_JOCKEYS_URL}\n`);

try {
  // Fetch with browser user-agent to avoid blocking
  const response = await axios.get(PUNTERS_JOCKEYS_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    },
    timeout: 10000
  });

  const html = response.data;
  const $ = cheerio.load(html);

  console.log('📊 Parsing jockey data...\n');

  const jockeys = [];

  // Try multiple selectors for table rows
  const rows = $('tr');

  if (rows.length === 0) {
    console.log('⚠️  No rows found. Page structure may have changed.');
    console.log('Trying alternative selectors...\n');

    // Alternative: look for any text containing jockey stats
    const text = $.text();
    if (text.includes('jockey') || text.includes('rides')) {
      console.log('Found jockey-related content, but table parsing failed.');
      console.log('\nPlease manually extract from:');
      console.log(PUNTERS_JOCKEYS_URL);
      console.log('\nOr use the frontend import tool.\n');
    }
    process.exit(0);
  }

  rows.each((i, row) => {
    const cells = $(row).find('td, th');
    if (cells.length < 4) return; // Skip rows with too few cells

    const name = $(cells[0]).text().trim();
    const rides = parseInt($(cells[1]).text().trim()) || 0;
    const wins = parseInt($(cells[2]).text().trim()) || 0;
    const winPct = parseFloat($(cells[3]).text().trim()) || 0;

    if (name && name.length > 2 && wins > 0) {
      jockeys.push({
        name,
        rides,
        wins,
        winPct
      });
    }
  });

  console.log(`✅ Extracted ${jockeys.length} jockeys\n`);

  if (jockeys.length === 0) {
    console.log('⚠️  No jockey data parsed. Table structure may have changed.');
    console.log('Manual extraction needed.\n');
    process.exit(0);
  }

  console.log('Top 10 jockeys:');
  jockeys.slice(0, 10).forEach((j, i) => {
    console.log(`${i + 1}. ${j.name}: ${j.wins}/${j.rides} (${j.winPct}%)`);
  });
  console.log('');

  // Store in KB
  console.log('💾 Storing in knowledge base...\n');

  let added = 0;
  let updated = 0;

  for (const jockey of jockeys) {
    try {
      const existing = db
        .prepare('SELECT id, strike_rate FROM jockeys WHERE name = ?')
        .get(jockey.name);

      if (existing) {
        // Update with Punters data
        db.prepare(
          'UPDATE jockeys SET strike_rate = ?, recent_form = ? WHERE name = ?'
        ).run(jockey.winPct / 100, jockey.winPct / 100, jockey.name);
        updated++;
      } else {
        // Add new jockey
        db.prepare(
          'INSERT INTO jockeys (name, tier, strike_rate, roi) VALUES (?, ?, ?, ?)'
        ).run(jockey.name, jockey.winPct > 20 ? 'A' : 'B', jockey.winPct / 100, 0);
        added++;
      }
    } catch (e) {
      console.error(`Error processing ${jockey.name}: ${e.message}`);
    }
  }

  console.log(`✅ Complete:\n  Added: ${added}\n  Updated: ${updated}\n`);

  // Show KB stats
  const stats = db
    .prepare('SELECT COUNT(*) as count FROM jockeys WHERE strike_rate > 0')
    .get();
  console.log(`KB now has ${stats.count} jockeys with performance data\n`);

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
