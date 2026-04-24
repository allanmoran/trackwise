#!/usr/bin/env node
// scripts/engine.ts
// Headless racing engine — no browser, no DOM, no delays.
// Usage:  npm run engine
// Stop:   Ctrl+C  (saves final report)

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  initKB, updateKB, generateRace, decideBet, resolveRace, calcPL,
  START_BANK, uid, ts,
  type KB,
} from '../src/simulation.js';

import { STRATEGY_V1_VALIDATED, STRATEGY_V2 } from '../src/config/strategy.js';

// ── Strategy selection via --strategy v1/v2 ────────────────────────────────
const stratArgIdx = process.argv.indexOf('--strategy');
const stratVal    = stratArgIdx >= 0 ? process.argv[stratArgIdx + 1] : 'v1';
const STRAT_TAG   = stratVal === 'v2' ? 'v2' : 'v1';
const IS_V2       = STRAT_TAG === 'v2';

// V2 race-level filters (applied before decideBet)
const V2_DIST_MIN  = STRATEGY_V2.minDistance;   // 1200
const V2_DIST_MAX  = STRATEGY_V2.maxDistance;   // 1800
const V2_FIELD_MIN = STRATEGY_V2.minFieldSize;  // 8
const V2_FIELD_MAX = STRATEGY_V2.maxFieldSize;  // 14

void STRATEGY_V1_VALIDATED; // suppress unused import warning

// ── paths ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dir      = dirname(__filename);
const DATA_DIR   = join(__dir, '..', 'public', 'data');
const KB_FILE    = join(DATA_DIR, IS_V2 ? 'kb_v2.json'      : 'kb.json');
const RES_FILE   = join(DATA_DIR, IS_V2 ? 'results_v2.json' : 'results.json');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ── constants ─────────────────────────────────────────────────────────────────
const SAVE_EVERY    = 1000;
const PRINT_EVERY   = 5000;
const HIST_STEP     = 10;    // record bank every N races
const ROI_STEP      = 500;   // record ROI curve snapshot every N races
const MAX_BETS_KEPT = 50_000;

// ── state ─────────────────────────────────────────────────────────────────────
function freshState() {
  return {
    kb:          initKB() as KB,
    bank:        START_BANK,
    peak:        START_BANK,
    trough:      START_BANK,
    bets:        [] as any[],
    totalBets:   0,
    noBets:      0,
    totalRaces:  0,
    totalStaked: 0,
    totalReturn: 0,
    bankHistory: [START_BANK] as number[],
    roiCurve:    [] as { race: number; roi: number; bank: number }[],
    startedAt:   new Date().toISOString(),
    strategyTag: STRAT_TAG,
  };
}

let S = freshState();

// Try to resume from saved state
try {
  if (existsSync(RES_FILE)) {
    const saved = JSON.parse(readFileSync(RES_FILE, 'utf-8'));
    S.kb          = saved.kb;
    S.bank        = saved.bankroll.current;
    S.peak        = saved.bankroll.peak        ?? START_BANK;
    S.trough      = saved.bankroll.trough      ?? START_BANK;
    S.bets        = saved.bets                 ?? [];
    S.totalBets   = saved.meta.totalBets       ?? 0;
    S.noBets      = saved.meta.noBets          ?? 0;
    S.totalRaces  = saved.meta.totalRaces      ?? 0;
    S.totalStaked = saved.performance?.summary?.totalStaked ?? 0;
    S.totalReturn = S.totalStaked + (saved.bankroll.current - START_BANK);
    S.bankHistory = saved.bankroll.history     ?? [START_BANK];
    S.roiCurve    = saved.performance?.roiCurve ?? [];
    S.startedAt   = saved.meta.startedAt       ?? S.startedAt;
    console.log(`\n📦 Resuming: ${S.totalRaces.toLocaleString()} races, bank $${S.bank.toFixed(2)}`);
  }
} catch { /* fresh start */ }

// ── perf buckets ──────────────────────────────────────────────────────────────
type Bucket = { b: number; w: number; p: number; s: number; r: number };
const eb = (): Bucket => ({ b:0, w:0, p:0, s:0, r:0 });

function updB(bucket: Bucket, isWin: boolean, isPlace: boolean, stake: number, ret: number) {
  bucket.b++;
  if (isWin)   bucket.w++;
  if (isPlace) bucket.p++;
  bucket.s += stake;
  bucket.r += ret;
}

function fmtB(label: string, b: Bucket) {
  const roi = b.s > 0 ? (b.r - b.s) / b.s * 100 : 0;
  return {
    label,
    bets:        b.b,
    wins:        b.w,
    places:      b.p,
    winStrike:   b.b > 0 ? +(b.w / b.b * 100).toFixed(1) : 0,
    placeStrike: b.b > 0 ? +(b.p / b.b * 100).toFixed(1) : 0,
    roi:         +roi.toFixed(2),
    staked:      +b.s.toFixed(2),
    returned:    +b.r.toFixed(2),
  };
}

const byTrack:     Record<string, Bucket> = {};
const byCond:      Record<string, Bucket> = {};
const byTrackCond: Record<string, Bucket> = {};
const byOdds:    Record<string, Bucket> = { '4-7': eb(), '8-11': eb(), '12-16': eb(), '17+': eb() };
const byBetType: Record<string, Bucket> = { WIN: eb(), PLACE: eb(), 'EACH-WAY': eb() };
const byScore:   Record<string, Bucket> = { '55-64': eb(), '65-74': eb(), '75-84': eb(), '85+': eb() };
const byBarrier: Record<string, Bucket> = { '1-3': eb(), '4-6': eb(), '7-9': eb(), '10+': eb() };
const byDist:    Record<string, Bucket> = { '1000-1199': eb(), '1200-1399': eb(), '1400-1599': eb(), '1600-1999': eb(), '2000+': eb() };
const byField:   Record<string, Bucket> = { '5-8': eb(), '9-12': eb(), '13+': eb() };

function oddsKey(o: number) { return o<=7?'4-7':o<=11?'8-11':o<=16?'12-16':'17+'; }
function scoreKey(s: number){ return s<65?'55-64':s<75?'65-74':s<85?'75-84':'85+'; }
function barrKey(b: number)  { return b<=3?'1-3':b<=6?'4-6':b<=9?'7-9':'10+'; }
function distKey(d: number)  { return d<1200?'1000-1199':d<1400?'1200-1399':d<1600?'1400-1599':d<2000?'1600-1999':'2000+'; }
function fieldKey(f: number) { return f<=8?'5-8':f<=12?'9-12':'13+'; }

// ── max drawdown (dollar, for save compat) ────────────────────────────────────
function maxDrawdown() {
  let peak = S.bankHistory[0] ?? START_BANK;
  let dd   = 0;
  for (const b of S.bankHistory) { if (b>peak) peak=b; const d=peak-b; if(d>dd) dd=d; }
  return dd;
}

// ── validation stat 1: consistency buckets ───────────────────────────────────
function consistencyBuckets() {
  const bets = S.bets;
  if (bets.length < 10) return null;
  const size = Math.floor(bets.length / 10);
  return Array.from({ length: 10 }, (_, i) => {
    const slice = bets.slice(i * size, i === 9 ? bets.length : (i + 1) * size);
    const staked   = slice.reduce((s, b) => s + b.totalStake, 0);
    const returned = slice.reduce((s, b) => s + b.totalStake + b.pl, 0);
    const roi = staked > 0 ? (returned - staked) / staked * 100 : 0;
    return { bucket: i + 1, n: slice.length, roi: +roi.toFixed(1) };
  });
}

// ── validation stat 2: drawdown analysis ─────────────────────────────────────
function drawdownStats() {
  const bets = S.bets;
  if (bets.length === 0) return null;

  // Walk bets to find worst peak-to-trough drawdown
  let runPeak = START_BANK, runPeakIdx = -1;
  let worstDD = 0, worstPeak = START_BANK, worstTrough = START_BANK, worstTroughIdx = -1;
  for (let i = 0; i < bets.length; i++) {
    const bank = bets[i].bankAfter as number;
    if (bank > runPeak) { runPeak = bank; runPeakIdx = i; }
    const dd = runPeak - bank;
    if (dd > worstDD) { worstDD = dd; worstPeak = runPeak; worstTrough = bank; worstTroughIdx = i; }
  }

  // Longest consecutive loss run
  let maxStreak = 0, curStreak = 0;
  for (const b of bets) {
    if (b.result === 'LOSS') { curStreak++; if (curStreak > maxStreak) maxStreak = curStreak; }
    else curStreak = 0;
  }

  // Recovery: bets from trough until bank >= worstPeak again
  let recoveryBets: number | null = null;
  if (worstTroughIdx >= 0 && worstDD > 0) {
    for (let i = worstTroughIdx + 1; i < bets.length; i++) {
      if ((bets[i].bankAfter as number) >= worstPeak) { recoveryBets = i - worstTroughIdx; break; }
    }
  }

  const ddPct = worstPeak > 0 ? worstDD / worstPeak * 100 : 0;
  return { ddPct: +ddPct.toFixed(1), worstPeak: +worstPeak.toFixed(2), worstTrough: +worstTrough.toFixed(2), maxStreak, recoveryBets };
}

// ── validation stat 3: top track+condition combos ─────────────────────────────
const MIN_COND_BETS = 5; // minimum bets before a combo is reported

function topConditions(n = 5) {
  return Object.entries(byTrackCond)
    .map(([k, v]) => fmtB(k, v))
    .filter(r => r.bets >= MIN_COND_BETS)
    .sort((a, b) => b.roi - a.roi)
    .slice(0, n);
}

// ── save ──────────────────────────────────────────────────────────────────────
function save() {
  const roi    = S.totalStaked>0 ? (S.totalReturn - S.totalStaked)/S.totalStaked*100 : 0;
  const bets   = S.bets;
  const wins   = bets.filter(b=>b.result==='WIN').length;
  const places = bets.filter(b=>b.result==='PLACE').length;
  const losses = bets.filter(b=>b.result==='LOSS').length;

  const out = {
    meta: {
      totalRaces:  S.totalRaces,
      totalBets:   S.totalBets,
      noBets:      S.noBets,
      startedAt:   S.startedAt,
      lastUpdated:  new Date().toISOString(),
      strategy:     STRAT_TAG,
      strategyName: IS_V2 ? STRATEGY_V2.name : STRATEGY_V1_VALIDATED.name,
    },
    bankroll: {
      start:       START_BANK,
      current:     +S.bank.toFixed(2),
      peak:        +S.peak.toFixed(2),
      trough:      +S.trough.toFixed(2),
      totalPL:     +(S.bank - START_BANK).toFixed(2),
      maxDrawdown: +maxDrawdown().toFixed(2),
      history:     S.bankHistory,
    },
    kb: S.kb,
    bets: S.bets.slice(-MAX_BETS_KEPT),
    performance: {
      summary: {
        totalRaces:  S.totalRaces,
        totalBets:   S.totalBets,
        noBets:      S.noBets,
        wins, places, losses,
        winStrike:   S.totalBets>0 ? +(wins/S.totalBets*100).toFixed(1) : 0,
        placeStrike: S.totalBets>0 ? +((wins+places)/S.totalBets*100).toFixed(1) : 0,
        roi:         +roi.toFixed(2),
        totalStaked: +S.totalStaked.toFixed(2),
        growth:      +((S.bank-START_BANK)/START_BANK*100).toFixed(2),
        maxDrawdown: +maxDrawdown().toFixed(2),
      },
      byTrack:     Object.entries(byTrack).map(([k,v])=>fmtB(k,v)).sort((a,b)=>b.roi-a.roi),
      byCondition: Object.entries(byCond).map(([k,v])=>fmtB(k,v)).sort((a,b)=>b.roi-a.roi),
      byOddsRange: Object.entries(byOdds).map(([k,v])=>fmtB(k,v)),
      byBetType:   Object.entries(byBetType).map(([k,v])=>fmtB(k,v)),
      byScoreBand: Object.entries(byScore).map(([k,v])=>fmtB(k,v)),
      byBarrier:   Object.entries(byBarrier).map(([k,v])=>fmtB(k,v)),
      byDistance:  Object.entries(byDist).map(([k,v])=>fmtB(k,v)),
      byFieldSize: Object.entries(byField).map(([k,v])=>fmtB(k,v)),
      roiCurve:    S.roiCurve,
      validation: {
        consistencyBuckets: consistencyBuckets(),
        drawdown:           drawdownStats(),
        topConditions:      Object.entries(byTrackCond).map(([k,v])=>fmtB(k,v))
                              .filter(r=>r.bets>=MIN_COND_BETS)
                              .sort((a,b)=>b.roi-a.roi)
                              .slice(0,20),
      },
    },
  };
  writeFileSync(RES_FILE, JSON.stringify(out, null, 2));
  writeFileSync(KB_FILE,  JSON.stringify(S.kb, null, 2));
}

// ── print ─────────────────────────────────────────────────────────────────────
let lastPrintAt    = Date.now();
let lastPrintRaces = S.totalRaces;

const REAL_BANK_CAP = 10_000; // Hard cap for real-world equivalent reporting

function print() {
  const now   = Date.now();
  const secs  = (now - lastPrintAt) / 1000 || 1;
  const speed = Math.round((S.totalRaces - lastPrintRaces) / secs);
  const roi   = S.totalStaked>0 ? (S.totalReturn-S.totalStaked)/S.totalStaked*100 : 0;
  const bets  = S.bets;
  const wins  = bets.filter(b=>b.result==='WIN').length;
  const places= bets.filter(b=>b.result==='PLACE').length;
  const losses= bets.filter(b=>b.result==='LOSS').length;
  const str   = S.totalBets>0 ? ((wins+places)/S.totalBets*100).toFixed(1)+'%' : '0%';
  const grow  = ((S.bank-START_BANK)/START_BANK*100).toFixed(1)+'%';
  // Realism metrics
  const realBank = Math.min(S.bank, REAL_BANK_CAP);
  const restrictFactor = S.bank > START_BANK*2
    ? Math.max(0.1, 1-((S.bank/START_BANK-2)*0.05)).toFixed(2)
    : '1.00';
  const line  = '━'.repeat(52);
  console.log(`\n${line}`);
  console.log(` Races:   ${S.totalRaces.toLocaleString().padEnd(14)} Speed:  ${speed.toLocaleString()}/sec`);
  console.log(` Bets:    ${S.totalBets.toLocaleString().padEnd(14)} No Bet: ${S.noBets.toLocaleString()}`);
  console.log(` ROI:     ${((roi>=0?'+':'')+roi.toFixed(1)+'%').padEnd(14)} Bank:   $${S.bank.toFixed(2)}`);
  console.log(` W/P/L:   ${wins}W ${places}P ${losses}L`);
  console.log(` Strike:  ${str.padEnd(14)} Growth: ${grow}`);
  console.log(` KB Ver:  v${S.kb.version}`);
  console.log(` Strategy: ${STRAT_TAG.toUpperCase()}${IS_V2 ? ` — dist ${V2_DIST_MIN}-${V2_DIST_MAX}m, field ${V2_FIELD_MIN}-${V2_FIELD_MAX}` : ''}`);
  console.log(` ── Realism ─────────────────────────────────────`);
  console.log(` Bkmkr margin:  15%      Post-margin ROI: ${(roi>=0?'+':'')+roi.toFixed(1)}%`);
  console.log(` Real-world bank: $${realBank.toFixed(2).padEnd(10)} (capped at $${REAL_BANK_CAP.toLocaleString()})`);
  console.log(` Restriction factor: ${restrictFactor}  ${parseFloat(restrictFactor)<0.5?'⚠ Account heavily restricted':'✓ Account active'}`);

  // ── Validation 1: Consistency ──────────────────────────────────────────────
  const buckets = consistencyBuckets();
  if (buckets) {
    const positive = buckets.filter(b => b.roi > 0).length;
    const verdict  = positive >= 7 ? '✓ CONSISTENT' : positive >= 5 ? '~ MARGINAL' : '✗ INCONSISTENT';
    console.log(` ── Consistency (${positive}/10 buckets positive) ${verdict} ──`);
    const rows = buckets.map(b => `${b.roi >= 0 ? '+' : ''}${b.roi.toFixed(1)}%`);
    // Print two rows of 5
    console.log(`   B1-5:  ${rows.slice(0,5).map(r=>r.padStart(7)).join(' ')}`);
    console.log(`   B6-10: ${rows.slice(5).map(r=>r.padStart(7)).join(' ')}`);
  }

  // ── Validation 2: Drawdown ─────────────────────────────────────────────────
  const dd = drawdownStats();
  if (dd) {
    const recov = dd.recoveryBets != null ? `${dd.recoveryBets} bets` : 'not yet recovered';
    console.log(` ── Drawdown analysis ───────────────────────────`);
    console.log(` Max drawdown:       -${dd.ddPct.toFixed(1)}%  (peak $${dd.worstPeak.toFixed(2)} → trough $${dd.worstTrough.toFixed(2)})`);
    console.log(` Longest losing run: ${dd.maxStreak} consecutive bets`);
    console.log(` Recovery time:      ${recov}`);
  }

  // ── Validation 3: Top track+condition combos ───────────────────────────────
  const topConds = topConditions(5);
  if (topConds.length > 0) {
    console.log(` ── Top conditions (min ${MIN_COND_BETS} bets) ──────────────────`);
    for (const c of topConds) {
      const roiStr = (c.roi >= 0 ? '+' : '') + c.roi.toFixed(1) + '%';
      console.log(`   ${c.label.padEnd(34)} ${String(c.bets).padStart(3)}b  ${(c.placeStrike.toFixed(1)+'%').padStart(6)} strike  ${roiStr.padStart(7)} ROI`);
    }
  }

  console.log(line);
  lastPrintAt    = now;
  lastPrintRaces = S.totalRaces;
}

// ── single race ───────────────────────────────────────────────────────────────
function runRace() {
  S.totalRaces++;

  const race = generateRace(S.kb);

  // V2 race-level filters — skip races outside distance/field bands
  if (IS_V2) {
    if (race.dist < V2_DIST_MIN || race.dist > V2_DIST_MAX) { S.noBets++; return; }
    if (race.field < V2_FIELD_MIN || race.field > V2_FIELD_MAX) { S.noBets++; return; }
  }

  const dec  = decideBet(race, S.kb, S.bank);

  if (dec.decision === 'NO_BET') { S.noBets++; return; }

  const top   = dec.runner!;
  const stake = dec.totalStake!;

  S.bank = parseFloat((S.bank - stake).toFixed(2));

  const updRunners = race.runners.map(r => ({
    ...r, betType: r.id === top.id ? dec.betType! : 'SKIP',
  }));
  const resolved = resolveRace(updRunners);

  // Build a bet object matching what calcPL expects
  const pendingBet = {
    id:         uid(),
    runnerId:   top.id,
    horse:      top.name,
    track:      race.track.n,
    state:      race.track.s,
    cls:        race.cls,
    dist:       `${race.dist}m`,
    cond:       race.cond.l,
    fieldSize:  race.field,
    betType:    dec.betType!,
    totalStake: stake,
    winStake:   dec.winStake!,
    placeStake: dec.placeStake!,
    winOdds:    top.winOdds,
    placeOdds:  top.placeOdds,
    result:     'PENDING',
    pl:         null as null|number,
    timestamp:  ts(),
  };

  const { result, pl } = calcPL(pendingBet, resolved);

  S.bank = parseFloat((S.bank + stake + pl).toFixed(2));
  if (S.bank > S.peak)   S.peak   = S.bank;
  if (S.bank < S.trough) S.trough = S.bank;
  S.totalStaked += stake;
  S.totalReturn += stake + pl;
  S.totalBets++;

  const finalBet = { ...pendingBet, result, pl: +pl.toFixed(2), bankAfter: S.bank };
  S.bets.push(finalBet);

  const isWin   = result === 'WIN';
  const isPlace = result === 'WIN' || result === 'PLACE';
  const ret     = stake + pl;

  if (!byTrack[race.track.n]) byTrack[race.track.n] = eb();
  updB(byTrack[race.track.n], isWin, isPlace, stake, ret);
  if (!byCond[race.cond.l])  byCond[race.cond.l]   = eb();
  updB(byCond[race.cond.l],  isWin, isPlace, stake, ret);
  const tcKey = `${race.track.n} + ${race.cond.l}`;
  if (!byTrackCond[tcKey]) byTrackCond[tcKey] = eb();
  updB(byTrackCond[tcKey], isWin, isPlace, stake, ret);
  updB(byOdds[oddsKey(top.winOdds)],               isWin, isPlace, stake, ret);
  if (byBetType[dec.betType!]) updB(byBetType[dec.betType!], isWin, isPlace, stake, ret);
  updB(byScore[scoreKey(top.scores.total)],         isWin, isPlace, stake, ret);
  updB(byBarrier[barrKey(top.barrier)],             isWin, isPlace, stake, ret);
  updB(byDist[distKey(race.dist)],                  isWin, isPlace, stake, ret);
  updB(byField[fieldKey(race.field)],               isWin, isPlace, stake, ret);

  const runner = resolved.find(r => r.id === top.id)!;
  S.kb = updateKB(S.kb, finalBet, result, pl, runner);

  if (S.totalRaces % HIST_STEP === 0)  S.bankHistory.push(+S.bank.toFixed(2));
  if (S.totalRaces % ROI_STEP  === 0) {
    const roi = S.totalStaked>0 ? (S.totalReturn-S.totalStaked)/S.totalStaked*100 : 0;
    S.roiCurve.push({ race: S.totalRaces, roi: +roi.toFixed(2), bank: +S.bank.toFixed(2) });
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
console.log(`\n🏇  TRACKWISE ANALYSIS ENGINE — Strategy ${STRAT_TAG.toUpperCase()}`);
if (IS_V2) console.log(`    ${STRATEGY_V2.name}`);
console.log('Press Ctrl+C to stop and save.\n');

process.on('SIGINT', () => {
  console.log('\n\n⏹  Stopping…');
  save();
  print();
  console.log(`\n✓ Saved → public/data/results.json`);
  console.log('View at http://localhost:5173/analysis\n');
  process.exit(0);
});

function loop() {
  for (let i = 0; i < 200; i++) runRace();
  if (S.totalRaces % SAVE_EVERY  < 200) save();
  if (S.totalRaces % PRINT_EVERY < 200) print();
  setImmediate(loop);
}

loop();
