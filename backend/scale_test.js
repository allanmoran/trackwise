import db from './src/db.js';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';

async function main() {
  console.log('\n🏃 SCALE TEST: 20+ Diverse Races\n');

  // Extract URLs
  console.log('📡 Extracting today\'s races...');
  const urlRes = await fetch(`${BASE_URL}/form-scraper/extract-urls`);
  const urlData = await urlRes.json();
  const allUrls = urlData.urls || [];
  console.log(`✅ Found ${allUrls.length} total races`);

  if (allUrls.length < 20) {
    console.log(`❌ Only ${allUrls.length} races available (need 20+)`);
    process.exit(1);
  }

  // Select diverse races across meetings
  const byMeeting = {};
  allUrls.forEach(u => {
    const m = u.url.split('/')[4];
    if (!byMeeting[m]) byMeeting[m] = [];
    byMeeting[m].push(u.url);
  });

  const selected = [];
  const meetings = Object.keys(byMeeting);
  console.log(`📊 Races across ${meetings.length} meetings`);

  for (let i = 0; i < 25 && selected.length < 25; i++) {
    const meetingIdx = i % meetings.length;
    const raceIdx = Math.floor(i / meetings.length);
    if (byMeeting[meetings[meetingIdx]][raceIdx]) {
      selected.push(byMeeting[meetings[meetingIdx]][raceIdx]);
    }
  }

  console.log(`🎯 Selected ${selected.length} races\n`);

  // Run batch scraper
  console.log(`🚀 Running batch scraper...`);
  const startTime = Date.now();

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
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n📊 BATCH RESULTS`);
  console.log('═'.repeat(70));
  console.log(`⏱️  Duration: ${duration}s (avg ${(duration / selected.length).toFixed(1)}s/race)`);
  console.log(`✅ Success: ${batch.successCount}/${batch.totalRaces}`);
  console.log(`❌ Failed: ${batch.errorCount}`);
  console.log(`👥 Total runners: ${batch.totalRunners}`);
  console.log(`📈 Avg/race: ${(batch.totalRunners / batch.successCount).toFixed(1)} runners`);

  // Validate data quality
  const today = new Date().toISOString().split('T')[0];
  const races = db.prepare(`
    SELECT id, track, race_number, distance,
           (SELECT COUNT(*) FROM race_runners WHERE race_id = races.id) as runners,
           (SELECT COUNT(*) FROM race_runners WHERE race_id = races.id AND barrier IS NOT NULL) as barriers,
           (SELECT COUNT(*) FROM race_runners WHERE race_id = races.id AND starting_odds IS NOT NULL) as odds,
           track_condition
    FROM races WHERE date = ? ORDER BY id DESC LIMIT ?
  `).all(today, batch.successCount);

  console.log(`\n📋 DATA QUALITY (sample of 10)`);
  console.log('═'.repeat(70));

  let barrierIssues = 0, oddsIssues = 0, conditionCovered = 0;

  races.slice(0, 10).forEach(r => {
    const b = r.barriers === r.runners ? '✅' : '⚠️';
    const o = r.odds > 0 ? '✅' : '⚠️';
    const c = r.track_condition ? '✅' : '❌';
    console.log(`  ${r.track} R${r.race_number}: ${r.runners}🏇 ${b} | odds ${o} | cond ${c}`);
    if (r.barriers !== r.runners) barrierIssues++;
    if (r.odds === 0) oddsIssues++;
    if (r.track_condition) conditionCovered++;
  });

  console.log(`\n✅ Barrier coverage: ${races.length - barrierIssues}/${races.length}`);
  console.log(`✅ Odds coverage: ${races.length - oddsIssues}/${races.length}`);
  console.log(`✅ Condition coverage: ${conditionCovered}/${races.length}`);

  // Edge cases
  const edges = db.prepare(`
    SELECT 
      SUM(CASE WHEN distance IS NULL THEN 1 ELSE 0 END) as no_dist,
      SUM(CASE WHEN race_number = 0 THEN 1 ELSE 0 END) as bad_num,
      SUM(CASE WHEN (SELECT COUNT(*) FROM race_runners WHERE race_id = races.id) < 3 THEN 1 ELSE 0 END) as few_runners
    FROM races WHERE date = ?
  `).get(today);

  console.log(`\n⚠️  Edge cases: no_distance=${edges.no_dist}, bad_race_num=${edges.bad_num}, <3_runners=${edges.few_runners}`);

  // Summary
  const successRate = ((batch.successCount / batch.totalRaces) * 100).toFixed(1);
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🎯 SCALE TEST COMPLETE - Success Rate: ${successRate}%`);
  console.log(`${'═'.repeat(70)}`);
  
  if (successRate > 95) {
    console.log(`✅ READY for Settlement Validation phase\n`);
  } else {
    console.log(`⚠️  Review edge cases before settling\n`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
