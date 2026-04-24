import db from './src/db.js';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';

async function main() {
  console.log('\n🏃 QUICK SCALE TEST: 6 Diverse Races\n');

  // Extract URLs
  const urlRes = await fetch(`${BASE_URL}/form-scraper/extract-urls`);
  const urlData = await urlRes.json();
  const allUrls = urlData.urls || [];

  // Select 6 diverse races
  const byMeeting = {};
  allUrls.forEach(u => {
    const m = u.url.split('/')[4];
    if (!byMeeting[m]) byMeeting[m] = [];
    byMeeting[m].push(u.url);
  });

  const selected = [];
  const meetings = Object.keys(byMeeting);
  for (let i = 0; i < 6; i++) {
    const meetingIdx = i % meetings.length;
    const raceIdx = Math.floor(i / meetings.length);
    if (byMeeting[meetings[meetingIdx]][raceIdx]) {
      selected.push(byMeeting[meetings[meetingIdx]][raceIdx]);
    }
  }

  console.log(`📊 Testing ${selected.length} races across ${meetings.length} meetings`);
  console.log(`🚀 Running batch scraper...`);
  const t0 = Date.now();

  const batchRes = await fetch(`${BASE_URL}/form-scraper/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: selected,
      autoBet: false,
      captureLiveOdds: false,
      minEv: 0.10
    })
  });

  const batch = await batchRes.json();
  const duration = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n📊 BATCH RESULTS`);
  console.log('═'.repeat(60));
  console.log(`⏱️  Duration: ${duration}s (avg ${(duration / selected.length).toFixed(1)}s/race)`);
  console.log(`✅ Success: ${batch.successCount}/${batch.totalRaces}`);
  console.log(`❌ Failed: ${batch.errorCount}`);
  console.log(`👥 Runners: ${batch.totalRunners} (${(batch.totalRunners / batch.successCount).toFixed(1)}/race)`);

  // Validate
  const today = new Date().toISOString().split('T')[0];
  const races = db.prepare(`
    SELECT id, track, race_number,
           (SELECT COUNT(*) FROM race_runners WHERE race_id = races.id) as runners,
           (SELECT COUNT(*) FROM race_runners WHERE race_id = races.id AND barrier IS NOT NULL) as barriers,
           (SELECT COUNT(*) FROM race_runners WHERE race_id = races.id AND starting_odds IS NOT NULL) as odds
    FROM races WHERE date = ? ORDER BY id DESC LIMIT ?
  `).all(today, batch.successCount);

  console.log(`\n📋 DATA QUALITY`);
  races.forEach(r => {
    const b = r.barriers === r.runners ? '✅' : '⚠️';
    const o = r.odds > 0 ? '✅' : '⚠️';
    console.log(`  ${r.track} R${r.race_number}: ${r.runners} runners ${b}barriers ${o}odds`);
  });

  const successRate = ((batch.successCount / batch.totalRaces) * 100).toFixed(1);
  console.log(`\n✅ Success Rate: ${successRate}%\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
