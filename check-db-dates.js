import db from './backend/src/db.js';

console.log('📅 Checking date range in Knowledge Base...\n');

const dates = db.prepare(`
  SELECT 
    MIN(date) as earliest,
    MAX(date) as latest,
    COUNT(DISTINCT date) as unique_days,
    COUNT(*) as total_races
  FROM races
`).get();

console.log('Date Range:');
console.log(`  Earliest: ${dates.earliest}`);
console.log(`  Latest: ${dates.latest}`);
console.log(`  Unique days: ${dates.unique_days}`);
console.log(`  Total races: ${dates.total_races}`);

// Check today's date
const today = new Date().toISOString().split('T')[0];
console.log(`\nToday's date: ${today}`);

const todayRaces = db.prepare(`
  SELECT COUNT(*) as cnt FROM races WHERE date = ?
`).get(today);

console.log(`Races for today: ${todayRaces.cnt}`);

// Show recent races
const recent = db.prepare(`
  SELECT date, COUNT(*) as cnt
  FROM races
  GROUP BY date
  ORDER BY date DESC
  LIMIT 10
`).all();

console.log('\nMost recent race dates:');
recent.forEach(r => console.log(`  ${r.date}: ${r.cnt} races`));

process.exit(0);
