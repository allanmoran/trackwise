import db from '../db.js';

async function fixKBData() {
  console.log('🔧 Fixing Knowledge Base data corruption...\n');

  try {
    // Step 1: Delete corrupted jockeys (names that are just numbers)
    console.log('Step 1: Removing corrupted jockey records...');
    const corruptedJockeys = db.prepare(`
      SELECT id, name FROM jockeys
      WHERE name IN ('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12')
    `).all();

    if (corruptedJockeys.length > 0) {
      console.log(`  Found ${corruptedJockeys.length} corrupted jockey records:`);
      corruptedJockeys.forEach(j => console.log(`    - ID ${j.id}: "${j.name}"`));

      const jockeyIds = corruptedJockeys.map(j => j.id);

      // Delete race_runners first
      const runnersResult = db.prepare(`
        DELETE FROM race_runners
        WHERE jockey_id IN (${jockeyIds.map(() => '?').join(',')})
      `).run(...jockeyIds);
      console.log(`  ✓ Deleted ${runnersResult.changes} race_runners with corrupted jockeys`);

      // Delete bets
      const betsResult = db.prepare(`
        DELETE FROM bets
        WHERE jockey_id IN (${jockeyIds.map(() => '?').join(',')})
      `).run(...jockeyIds);
      console.log(`  ✓ Deleted ${betsResult.changes} bets with corrupted jockeys`);

      // Delete the jockeys
      db.prepare(`
        DELETE FROM jockeys
        WHERE name IN ('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12')
      `).run();
      console.log(`  ✓ Deleted ${corruptedJockeys.length} corrupted jockeys\n`);
    } else {
      console.log('  ✓ No corrupted jockeys found\n');
    }

    // Step 2: Initialize horses strike_rate (default 0.15 = 15%)
    console.log('Step 2: Initializing horse strike_rate...');
    const horsesNullStrike = db.prepare(`
      SELECT COUNT(*) as cnt FROM horses WHERE strike_rate IS NULL
    `).get();

    if (horsesNullStrike.cnt > 0) {
      db.prepare(`
        UPDATE horses
        SET strike_rate = 0.15
        WHERE strike_rate IS NULL
      `).run();
      console.log(`  ✓ Initialized ${horsesNullStrike.cnt} horses with strike_rate = 0.15\n`);
    } else {
      console.log('  ✓ All horses already have strike_rate\n');
    }

    // Step 3: Initialize horses form_score (default 50)
    console.log('Step 3: Initializing horse form_score...');
    const horsesNullForm = db.prepare(`
      SELECT COUNT(*) as cnt FROM horses WHERE form_score IS NULL
    `).get();

    if (horsesNullForm.cnt > 0) {
      db.prepare(`
        UPDATE horses
        SET form_score = 50
        WHERE form_score IS NULL
      `).run();
      console.log(`  ✓ Initialized ${horsesNullForm.cnt} horses with form_score = 50\n`);
    } else {
      console.log('  ✓ All horses already have form_score\n');
    }

    // Step 4: Initialize horses roi (default 0)
    console.log('Step 4: Initializing horse ROI...');
    const horsesNullROI = db.prepare(`
      SELECT COUNT(*) as cnt FROM horses WHERE roi IS NULL
    `).get();

    if (horsesNullROI.cnt > 0) {
      db.prepare(`
        UPDATE horses
        SET roi = 0
        WHERE roi IS NULL
      `).run();
      console.log(`  ✓ Initialized ${horsesNullROI.cnt} horses with roi = 0\n`);
    } else {
      console.log('  ✓ All horses already have roi\n');
    }

    // Step 5: Initialize jockeys strike_rate (default 0.20 = 20%)
    console.log('Step 5: Initializing jockey strike_rate...');
    const jockeysNullStrike = db.prepare(`
      SELECT COUNT(*) as cnt FROM jockeys WHERE strike_rate IS NULL
    `).get();

    if (jockeysNullStrike.cnt > 0) {
      db.prepare(`
        UPDATE jockeys
        SET strike_rate = 0.20
        WHERE strike_rate IS NULL
      `).run();
      console.log(`  ✓ Initialized ${jockeysNullStrike.cnt} jockeys with strike_rate = 0.20\n`);
    } else {
      console.log('  ✓ All jockeys already have strike_rate\n');
    }

    // Step 6: Initialize jockeys roi (default 0)
    console.log('Step 6: Initializing jockey ROI...');
    const jockeysNullROI = db.prepare(`
      SELECT COUNT(*) as cnt FROM jockeys WHERE roi IS NULL
    `).get();

    if (jockeysNullROI.cnt > 0) {
      db.prepare(`
        UPDATE jockeys
        SET roi = 0
        WHERE roi IS NULL
      `).run();
      console.log(`  ✓ Initialized ${jockeysNullROI.cnt} jockeys with roi = 0\n`);
    } else {
      console.log('  ✓ All jockeys already have roi\n');
    }

    // Step 7: Initialize trainers strike_rate (default 0.18 = 18%)
    console.log('Step 7: Initializing trainer strike_rate...');
    const trainersNullStrike = db.prepare(`
      SELECT COUNT(*) as cnt FROM trainers WHERE strike_rate IS NULL
    `).get();

    if (trainersNullStrike.cnt > 0) {
      db.prepare(`
        UPDATE trainers
        SET strike_rate = 0.18
        WHERE strike_rate IS NULL
      `).run();
      console.log(`  ✓ Initialized ${trainersNullStrike.cnt} trainers with strike_rate = 0.18\n`);
    } else {
      console.log('  ✓ All trainers already have strike_rate\n');
    }

    // Step 8: Initialize trainers roi (default 0)
    console.log('Step 8: Initializing trainer ROI...');
    const trainersNullROI = db.prepare(`
      SELECT COUNT(*) as cnt FROM trainers WHERE roi IS NULL
    `).get();

    if (trainersNullROI.cnt > 0) {
      db.prepare(`
        UPDATE trainers
        SET roi = 0
        WHERE roi IS NULL
      `).run();
      console.log(`  ✓ Initialized ${trainersNullROI.cnt} trainers with roi = 0\n`);
    } else {
      console.log('  ✓ All trainers already have roi\n');
    }

    // Step 9: Verification summary
    console.log('📊 Verification Summary:');

    const horsesStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN strike_rate IS NOT NULL THEN 1 ELSE 0 END) as with_strike,
        SUM(CASE WHEN form_score IS NOT NULL THEN 1 ELSE 0 END) as with_form,
        SUM(CASE WHEN roi IS NOT NULL THEN 1 ELSE 0 END) as with_roi
      FROM horses
    `).get();

    console.log(`  Horses: ${horsesStats.total} total`);
    console.log(`    - ${horsesStats.with_strike}/${horsesStats.total} have strike_rate`);
    console.log(`    - ${horsesStats.with_form}/${horsesStats.total} have form_score`);
    console.log(`    - ${horsesStats.with_roi}/${horsesStats.total} have roi`);

    const jockeysStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN strike_rate IS NOT NULL THEN 1 ELSE 0 END) as with_strike,
        SUM(CASE WHEN roi IS NOT NULL THEN 1 ELSE 0 END) as with_roi
      FROM jockeys
    `).get();

    console.log(`  Jockeys: ${jockeysStats.total} total`);
    console.log(`    - ${jockeysStats.with_strike}/${jockeysStats.total} have strike_rate`);
    console.log(`    - ${jockeysStats.with_roi}/${jockeysStats.total} have roi`);

    const trainersStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN strike_rate IS NOT NULL THEN 1 ELSE 0 END) as with_strike,
        SUM(CASE WHEN roi IS NOT NULL THEN 1 ELSE 0 END) as with_roi
      FROM trainers
    `).get();

    console.log(`  Trainers: ${trainersStats.total} total`);
    console.log(`    - ${trainersStats.with_strike}/${trainersStats.total} have strike_rate`);
    console.log(`    - ${trainersStats.with_roi}/${trainersStats.total} have roi`);

    console.log('\n✅ Knowledge Base data fixed successfully!\n');

  } catch (err) {
    console.error('❌ Error fixing KB data:', err);
    process.exit(1);
  }

  process.exit(0);
}

fixKBData();
