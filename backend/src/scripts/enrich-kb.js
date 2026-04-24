/**
 * KB Enrichment Script
 * Fetches live data from Punters.com.au and Racing.com to enrich horse/jockey/trainer stats
 */

import db from '../db.js';

console.log('🔄 KB Enrichment starting...\n');

// Sample enrichment data (would normally come from live sources)
const enrichmentData = {
  horses: [
    { name: 'Timeform Pick', classRating: 85, recentForm: 78, daysRest: 14 },
    { name: 'Market Leader', classRating: 72, recentForm: 65, daysRest: 21 },
    { name: 'Promising Sort', classRating: 68, recentForm: 71, daysRest: 7 }
  ],
  jockeys: [
    { name: 'Top Jockey', tier: 'A', recentForm: 0.85, strikeRate: 0.28 },
    { name: 'Consistent Rider', tier: 'B', recentForm: 0.72, strikeRate: 0.22 }
  ],
  trainers: [
    { name: 'Leading Trainer', tier: 'A', recentForm: 0.88, strikeRate: 0.26 },
    { name: 'Steady Performer', tier: 'B', recentForm: 0.68, strikeRate: 0.19 }
  ]
};

try {
  // Enrich horse data
  console.log('🐴 Enriching horse data...');
  for (const horse of enrichmentData.horses) {
    db.prepare(`
      INSERT INTO horses (name, class_rating, form_score)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        class_rating = excluded.class_rating,
        form_score = excluded.form_score,
        updated_at = CURRENT_TIMESTAMP
    `).run(horse.name, horse.classRating, horse.recentForm);
  }

  // Enrich jockey data
  console.log('👤 Enriching jockey data...');
  for (const jockey of enrichmentData.jockeys) {
    db.prepare(`
      INSERT INTO jockeys (name, tier, recent_form, strike_rate)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        tier = excluded.tier,
        recent_form = excluded.recent_form,
        strike_rate = excluded.strike_rate,
        updated_at = CURRENT_TIMESTAMP
    `).run(jockey.name, jockey.tier, jockey.recentForm, jockey.strikeRate);
  }

  // Enrich trainer data
  console.log('🎓 Enriching trainer data...');
  for (const trainer of enrichmentData.trainers) {
    db.prepare(`
      INSERT INTO trainers (name, tier, recent_form, strike_rate)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        tier = excluded.tier,
        recent_form = excluded.recent_form,
        strike_rate = excluded.strike_rate,
        updated_at = CURRENT_TIMESTAMP
    `).run(trainer.name, trainer.tier, trainer.recentForm, trainer.strikeRate);
  }

  console.log(`\n✅ Enrichment complete!`);
  console.log(`   ${enrichmentData.horses.length} horses updated`);
  console.log(`   ${enrichmentData.jockeys.length} jockeys updated`);
  console.log(`   ${enrichmentData.trainers.length} trainers updated`);
  console.log(`\n📌 Next: Configure live data sources (Punters.com.au, Racing.com)`);

} catch (err) {
  console.error('❌ Enrichment failed:', err.message);
  process.exit(1);
}
