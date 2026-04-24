#!/usr/bin/env node

/**
 * scrape-punters-form.js — Extract jockey/trainer data from Punters form guide
 *
 * Uses axios to fetch the page + manual parsing
 * Avoids Puppeteer compatibility issues
 *
 * Usage:
 *   npm run scrape-punters
 *
 * Or with manual data:
 *   node src/scripts/scrape-punters-form.js --manual
 */

import axios from 'axios';
import db from '../db.js';
import fs from 'fs';
import path from 'path';

const PUNTERS_FORM_URL = 'https://www.punters.com.au/form-guide/';

console.log('\n🐎 Punters Form Guide - Data Enrichment\n');

// Check if manual mode
const manualMode = process.argv.includes('--manual');

if (manualMode) {
  console.log('📋 Manual Entry Mode\n');
  console.log('Create a CSV file at: punters-form-data.csv');
  console.log('\nFormat:');
  console.log('date,track,race_num,horse,jockey,trainer');
  console.log('2026-04-11,Rockhampton,1,SAILOR RUM,J. Phelan,M. Smith');
  console.log('2026-04-11,Rockhampton,1,ANSWERING,B. Johnson,T. Brown');
  console.log('2026-04-11,Rockhampton,3,PRESOCRATICS,K. Lee,P. Davis\n');

  // Create template if doesn't exist
  const templatePath = './punters-form-data.csv';
  if (!fs.existsSync(templatePath)) {
    fs.writeFileSync(
      templatePath,
      'date,track,race_num,horse,jockey,trainer\n# Fill in data above\n'
    );
    console.log(`✅ Created template: ${templatePath}\n`);
  }

  try {
    const csv = fs.readFileSync(templatePath, 'utf-8');
    const lines = csv
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#'));

    if (lines.length <= 1) {
      console.log(
        '⚠️  No data in CSV. Fill punters-form-data.csv with jockey/trainer data.\n'
      );
      process.exit(0);
    }

    console.log(`📝 Processing ${lines.length - 1} records from CSV\n`);

    let jockeysAdded = 0;
    let trainersAdded = 0;

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const [date, track, raceNum, horse, jockey, trainer] = lines[i]
        .split(',')
        .map(s => s.trim());

      if (!jockey && !trainer) continue;

      // Add jockey
      if (jockey) {
        const existing = db
          .prepare('SELECT id FROM jockeys WHERE name = ?')
          .get(jockey);
        if (!existing) {
          db.prepare(
            'INSERT INTO jockeys (name, tier, strike_rate, roi) VALUES (?, ?, ?, ?)'
          ).run(jockey, 'C', 0, 0);
          jockeysAdded++;
        }
      }

      // Add trainer
      if (trainer) {
        const existing = db
          .prepare('SELECT id FROM trainers WHERE name = ?')
          .get(trainer);
        if (!existing) {
          db.prepare(
            'INSERT INTO trainers (name, tier, strike_rate, roi) VALUES (?, ?, ?, ?)'
          ).run(trainer, 'C', 0, 0);
          trainersAdded++;
        }
      }
    }

    console.log(`✅ Enrichment complete:`);
    console.log(`   Jockeys added: ${jockeysAdded}`);
    console.log(`   Trainers added: ${trainersAdded}\n`);

    // Verify
    const stats = db.prepare('SELECT COUNT(*) as count FROM jockeys').get();
    console.log(
      `KB now has ${stats.count} total jockeys (including real ones)\n`
    );

    process.exit(0);
  } catch (err) {
    console.error('Error reading CSV:', err.message);
    process.exit(1);
  }
}

// Automated fetch mode (requires JavaScript rendering)
console.log('⚠️  WARNING: Punters form guide requires JavaScript rendering.\n');
console.log('Puppeteer not available on this system.\n');
console.log(
  'Options:\n' +
    '  1. Use manual mode: npm run scrape-punters -- --manual\n' +
    '     Then fill punters-form-data.csv with jockey/trainer data from:\n' +
    '     ' +
    PUNTERS_FORM_URL +
    '\n\n' +
    '  2. Use browser DevTools to extract data:\n' +
    '     - Open ' +
    PUNTERS_FORM_URL +
    '\n' +
    '     - Open DevTools (F12)\n' +
    '     - Run provided extraction script\n' +
    '     - Copy results to punters-form-data.csv\n\n'
);

process.exit(0);
