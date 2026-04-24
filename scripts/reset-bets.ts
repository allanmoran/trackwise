#!/usr/bin/env node
/**
 * Reset incorrectly settled bets back to ACTIVE status
 * Clears result, profit_loss, status, and settled_at for re-settlement
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../backend/data/trackwise.db');
const db = new Database(dbPath);

function log(msg: string) {
  console.log(msg);
}

async function main() {
  log('\n' + '='.repeat(70));
  log('🔄 RESETTING INCORRECTLY SETTLED BETS\n');

  // Check what we're about to reset
  const toReset = db.prepare(`
    SELECT COUNT(*) as count
    FROM bets b
    JOIN races r ON b.race_id = r.id
    WHERE r.date IN ('2026-04-11', '2026-04-12')
      AND b.result IS NOT NULL
  `).get() as any;

  log(`Found ${toReset.count} bets to reset from April 11-12`);

  if (toReset.count === 0) {
    log('No bets to reset.');
    process.exit(0);
  }

  // Show what will be reset
  const betsToReset = db.prepare(`
    SELECT b.id, r.track, r.race_number, h.name, b.result, b.profit_loss
    FROM bets b
    JOIN races r ON b.race_id = r.id
    JOIN horses h ON b.horse_id = h.id
    WHERE r.date IN ('2026-04-11', '2026-04-12')
      AND b.result IS NOT NULL
    LIMIT 10
  `).all() as any[];

  log('\nSample of bets being reset:');
  for (const bet of betsToReset) {
    log(`  ${bet.track} R${bet.race_number} - ${bet.name}: ${bet.result} (${bet.profit_loss})`);
  }

  if (toReset.count > 10) {
    log(`  ... and ${toReset.count - 10} more\n`);
  }

  // Reset bets
  const stmt = db.prepare(`
    UPDATE bets
    SET result = NULL, profit_loss = NULL, status = 'ACTIVE', settled_at = NULL
    WHERE id IN (
      SELECT b.id
      FROM bets b
      JOIN races r ON b.race_id = r.id
      WHERE r.date IN ('2026-04-11', '2026-04-12')
        AND b.result IS NOT NULL
    )
  `);

  stmt.run();

  // Verify reset
  const remaining = db.prepare(`
    SELECT COUNT(*) as count
    FROM bets b
    JOIN races r ON b.race_id = r.id
    WHERE r.date IN ('2026-04-11', '2026-04-12')
      AND b.result IS NOT NULL
  `).get() as any;

  log(`\n✓ Reset complete. Remaining unsettled bets with results: ${remaining.count}`);
  log('='.repeat(70) + '\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
