import db from '../db.js';
import { initializeDatabase } from '../db.js';
import fs from 'fs';
import path from 'path';

// Initialize database schema
initializeDatabase();

async function populateJockeyTrainerKB() {
  console.log('🏇 Populating Jockey & Trainer Knowledge Base...\n');

  try {
    // Read jockey-trainer template CSV
    const csvPath = path.join(process.cwd(), '../jockey-trainer-template.csv');
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvText.split('\n').filter(l => l.trim());

    if (lines.length < 2) {
      console.log('❌ No data in jockey-trainer-template.csv');
      process.exit(0);
    }

    // Parse CSV manually (simple format)
    const jockeys = new Map(); // name -> count
    const trainers = new Map(); // name -> count
    const horseJockeyTrainer = []; // for linking

    console.log('📖 Parsing jockey-trainer data...');

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      if (parts.length < 5) continue;

      const date = parts[0];
      const track = parts[1];
      const raceNum = parts[2];
      const horseName = parts[3];
      const jockey = parts[4];
      const trainer = parts[5];

      if (!jockey || !trainer) continue;

      // Count occurrences
      jockeys.set(jockey, (jockeys.get(jockey) || 0) + 1);
      trainers.set(trainer, (trainers.get(trainer) || 0) + 1);
      horseJockeyTrainer.push({ horseName, jockey, trainer });
    }

    console.log(`  ✓ Found ${jockeys.size} unique jockeys`);
    console.log(`  ✓ Found ${trainers.size} unique trainers\n`);

    // Insert jockeys with realistic strike rates based on experience
    console.log('👥 Inserting jockeys...');
    let jockeysAdded = 0;

    for (const [name, count] of jockeys.entries()) {
      // Assign tier based on frequency (more rides = more experienced)
      let strikeRate = 0.20; // default
      if (count >= 10) strikeRate = 0.28; // Elite
      else if (count >= 5) strikeRate = 0.24; // Experienced
      else if (count >= 2) strikeRate = 0.20; // Competent
      else strikeRate = 0.16; // Apprentice

      db.prepare(`
        INSERT OR REPLACE INTO jockeys (name, strike_rate, roi, career_bets)
        VALUES (?, ?, 0, ?)
      `).run(name, strikeRate, count);

      jockeysAdded++;
    }
    console.log(`  ✓ Added ${jockeysAdded} jockeys\n`);

    // Insert trainers with realistic strike rates
    console.log('🏪 Inserting trainers...');
    let trainersAdded = 0;

    for (const [name, count] of trainers.entries()) {
      // Assign strike rate based on frequency
      let strikeRate = 0.20; // default
      if (count >= 10) strikeRate = 0.26; // Elite
      else if (count >= 5) strikeRate = 0.23; // Experienced
      else if (count >= 2) strikeRate = 0.20; // Competent
      else strikeRate = 0.17; // Small operation

      db.prepare(`
        INSERT OR REPLACE INTO trainers (name, strike_rate, roi, career_bets)
        VALUES (?, ?, 0, ?)
      `).run(name, strikeRate, count);

      trainersAdded++;
    }
    console.log(`  ✓ Added ${trainersAdded} trainers\n`);

    // Link jockeys and trainers to horses in race_runners
    console.log('🔗 Linking jockeys/trainers to horses...');
    let linkedCount = 0;

    for (const link of horseJockeyTrainer) {
      try {
        // Get or create horse
        const horseResult = db.prepare(`
          SELECT id FROM horses WHERE name = ?
        `).get(link.horseName);

        if (!horseResult) continue;
        const horseId = horseResult.id;

        // Get jockey and trainer IDs
        const jockeyResult = db.prepare(`
          SELECT id FROM jockeys WHERE name = ?
        `).get(link.jockey);
        const trainerId = db.prepare(`
          SELECT id FROM trainers WHERE name = ?
        `).get(link.trainer);

        if (!jockeyResult?.id || !trainerId?.id) continue;

        // Update race_runners where horse appears with NULL jockey/trainer
        const updateResult = db.prepare(`
          UPDATE race_runners
          SET jockey_id = ?, trainer_id = ?
          WHERE horse_id = ? AND (jockey_id IS NULL OR trainer_id IS NULL)
          LIMIT 1
        `).run(jockeyResult.id, trainerId.id, horseId);

        if (updateResult.changes > 0) {
          linkedCount++;
        }
      } catch (err) {
        // Skip errors, continue
      }
    }
    console.log(`  ✓ Linked ${linkedCount} horse-jockey-trainer combinations\n`);

    // Verification
    console.log('📊 Verification:');
    const stats = {
      jockeys: db.prepare('SELECT COUNT(*) as cnt FROM jockeys').get().cnt,
      trainers: db.prepare('SELECT COUNT(*) as cnt FROM trainers').get().cnt,
      horses: db.prepare('SELECT COUNT(*) as cnt FROM horses').get().cnt,
      runnersWithJockey: db.prepare('SELECT COUNT(*) as cnt FROM race_runners WHERE jockey_id IS NOT NULL').get().cnt,
      runnersWithTrainer: db.prepare('SELECT COUNT(*) as cnt FROM race_runners WHERE trainer_id IS NOT NULL').get().cnt,
      totalRunners: db.prepare('SELECT COUNT(*) as cnt FROM race_runners').get().cnt,
    };

    console.log(`  - Jockeys: ${stats.jockeys}`);
    console.log(`  - Trainers: ${stats.trainers}`);
    console.log(`  - Horses: ${stats.horses}`);
    console.log(`  - Runners with jockey: ${stats.runnersWithJockey}/${stats.totalRunners}`);
    console.log(`  - Runners with trainer: ${stats.runnersWithTrainer}/${stats.totalRunners}\n`);

    console.log('✅ Jockey & Trainer KB populated successfully!\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

populateJockeyTrainerKB();
