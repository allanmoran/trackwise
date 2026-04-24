#!/usr/bin/env node
/**
 * What-if analysis: Apply new filters to today's bets
 * Shows how many bets would have been placed under stricter rules
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL || '');

async function run() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 WHAT-IF ANALYSIS: New Filters Applied to Today\'s Bets');
  console.log('='.repeat(80) + '\n');

  try {
    // Get all today's bets (excluding VOID)
    const allBets = await sql`
      SELECT
        id, track, race_num, horse, jockey, trainer,
        odds, stake, confidence, result,
        CASE
          WHEN result = 'WIN' THEN stake * (odds - 1)
          WHEN result = 'PLACE' THEN stake * ((odds - 1) * 0.25)
          WHEN result = 'LOSS' THEN -stake
          ELSE 0
        END as pnl
      FROM bets
      WHERE created_at >= NOW() - INTERVAL '1 day'
        AND result IS NOT NULL
        AND result != 'VOID'
      ORDER BY confidence DESC, odds ASC
    `;

    console.log(`📍 BASELINE: All ${allBets.length} bets placed today\n`);

    const baselineStaked = allBets.reduce((sum, b) => sum + parseFloat(String(b.stake || 0)), 0);
    const baselinePnL = allBets.reduce((sum, b) => sum + parseFloat(String(b.pnl || 0)), 0);
    const baselineROI = baselinePnL / baselineStaked * 100;
    const baselineWins = allBets.filter(b => b.result === 'WIN').length;

    console.log(`  Bets: ${allBets.length}`);
    console.log(`  Staked: $${baselineStaked.toFixed(2)}`);
    console.log(`  P&L: $${baselinePnL.toFixed(2)}`);
    console.log(`  ROI: ${baselineROI.toFixed(2)}%`);
    console.log(`  Wins: ${baselineWins}\n`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // NEW STRATEGY FILTERS
    const BLACKLIST = ['Aidan Holt', 'Julia Martin', 'Kevin Mahoney'];
    const ALLOWED_TRACKS = ['Cairns'];
    const MIN_CONFIDENCE = 75;
    const MAX_ODDS = 7.0;

    const filtered = allBets.filter(b => {
      // Filter 1: Confidence >= 75%
      if (b.confidence < MIN_CONFIDENCE) return false;

      // Filter 2: Odds <= 7.0
      const odds = parseFloat(String(b.odds || 0));
      if (odds > MAX_ODDS) return false;

      // Filter 3: Not in blacklist
      if (BLACKLIST.includes(b.jockey) || BLACKLIST.includes(b.trainer)) return false;

      // Filter 4: Only Cairns
      if (!ALLOWED_TRACKS.includes(b.track)) return false;

      return true;
    });

    console.log(`🎯 NEW STRATEGY: Confidence ≥75%, Odds ≤7.0, No Blacklist, Cairns Only\n`);
    console.log(`  Bets Placed: ${filtered.length} (vs ${allBets.length} original)`);
    console.log(`  Reduction: ${((1 - filtered.length / allBets.length) * 100).toFixed(1)}% fewer bets\n`);

    if (filtered.length === 0) {
      console.log(`  ⚠️  NO BETS would have been placed under these filters!\n`);
      console.log(`  This means today's strategy was COMPLETELY WRONG.\n`);
    } else {
      const filteredStaked = filtered.reduce((sum, b) => sum + parseFloat(String(b.stake || 0)), 0);
      const filteredPnL = filtered.reduce((sum, b) => sum + parseFloat(String(b.pnl || 0)), 0);
      const filteredROI = filteredPnL / filteredStaked * 100;
      const filteredWins = filtered.filter(b => b.result === 'WIN').length;
      const filteredPlaces = filtered.filter(b => b.result === 'PLACE').length;

      console.log(`  Staked: $${filteredStaked.toFixed(2)} (vs $${baselineStaked.toFixed(2)})`);
      console.log(`  P&L: $${filteredPnL.toFixed(2)} (vs $${baselinePnL.toFixed(2)})`);
      console.log(`  ROI: ${filteredROI.toFixed(2)}% (vs ${baselineROI.toFixed(2)}%)`);
      console.log(`  Wins: ${filteredWins}/${filtered.length} (vs ${baselineWins}/${allBets.length})`);
      console.log(`  Places: ${filteredPlaces}\n`);

      const roiDiff = filteredROI - baselineROI;
      console.log(`  📈 ROI Change: ${roiDiff > 0 ? '+' : ''}${roiDiff.toFixed(2)}%`);
      console.log(`  📊 Bets Saved: ${allBets.length - filtered.length} losing picks avoided\n`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`\n📋 FILTER BREAKDOWN\n`);

    // Show what each filter removes
    const conf75 = allBets.filter(b => b.confidence >= 75);
    const conf75_odds7 = conf75.filter(b => parseFloat(String(b.odds || 0)) <= 7);
    const conf75_odds7_noBlacklist = conf75_odds7.filter(b =>
      !BLACKLIST.includes(b.jockey) && !BLACKLIST.includes(b.trainer)
    );
    const final = conf75_odds7_noBlacklist.filter(b => ALLOWED_TRACKS.includes(b.track));

    console.log(`Start: ${allBets.length} bets`);
    console.log(`After confidence ≥75%: ${conf75.length} bets (removed ${allBets.length - conf75.length})`);
    console.log(`After odds ≤7.0: ${conf75_odds7.length} bets (removed ${conf75.length - conf75_odds7.length})`);
    console.log(`After blacklist: ${conf75_odds7_noBlacklist.length} bets (removed ${conf75_odds7.length - conf75_odds7_noBlacklist.length})`);
    console.log(`After Cairns-only: ${final.length} bets (removed ${conf75_odds7_noBlacklist.length - final.length})\n`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (filtered.length > 0) {
      console.log(`\n🏇 BETS THAT WOULD HAVE BEEN PLACED\n`);

      filtered.forEach(b => {
        const odds = parseFloat(String(b.odds || 0));
        const stake = parseFloat(String(b.stake || 0));
        const pnl = parseFloat(String(b.pnl || 0));
        const result = b.result === 'WIN' ? '✅ WIN' : b.result === 'PLACE' ? '🟢 PLACE' : '❌ LOSS';

        console.log(`${result}: ${b.horse} (${b.track} R${b.race_num})`);
        console.log(`     Conf: ${b.confidence}% | Odds: ${odds.toFixed(2)} | Stake: $${stake.toFixed(2)} | P&L: $${pnl.toFixed(2)}`);
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`\n\n🔍 WHAT WAS ELIMINATED?\n`);

    const eliminated = allBets.filter(b => !filtered.includes(b));

    // Count by reason
    const lowConf = eliminated.filter(b => b.confidence < MIN_CONFIDENCE).length;
    const highOdds = eliminated.filter(b => parseFloat(String(b.odds || 0)) > MAX_ODDS && b.confidence >= MIN_CONFIDENCE).length;
    const blacklist = eliminated.filter(b =>
      parseFloat(String(b.odds || 0)) <= MAX_ODDS &&
      b.confidence >= MIN_CONFIDENCE &&
      (BLACKLIST.includes(b.jockey) || BLACKLIST.includes(b.trainer))
    ).length;
    const wrongTrack = eliminated.filter(b =>
      parseFloat(String(b.odds || 0)) <= MAX_ODDS &&
      b.confidence >= MIN_CONFIDENCE &&
      !BLACKLIST.includes(b.jockey) &&
      !BLACKLIST.includes(b.trainer) &&
      !ALLOWED_TRACKS.includes(b.track)
    ).length;

    console.log(`Low confidence (<75%): ${lowConf}`);
    console.log(`High odds (>7.0): ${highOdds}`);
    console.log(`Blacklist jockey/trainer: ${blacklist}`);
    console.log(`Wrong track (not Cairns): ${wrongTrack}`);

    const eliminatedWins = eliminated.filter(b => b.result === 'WIN').length;
    const eliminatedPnL = eliminated.reduce((sum, b) => sum + parseFloat(String(b.pnl || 0)), 0);

    console.log(`\nEliminated bets: ${eliminatedWins} wins, P&L: $${eliminatedPnL.toFixed(2)}`);

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (err) {
    console.error('[Error]', err);
  } finally {
    await sql.end();
  }
}

run();
