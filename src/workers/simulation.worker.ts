/// <reference lib="webworker" />

import {
  FEED_INTERVAL, PRE_RACE_DELAY, RACE_DURATION, POST_DELAY, START_BANK,
  uid, ts, fmt$, ord,
  initKB, updateKB, generateRace, decideBet, resolveRace, calcPL,
  type KB,
} from '../simulation';

/* ── worker state ── */
let kb:      KB      = initKB();
let bank:    number  = START_BANK;
let running: boolean = false;
let looping: boolean = false;
let speedMult: number = 1;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, Math.max(50, Math.round(ms / speedMult))));

const self_ = self as unknown as DedicatedWorkerGlobalScope;

function emit(type: string, payload?: unknown) {
  self_.postMessage(payload !== undefined ? { type, payload } : { type });
}

/* ── simulation cycle ── */
async function runCycle() {
  const log: { msg: string; logType: string }[] = [];
  function addLog(msg: string, logType: string) {
    log.push({ msg, logType });
    emit('LOG', { msg, logType });
  }

  /* feed phase */
  emit('PHASE', 'feed');
  addLog('Receiving live race feed from Betfair Exchange AU…', 'info');
  await sleep(1400);
  if (!running) return;

  const race = generateRace(kb);
  emit('RACE', { race, runners: race.runners });
  addLog(`Form loaded: ${race.track.n} — ${race.cls} ${race.dist}m — ${race.cond.l} — ${race.field} runners`, 'info');

  /* pre-race phase */
  emit('PHASE', 'pre');
  await sleep(PRE_RACE_DELAY);
  if (!running) return;

  const dec = decideBet(race, kb, bank);

  if (dec.decision === 'NO_BET') {
    addLog(`No bet — ${dec.reason}`, 'warn');
    emit('PHASE', 'idle');
    emit('RACE_RESULT', {
      race, runners: race.runners, bet: null,
      result: 'NO_BET', reason: dec.reason, pl: 0, bank, kb, log,
    });
    return;
  }

  const top = dec.runner!;
  addLog(`Selection: "${top.name}" — ${dec.betType} — Score:${top.scores.total} (adj ${dec.adj}) — Gap:${dec.gap}pts`, 'bet');
  addLog(`60/40 Split — $${dec.winStake!.toFixed(2)} Win + $${dec.placeStake!.toFixed(2)} Place = $${dec.totalStake!.toFixed(2)}`, 'bet');

  const updRunners = race.runners.map(r => ({ ...r, betType: r.id === top.id ? dec.betType! : 'SKIP' }));
  bank = parseFloat((bank - dec.totalStake!).toFixed(2));

  const bet = {
    id: uid(), runnerId: top.id, horse: top.name,
    track: race.track.n, state: race.track.s,
    cls: race.cls, dist: `${race.dist}m`, cond: race.cond.l,
    fieldSize: race.field, betType: dec.betType,
    totalStake: dec.totalStake, winStake: dec.winStake, placeStake: dec.placeStake,
    winOdds: top.winOdds, placeOdds: top.placeOdds,
    result: 'PENDING', pl: null as null | number, timestamp: ts(),
  };
  emit('BET', { bet, runners: updRunners, bank });

  /* race phase */
  emit('PHASE', 'race');
  addLog(`Race running: ${race.track.n} ${race.dist}m — ${race.field} runners…`, 'race');
  await sleep(RACE_DURATION);
  if (!running) return;

  const resolved = resolveRace(updRunners);
  const winner = resolved.find(r => r.finishing === 1)!;
  addLog(`Winner: "${winner.name}" (Barrier ${winner.barrier}) @ $${winner.winOdds}`, 'race');

  /* post / learning phase */
  emit('PHASE', 'post');
  const { result, pl } = calcPL(bet, resolved);
  const finalBet = { ...bet, result, pl };
  bank = parseFloat((bank + dec.totalStake! + pl).toFixed(2));

  const plStr = fmt$(pl);
  if (result === 'WIN')
    addLog(`WIN — "${top.name}" — P&L: ${plStr} — Bank: $${bank.toFixed(2)}`, 'win');
  else if (result === 'PLACE')
    addLog(`PLACE — "${top.name}" — P&L: ${plStr} — Bank: $${bank.toFixed(2)}`, 'place');
  else
    addLog(`Loss — "${top.name}" finished ${ord(resolved.find(r => r.id === top.id)?.finishing ?? 9)} — P&L: ${plStr} — Bank: $${bank.toFixed(2)}`, 'loss');

  await sleep(600);
  if (!running) return;
  const runner = resolved.find(r => r.id === top.id)!;
  const prevKB = kb;
  kb = updateKB(prevKB, finalBet, result, pl, runner);

  if (kb.version > prevKB.version)
    addLog(`KB v${kb.version} — Weights recalibrated. Min score: ${kb.thresholds.minScore.toFixed(0)}, Max odds: $${kb.thresholds.maxOdds.toFixed(1)}`, 'learn');
  else
    addLog(`KB updated: ${race.track.n} | ${race.cond.l} | ${dec.betType} | ${result}`, 'learn');

  const sysROI = kb.totalStaked > 0 ? (kb.totalReturn - kb.totalStaked) / kb.totalStaked * 100 : 0;
  if (kb.totalBets % 5 === 0)
    addLog(`System ROI after ${kb.totalBets} bets: ${sysROI >= 0 ? '+' : ''}${sysROI.toFixed(1)}% (target: +5–10%)`, sysROI >= 5 ? 'win' : sysROI >= 0 ? 'warn' : 'loss');

  await sleep(POST_DELAY);
  if (!running) return;
  emit('PHASE', 'idle');

  /* bundle everything for persistence + final UI update */
  emit('RACE_RESULT', {
    race, runners: resolved, bet: finalBet,
    result, pl, bank, kb, log,
  });
}

/* ── main loop ── */
async function loop() {
  if (looping) return;
  looping = true;
  while (running) {
    await runCycle();
    if (!running) break;
    /* countdown to next race */
    const start = Date.now();
    while (running) {
      const elapsed = Date.now() - start;
      if (elapsed >= FEED_INTERVAL) break;
      emit('NEXT_IN', Math.ceil((FEED_INTERVAL - elapsed) / 1000));
      await sleep(250);
    }
    emit('NEXT_IN', 0);
  }
  looping = false;
}

/* ── message handler ── */
self_.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data as { type: string; payload?: unknown };
  if (type === 'START')     { running = true; loop(); }
  if (type === 'STOP')      { running = false; }
  if (type === 'RESET')     { running = false; kb = initKB(); bank = START_BANK; emit('RESET_DONE'); }
  if (type === 'LOAD_KB'   && payload) kb   = payload as KB;
  if (type === 'LOAD_BANK' && payload !== undefined) bank = payload as number;
  if (type === 'SET_SPEED' && payload !== undefined) speedMult = payload as number;
};
