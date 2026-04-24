#!/usr/bin/env node
/**
 * Backup comprehensive KB to local storage and Neon cloud database
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const projectRoot = path.join(__dirname, '..');

function createLocalBackup() {
  console.log('\n💾 CREATING LOCAL BACKUP\n');

  const backupDir = path.join(projectRoot, 'backups', new Date().toISOString().split('T')[0]);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Backup SQLite database
  console.log('📦 Backing up SQLite database...');
  const dbBackupPath = path.join(backupDir, `trackwise-${new Date().getTime()}.db`);
  fs.copyFileSync(dbPath, dbBackupPath);
  const dbSize = fs.statSync(dbBackupPath).size / 1024 / 1024;
  console.log(`   ✅ Database backup: ${dbSize.toFixed(2)}MB`);

  // Backup JSON exports
  console.log('📦 Backing up JSON exports...');
  const dataDir = path.join(projectRoot, 'public/data');
  const files = ['kb-intelligence.json', 'results.json', 'kb.json'];

  for (const file of files) {
    const src = path.join(dataDir, file);
    if (fs.existsSync(src)) {
      const dst = path.join(backupDir, file);
      fs.copyFileSync(src, dst);
      const size = fs.statSync(dst).size / 1024;
      console.log(`   ✅ ${file}: ${size.toFixed(1)}KB`);
    }
  }

  // Create backup manifest
  console.log('📋 Creating backup manifest...');
  const manifest = {
    timestamp: new Date().toISOString(),
    database: dbBackupPath,
    exports: files,
    statistics: {
      backupDate: new Date().toISOString(),
      backupPath: backupDir,
    },
  };

  fs.writeFileSync(
    path.join(backupDir, 'BACKUP_MANIFEST.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`\n✅ Local backup complete: ${backupDir}\n`);
  return backupDir;
}

function backupToNeon() {
  console.log('☁️  BACKING UP TO NEON CLOUD DATABASE\n');

  // Check for Neon connection string
  const neonUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

  if (!neonUrl) {
    console.log('⚠️  Neon database URL not configured in environment variables');
    console.log('   Set DATABASE_URL or NEON_DATABASE_URL to enable cloud backup\n');
    return false;
  }

  try {
    console.log('🔗 Connecting to Neon database...');

    // Use pg_dump to backup (requires PostgreSQL tools)
    const backupFile = path.join(
      projectRoot,
      'backups',
      new Date().toISOString().split('T')[0],
      `neon-backup-${new Date().getTime()}.sql`
    );

    // Extract connection details
    const urlObj = new URL(neonUrl);
    process.env.PGPASSWORD = urlObj.password;

    try {
      execSync(
        `pg_dump -h ${urlObj.hostname} -U ${urlObj.username} -d ${urlObj.pathname.slice(1)} > "${backupFile}"`,
        { stdio: 'pipe' }
      );

      const size = fs.statSync(backupFile).size / 1024 / 1024;
      console.log(`✅ Neon backup: ${size.toFixed(2)}MB`);
      console.log(`   Location: ${backupFile}\n`);
      return true;
    } catch (error) {
      console.log('⚠️  PostgreSQL tools not available (pg_dump)');
      console.log('   Installing: brew install postgresql\n');
      return false;
    }
  } catch (err) {
    console.log(`⚠️  Error accessing Neon: ${(err as any).message}\n`);
    return false;
  }
}

function generateBackupReport(localBackupDir: string) {
  console.log('='.repeat(80));
  console.log('📊 BACKUP REPORT\n');

  // Get database stats
  const db = new Database(dbPath);

  const horses = db.prepare('SELECT COUNT(*) as count FROM horses').get() as any;
  const races = db.prepare('SELECT COUNT(*) as count FROM races').get() as any;
  const raceRunners = db.prepare('SELECT COUNT(*) as count FROM race_runners').get() as any;
  const kbStats = db.prepare('SELECT COUNT(*) as count FROM kb_stats').get() as any;

  const results = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'PLACE' THEN 1 ELSE 0 END) as places
    FROM race_runners WHERE result IS NOT NULL
  `).get() as any;

  db.close();

  console.log('📈 KNOWLEDGE BASE STATISTICS\n');
  console.log(`Horses: ${horses.count.toLocaleString()}`);
  console.log(`Races: ${races.count.toLocaleString()}`);
  console.log(`Race Results: ${raceRunners.count.toLocaleString()}`);
  console.log(`KB Statistics: ${kbStats.count.toLocaleString()}`);
  console.log(`Win Records: ${results.wins} (${((results.wins / results.total) * 100).toFixed(1)}%)`);
  console.log(`Place Records: ${results.places} (${((results.places / results.total) * 100).toFixed(1)}%)\n`);

  console.log('💾 BACKUP LOCATIONS\n');
  console.log(`Local Backup: ${localBackupDir}`);
  console.log(`Neon Cloud: ${process.env.DATABASE_URL ? 'Configured ✅' : 'Not configured ⚠️'}\n`);

  // List backup files
  const files = fs.readdirSync(localBackupDir).filter(f => !f.startsWith('.'));
  console.log('📁 BACKUP FILES\n');
  for (const file of files) {
    const filePath = path.join(localBackupDir, file);
    const stat = fs.statSync(filePath);
    const size = stat.isFile()
      ? (stat.size / 1024 / 1024).toFixed(2) + 'MB'
      : 'directory';
    console.log(`  • ${file}: ${size}`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  console.log('\n🛡️  COMPREHENSIVE KB BACKUP SYSTEM\n');
  console.log('Backing up all knowledge base data to local and cloud...\n');

  try {
    // Local backup
    const localBackupDir = createLocalBackup();

    // Neon cloud backup
    const neonSuccess = backupToNeon();

    // Generate report
    generateBackupReport(localBackupDir);

    console.log('✅ BACKUP COMPLETE\n');
    console.log('Your knowledge base is now protected:');
    console.log(`  • Local: ${localBackupDir}`);
    if (neonSuccess) {
      console.log(`  • Cloud: Neon PostgreSQL (configured)`);
    } else {
      console.log(`  • Cloud: Configure DATABASE_URL environment variable for Neon backup`);
    }
    console.log('\n💡 TIP: Set up automated daily backups using cron:\n');
    console.log('   0 2 * * * cd /Users/mora0145/Downloads/TrackWise && npx tsx scripts/backup-kb-comprehensive.ts\n');
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
