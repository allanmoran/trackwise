#!/usr/bin/env node

/**
 * extract-punters-horses.js — Extract horse stats from Punters
 *
 * Provides browser console script to extract horses from:
 * https://www.punters.com.au/stats/horses/
 *
 * Usage: npm run extract-horses
 *
 * This shows extraction instructions and provides a browser console script
 * to copy/paste for manual extraction (since Punters page is heavily JS-rendered)
 */

console.log('\n🐴 Punters Horse Stats Extractor\n');
console.log('═'.repeat(60));
console.log('\nTo extract horse stats from Punters:\n');
console.log('1. Visit: https://www.punters.com.au/stats/horses/\n');
console.log('2. Open browser DevTools (F12 or Cmd+Opt+I)\n');
console.log('3. Go to the Console tab\n');
console.log('4. Copy and paste the script below:\n');
console.log('─'.repeat(60) + '\n');

const script = `
// Extract horses from Punters stats page
const horses = [];
const rows = document.querySelectorAll('table tbody tr, [role="table"] [role="row"]');
console.log(\`Found \${rows.length} rows\`);

rows.forEach((row) => {
  const cells = row.querySelectorAll('td, th');
  if (cells.length < 3) return;

  const name = cells[0]?.textContent?.trim() || '';
  const wins = parseInt(cells[1]?.textContent?.trim()) || 0;
  const places = parseInt(cells[2]?.textContent?.trim()) || 0;
  const starts = parseInt(cells[3]?.textContent?.trim()) || 0;

  if (name && name.length > 2 && starts > 0) {
    horses.push({
      horse: name.toUpperCase(),
      wins,
      places,
      shows: 0,
      starts,
      earnings: 0,
      best_distance: null,
      best_track: null,
      form_line: null,
      barrier_wins: 0,
      barrier_attempts: 0
    });
  }
});

console.log(\`Extracted \${horses.length} horses\`);

// Send to API
if (horses.length > 0) {
  fetch('http://localhost:3001/api/enrich/horse-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: horses })
  })
    .then(r => r.json())
    .then(d => console.log('✅ Stored:', d.summary))
    .catch(e => console.error('❌ API Error:', e.message));
} else {
  console.log('⚠️  No horses found. Check page structure.');
}
`;

console.log(script);

console.log('\n' + '─'.repeat(60) + '\n');
console.log('What the script does:\n');
console.log('  • Finds all horse rows in the table');
console.log('  • Extracts: name, wins, places, starts');
console.log('  • Sends to backend API at http://localhost:3001');
console.log('  • Updates KB with horse stats\n');

console.log('Requirements:\n');
console.log('  ✓ Backend must be running (npm run dev in /backend)');
console.log('  ✓ Punters page must be fully loaded');
console.log('  ✓ Table data must be visible\n');

console.log('═'.repeat(60) + '\n');

process.exit(0);
