import db from '../db.js';

async function cleanupOrphanedRunners() {
  console.log('🧹 Cleaning up orphaned race runners...\n');

  try {
    // Find all race_runners with orphaned foreign keys
    const orphaned = db.prepare(`
      SELECT
        SUM(CASE WHEN horse_id NOT IN (SELECT id FROM horses) THEN 1 ELSE 0 END) as orphaned_horses,
        SUM(CASE WHEN jockey_id NOT IN (SELECT id FROM jockeys) THEN 1 ELSE 0 END) as orphaned_jockeys,
        SUM(CASE WHEN trainer_id NOT IN (SELECT id FROM trainers) THEN 1 ELSE 0 END) as orphaned_trainers
      FROM race_runners
    `).get();

    console.log('Found orphaned references:');
    console.log(`  - Orphaned horses: ${orphaned.orphaned_horses}`);
    console.log(`  - Orphaned jockeys: ${orphaned.orphaned_jockeys}`);
    console.log(`  - Orphaned trainers: ${orphaned.orphaned_trainers}\n`);

    let deletedCount = 0;

    // Delete runners with orphaned horses
    if (orphaned.orphaned_horses > 0) {
      const result = db.prepare(`
        DELETE FROM race_runners
        WHERE horse_id NOT IN (SELECT id FROM horses)
      `).run();
      deletedCount += result.changes;
      console.log(`✓ Deleted ${result.changes} runners with orphaned horses`);
    }

    // Delete runners with orphaned jockeys
    if (orphaned.orphaned_jockeys > 0) {
      const result = db.prepare(`
        DELETE FROM race_runners
        WHERE jockey_id NOT IN (SELECT id FROM jockeys)
      `).run();
      deletedCount += result.changes;
      console.log(`✓ Deleted ${result.changes} runners with orphaned jockeys`);
    }

    // Delete runners with orphaned trainers
    if (orphaned.orphaned_trainers > 0) {
      const result = db.prepare(`
        DELETE FROM race_runners
        WHERE trainer_id NOT IN (SELECT id FROM trainers)
      `).run();
      deletedCount += result.changes;
      console.log(`✓ Deleted ${result.changes} runners with orphaned trainers`);
    }

    console.log(`\n✅ Cleanup complete! Removed ${deletedCount} orphaned runner records.\n`);

    // Verify
    const remaining = db.prepare(`
      SELECT
        SUM(CASE WHEN horse_id NOT IN (SELECT id FROM horses) THEN 1 ELSE 0 END) as orphaned_horses,
        SUM(CASE WHEN jockey_id NOT IN (SELECT id FROM jockeys) THEN 1 ELSE 0 END) as orphaned_jockeys,
        SUM(CASE WHEN trainer_id NOT IN (SELECT id FROM trainers) THEN 1 ELSE 0 END) as orphaned_trainers,
        COUNT(*) as total_runners
      FROM race_runners
    `).get();

    console.log('📊 Verification:');
    console.log(`  - Total race_runners: ${remaining.total_runners}`);
    console.log(`  - Orphaned horses: ${remaining.orphaned_horses}`);
    console.log(`  - Orphaned jockeys: ${remaining.orphaned_jockeys}`);
    console.log(`  - Orphaned trainers: ${remaining.orphaned_trainers}\n`);

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }

  process.exit(0);
}

cleanupOrphanedRunners();
