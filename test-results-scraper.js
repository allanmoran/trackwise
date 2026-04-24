#!/usr/bin/env node

/**
 * Test script for dedicated results scraper
 * Run: node test-results-scraper.js
 */

import { scrapeAllResults } from './backend/src/scrapers/results-scraper.js';

console.log('🏇 Starting results scraper test...\n');

const result = await scrapeAllResults();

console.log('\n📊 Final Result:');
console.log(JSON.stringify(result, null, 2));
