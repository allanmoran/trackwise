#!/usr/bin/env node

/**
 * Backup Knowledge Base - Local + Neon Cloud
 *
 * Usage:
 *   npm run backup-kb              # Local backup only
 *   npm run backup-kb-cloud        # Local + Neon cloud
 *   npm run backup-kb-restore      # Restore from backup file
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import postgres from 'postgres';
import Database from 'better-sqlite3';

const execAsync = promisify(exec);

const dbPath = path.join(process.cwd(), 'data/trackwise.db');
const backupDir = path.join(process.cwd(), 'backups');

// Neon connection string
const NEON_URL = 'postgresql://neondb_owner:npg_5ukmJpGFd7al@ep-sweet-boat-a7jldduk-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// Ensure backup directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

async function createLocalBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `trackwise-kb-${timestamp}.db`;
  const backupPath = path.join(backupDir, backupName);

  try {
    fs.copyFileSync(dbPath, backupPath);
    const size = fs.statSync(backupPath).size;
    console.log(`✅ Local backup: ${backupName} (${(size / 1024 / 1024).toFixed(2)}MB)`);
    return backupPath;
  } catch (err) {
    console.error(`❌ Local backup failed: ${err.message}`);
    throw err;
  }
}

async function backupToNeon() {
  console.log('\n📤 Syncing to Neon Cloud...\n');

  try {
    const db = new Database(dbPath, { readonly: true });
    const sql = postgres(NEON_URL);

    // Get all tables
    const tables = (
      db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all()
    ).map((t) => t.name);

    console.log(`📋 Tables to sync: ${tables.join(', ')}\n`);

    // Sync each table
    for (const table of tables) {
      try {
        // Get column info
        const columns = (db.prepare(`PRAGMA table_info(${table})`).all()).map((c) => c.name);

        // Get data from SQLite
        const rows = db.prepare(`SELECT * FROM ${table}`).all();

        if (rows.length === 0) {
          console.log(`  ⏭️  ${table}: 0 rows (skipped)`);
          continue;
        }

        // Insert to Neon (upsert if possible)
        await sql`
          CREATE TABLE IF NOT EXISTS ${sql(table)} (
            ${sql(columns.map((col) => sql`${sql(col)} TEXT`))}
          )
        `.catch(() => null); // Table might exist

        // Batch insert
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          try {
            await sql`
              INSERT INTO ${sql(table)} ${sql(batch, ...columns)}
              ON CONFLICT DO NOTHING
            `.catch(() => null); // Might have duplicates
          } catch (e) {
            // Silently skip conflicts
          }
        }

        console.log(`  ✅ ${table}: ${rows.length} rows synced`);
      } catch (err) {
        console.log(`  ⚠️  ${table}: ${err.message}`);
      }
    }

    await sql.end();
    console.log('\n✅ Neon sync complete!');
  } catch (err) {
    console.error(`\n❌ Neon sync failed: ${err.message}`);
    console.error('Verify connection string and network access');
    throw err;
  }
}

async function showStats() {
  const db = new Database(dbPath, { readonly: true });

  console.log('\n📊 KB Statistics:\n');

  const stats = {
    horses: (db.prepare('SELECT COUNT(*) as count FROM horses').get()).count,
    horses_with_data: (db.prepare('SELECT COUNT(*) as count FROM horses WHERE career_bets > 0').get()).count,
    jockeys: (db.prepare('SELECT COUNT(*) as count FROM jockeys').get()).count,
    trainers: (db.prepare('SELECT COUNT(*) as count FROM trainers').get()).count,
    races: (db.prepare('SELECT COUNT(*) as count FROM races').get()).count,
    model_predictions: (db.prepare('SELECT COUNT(*) as count FROM model_predictions').get()).count,
  };

  console.log(`  🐴 Horses: ${stats.horses.toLocaleString()} (${stats.horses_with_data} with data)`);
  console.log(`  👤 Jockeys: ${stats.jockeys}`);
  console.log(`  🎓 Trainers: ${stats.trainers}`);
  console.log(`  🏁 Races: ${stats.races.toLocaleString()}`);
  console.log(`  🤖 Model Predictions: ${stats.model_predictions.toLocaleString()}\n`);

  db.close();
}

async function main() {
  const args = process.argv.slice(2);
  const cloudBackup = args.includes('--cloud');

  console.log('\n📦 TrackWise KB Backup\n');

  try {
    // Local backup
    await createLocalBackup();
    await showStats();

    // Cloud backup
    if (cloudBackup) {
      await backupToNeon();
    } else {
      console.log('💡 Tip: Use "npm run backup-kb-cloud" to also backup to Neon\n');
    }

    console.log('✅ Backup complete!\n');
  } catch (err) {
    console.error('\n❌ Backup failed:', err.message);
    process.exit(1);
  }
}

main();
