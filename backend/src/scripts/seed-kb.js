import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsPath = path.join(__dirname, '../../../dist/data/results.json');

console.log('🌱 Seeding KB from results.json...\n');

try {
  const resultsData = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

  // Parse results and extract horse/jockey/trainer stats
  const horses = {};
  const jockeys = {};
  const trainers = {};
  const tracks = {};
  const conditions = {};

  let processedRaces = 0;

  // Iterate through results (structure from results.json meta)
  // For now, use the KB stats that are already in the file
  if (resultsData.bankroll) {
    console.log(`📊 Results data loaded: ${resultsData.meta.totalRaces} races, ${resultsData.meta.totalBets} bets`);
  }

  // Insert aggregate stats from kb.json if available
  const kbPath = path.join(__dirname, '../../../dist/data/kb.json');
  if (fs.existsSync(kbPath)) {
    const kbData = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));

    // Insert track stats
    if (kbData.tracks) {
      console.log(`\n📍 Processing ${Object.keys(kbData.tracks).length} tracks...`);
      for (const [track, stats] of Object.entries(kbData.tracks)) {
        db.prepare(`
          INSERT OR REPLACE INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'track',
          track,
          stats.b,
          stats.w,
          stats.p,
          stats.s,
          stats.r
        );
      }
    }

    // Insert condition stats
    if (kbData.conditions) {
      console.log(`🌧️  Processing ${Object.keys(kbData.conditions).length} track conditions...`);
      for (const [condition, stats] of Object.entries(kbData.conditions)) {
        db.prepare(`
          INSERT OR REPLACE INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'condition',
          condition,
          stats.b,
          stats.w,
          stats.p,
          stats.s,
          stats.r
        );
      }
    }

    // Insert barrier stats
    if (kbData.barriers) {
      console.log(`🚪 Processing ${Object.keys(kbData.barriers).length} barrier groups...`);
      for (const [barrier, stats] of Object.entries(kbData.barriers)) {
        db.prepare(`
          INSERT OR REPLACE INTO kb_stats (stat_type, stat_key, bets, wins, places, stake, return_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'barrier',
          barrier,
          stats.b,
          stats.w,
          stats.p,
          stats.s,
          stats.r
        );
      }
    }

    // Insert feature weights
    if (kbData.weights) {
      console.log(`⚖️  Processing feature weights...`);
      for (const [feature, weight] of Object.entries(kbData.weights)) {
        db.prepare(`
          INSERT OR REPLACE INTO kb_stats (stat_type, stat_key, stake)
          VALUES (?, ?, ?)
        `).run(
          'weight',
          feature,
          weight
        );
      }
    }
  }

  console.log('\n✅ Knowledge base seeded successfully!');
  console.log(`   Total bets in KB: ${resultsData.meta.totalBets}`);
  console.log(`   Total races: ${resultsData.meta.totalRaces}`);
  console.log(`   Strategy: ${resultsData.meta.strategyName}`);
  console.log(`   Bankroll: $${resultsData.bankroll.start} → $${resultsData.bankroll.current.toFixed(2)}`);

} catch (err) {
  console.error('❌ Seeding failed:', err.message);
  process.exit(1);
}
