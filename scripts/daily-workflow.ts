#!/usr/bin/env node
/**
 * Daily workflow: Entry → Aggregation → Picks
 * Run this after adding new race data to get immediate high-confidence picks
 */

import { execSync } from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runWorkflow() {
  const scripts = [
    { name: 'Pinjarra R2 Entry', file: 'quick-entry-pinjarra-r2.ts' },
    { name: 'Stats Aggregation', file: 'aggregate-stats.ts' },
    { name: 'Daily Picks (with Stats)', file: 'test-picks-with-stats.ts' },
  ];

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║          TRACKWISE DAILY WORKFLOW                 ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  for (const script of scripts) {
    console.log(`\n→ Running: ${script.name}...`);
    console.log('─'.repeat(55));
    try {
      execSync(`npx tsx ${path.join(__dirname, script.file)}`, {
        stdio: 'inherit',
        cwd: __dirname,
      });
    } catch (err) {
      console.error(`✗ Failed: ${script.name}`);
      process.exit(1);
    }
  }

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║     ✓ WORKFLOW COMPLETE                          ║');
  console.log('║     High-confidence picks ready for paper trading ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');
}

runWorkflow().catch((err) => {
  console.error('Workflow error:', err);
  process.exit(1);
});
