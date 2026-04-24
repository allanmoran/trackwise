/**
 * simulation.ts — pure game logic, no React/DOM.
 * Safe to import in both the main thread and a Web Worker.
 */

import { STRATEGY } from './config/strategy';

export const KB_VERSION     = 3;

export const FEED_INTERVAL  = 22000;
export const PRE_RACE_DELAY = 1800;
export const RACE_DURATION  = 5500;
export const POST_DELAY     = 3500;
export const START_BANK     = STRATEGY.bankroll.start;
export const UNIT_PCT       = STRATEGY.bankroll.unitPct;
export const MIN_UNIT       = STRATEGY.bankroll.minUnit;
export const MAX_UNIT       = STRATEGY.bankroll.maxUnit;
export const MIN_ODDS       = STRATEGY.selection.minOdds;
export const MAX_ODDS       = STRATEGY.selection.maxOdds;
export const MIN_SCORE      = STRATEGY.selection.minScore;

/* ── named constants for magic numbers ── */
const WEIGHT_ROUND_DIGITS   = 4;
const BARRIER_ROI_FACTOR    = 0.05;
const SCORE_ROI_THRESHOLD   = 0.10;
const SCORE_ROI_GOOD        = 0.05;
const SCORE_BAND_MIN_BETS   = 3;
const SCORE_BAND_MID_BETS   = 5;
const SCORE_STEP_UP         = 2;
const SCORE_STEP_DOWN       = 1;
const SCORE_CAP_HIGH        = 72;
const ODDS_ROI_FACTOR       = 0.05;
const ODDS_STEP_UP          = 0.5;
const ODDS_STEP_DOWN        = 0.3;
const ODDS_MIN_FLOOR        = 9.0;  // minOdds never goes below this (post-margin)
const ODDS_MIN_CEIL         = 15.0; // minOdds never rises above this
const ODDS_MAX_FLOOR        = 12.0; // maxOdds never goes below this
const LOSS_STREAK_ADJ_PENALTY = 5;
const LOSS_STREAK_THRESHOLD = 2;
const ADJ_TRAK_ROI_WEIGHT   = 15;
const ADJ_COND_ROI_WEIGHT   = 10;
const ADJ_WIN_SCORE_MIN     = 80;
const ADJ_EW_SCORE_MIN      = 68;
const ADJ_PLACE_SCORE_MIN   = 58;
const ADJ_WIN_ODDS_MIN      = 3.0;
const ADJ_WIN_FIELD_MAX     = 12;
const ADJ_EW_FIELD_MAX      = 14;
const PLACE_ODDS_MIN        = 2.2;   // needs placeOdds ≥ $2.20 (~winOdds $9+) for positive EV at ~35% strike
const UNIT_MULT_CLAMP_LO    = 0.7;
const UNIT_MULT_CLAMP_HI    = 1.4;
const BOOKMAKER_MARGIN      = 0.85; // 15% AU bookmaker overround applied to all odds
const PLACE_DIVIDEND_DIV    = 4;
const PLACE_DIVIDEND_DIV_LG = 5;
const PLACE_FIELD_LG        = 16;
const PLACE_FIELD_MD        = 8;
const PLACE_FIELD_SM        = 5;
const SCORE_BAND_ROI_FACTOR = 20;
const BARRIER_ROI_MIN_BETS  = 3;

export const TRACKS = [
  { n:"Flemington",    s:"VIC", t:"metro" }, { n:"Caulfield",     s:"VIC", t:"metro" },
  { n:"Moonee Valley", s:"VIC", t:"metro" }, { n:"Randwick",      s:"NSW", t:"metro" },
  { n:"Rosehill",      s:"NSW", t:"metro" }, { n:"Eagle Farm",    s:"QLD", t:"metro" },
  { n:"Morphettville", s:"SA",  t:"metro" }, { n:"Ballarat",      s:"VIC", t:"prov"  },
  { n:"Bendigo",       s:"VIC", t:"prov"  }, { n:"Gosford",       s:"NSW", t:"prov"  },
  { n:"Sandown",       s:"VIC", t:"prov"  }, { n:"Wagga",         s:"NSW", t:"country"},
  { n:"Mildura",       s:"VIC", t:"country"},
];
export const CONDITIONS = [
  { l:"Good 3",  wet:false, w:35 }, { l:"Good 4",  wet:false, w:30 },
  { l:"Dead 4",  wet:false, w:15 }, { l:"Dead 5",  wet:true,  w:8  },
  { l:"Soft 5",  wet:true,  w:6  }, { l:"Soft 6",  wet:true,  w:4  },
  { l:"Heavy 8", wet:true,  w:2  },
];
export const CLASSES   = ["Maiden","CL1","CL2","BM58","BM64","BM70","BM78","BM84","Gr3","Gr2"];
export const DISTANCES = [1000,1100,1200,1300,1400,1500,1600,1800,2000,2400];
const JOCKEYS = [
  { n:"J. McDonald", tier:1, wet:false }, { n:"W. Pike",    tier:1, wet:false },
  { n:"D. Yendall",  tier:2, wet:true  }, { n:"M. Zahra",   tier:1, wet:false },
  { n:"H. Bowman",   tier:1, wet:false }, { n:"K. McEvoy",  tier:1, wet:false },
  { n:"T. Berry",    tier:2, wet:false }, { n:"R. Bayliss", tier:2, wet:true  },
  { n:"L. Nolen",    tier:1, wet:true  }, { n:"B. Shinn",   tier:2, wet:false },
  { n:"D. Oliver",   tier:1, wet:false }, { n:"C. Brown",   tier:3, wet:false },
  { n:"A. Rawiller", tier:2, wet:false }, { n:"M. Walker",  tier:3, wet:true  },
];
const TRAINERS = [
  { n:"C. Maher",      tier:1, wet:false }, { n:"P. Moody",      tier:1, wet:true  },
  { n:"G. Waterhouse", tier:1, wet:false }, { n:"C. Waller",     tier:1, wet:false },
  { n:"J. Sadler",     tier:2, wet:true  }, { n:"D. Hayes",      tier:1, wet:false },
  { n:"L. Freedman",   tier:2, wet:false }, { n:"S. Gray",       tier:2, wet:true  },
  { n:"P. Snowden",    tier:2, wet:false }, { n:"M. Moroney",    tier:2, wet:true  },
  { n:"N. Blackiston", tier:3, wet:false }, { n:"K. Lees",       tier:2, wet:true  },
];
const H_ADJ  = ["Golden","Silver","Dark","Swift","Royal","Bold","Desert","Crimson","Thunder","Rapid","Iron","Storm","Wild","Shining","Blazing","Pacific","Noble","Flying","Brave","Free"];
const H_NOUN = ["Eagle","Shadow","Arrow","Wind","Knight","Tide","Dream","Spirit","Sky","Force","Light","Charge","Flame","Ridge","Star","Crown","Blade","Crest","Peak","Wave"];

export const ri    = (a: number, b: number) => Math.floor(Math.random()*(b-a+1))+a;
export const rf    = (a: number, b: number) => Math.random()*(b-a)+a;
export const pick  = <T,>(a: T[]): T => a[ri(0,a.length-1)];
export const pickW = <T extends { w: number }>(a: T[]): T => { const t=a.reduce((s,x)=>s+x.w,0); let r=Math.random()*t; for(const x of a){r-=x.w;if(r<=0)return x;} return a[a.length-1]; };
export const uid   = () => Math.random().toString(36).slice(2,7);
export const clamp = (v: number, a: number, b: number) => Math.min(b,Math.max(a,v));
export const fmt$  = (v: number) => v>=0?`+$${v.toFixed(2)}`:`-$${Math.abs(v).toFixed(2)}`;
export const ord   = (n: number) => n===1?"1st":n===2?"2nd":n===3?"3rd":`${n}th`;
export const ts    = () => new Date().toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

export type Stat = {b:number,w:number,p:number,s:number,r:number};

export function initKB() {
  return {
    _version:   KB_VERSION,
    tracks:     {} as Record<string,Stat>,
    conditions: {} as Record<string,Stat>,
    barriers:   { "1-3":{b:0,w:0,p:0,s:0,r:0},"4-6":{b:0,w:0,p:0,s:0,r:0},"7-9":{b:0,w:0,p:0,s:0,r:0},"10+":{b:0,w:0,p:0,s:0,r:0} },
    scoreBands: { "55-64":{b:0,w:0,p:0,s:0,r:0},"65-74":{b:0,w:0,p:0,s:0,r:0},"75-84":{b:0,w:0,p:0,s:0,r:0},"85+":{b:0,w:0,p:0,s:0,r:0} },
    betTypes:   { WIN:{b:0,w:0,p:0,s:0,r:0},PLACE:{b:0,w:0,p:0,s:0,r:0},"EACH-WAY":{b:0,w:0,p:0,s:0,r:0} },
    oddsRanges: { "4-7":{b:0,w:0,p:0,s:0,r:0},"8-11":{b:0,w:0,p:0,s:0,r:0},"12-16":{b:0,w:0,p:0,s:0,r:0},"17+":{b:0,w:0,p:0,s:0,r:0} },
    weights:    { recentForm:STRATEGY.weights.recentForm as number, classRating:STRATEGY.weights.classRating as number, barrier:STRATEGY.weights.barrier as number, wetTrack:STRATEGY.weights.wetTrack as number, jockeyTier:STRATEGY.weights.jockeyTier as number, trainerTier:STRATEGY.weights.trainerTier as number },
    thresholds: { minScore:STRATEGY.selection.minScore as number, minOdds:STRATEGY.selection.minOdds as number, maxOdds:STRATEGY.selection.maxOdds as number, ewOddsMin:STRATEGY.selection.ewOddsMin as number },
    totalBets:0, totalStaked:0, totalReturn:0, consLosses:0, consWins:0, version:1,
  };
}

export type KB = ReturnType<typeof initKB>;

export function updateKB(kb: KB, bet: any, result: string, pl: number, runner: any): KB {
  const ret = bet.totalStake + pl;
  const n   = JSON.parse(JSON.stringify(kb)) as KB;
  const upd = (obj: Record<string,Stat>, key: string) => {
    if(!obj[key]) obj[key]={b:0,w:0,p:0,s:0,r:0};
    obj[key].b++;
    if(result==="WIN") obj[key].w++;
    if(result==="WIN"||result==="PLACE") obj[key].p++;
    obj[key].s+=bet.totalStake; obj[key].r+=ret;
  };
  upd(n.tracks, bet.track); upd(n.conditions, bet.cond);
  const bb=runner.barrier<=3?"1-3":runner.barrier<=6?"4-6":runner.barrier<=9?"7-9":"10+"; upd(n.barriers,bb);
  const sb=runner.scores.total>=85?"85+":runner.scores.total>=75?"75-84":runner.scores.total>=65?"65-74":"55-64"; upd(n.scoreBands,sb);
  upd(n.betTypes,bet.betType);
  const od=bet.winOdds<=7?"4-7":bet.winOdds<=11?"8-11":bet.winOdds<=16?"12-16":"17+"; upd(n.oddsRanges,od);
  n.totalBets++; n.totalStaked+=bet.totalStake; n.totalReturn+=ret;
  if(result==="LOSS"){n.consLosses++;n.consWins=0;}else{n.consWins++;n.consLosses=0;}
  if(n.totalBets>0&&n.totalBets%STRATEGY.learning.recalibrationInterval===0){
    n.version++;
    const roi=(b: Stat|undefined)=>b&&b.s>0?(b.r-b.s)/b.s:0;
    const bb13=n.barriers["1-3"],bb10=n.barriers["10+"];
    if(bb13.b>BARRIER_ROI_MIN_BETS&&bb10.b>BARRIER_ROI_MIN_BETS) n.weights.barrier=clamp(n.weights.barrier+(roi(bb13)-roi(bb10))*BARRIER_ROI_FACTOR,STRATEGY.learning.weightBounds.min,0.30);
    const low=n.scoreBands["55-64"],mid=n.scoreBands["65-74"];
    if(low.b>SCORE_BAND_MIN_BETS&&roi(low)<-SCORE_ROI_THRESHOLD) n.thresholds.minScore=Math.min(SCORE_CAP_HIGH,n.thresholds.minScore+SCORE_STEP_UP);
    if(mid.b>SCORE_BAND_MID_BETS&&roi(mid)>SCORE_ROI_GOOD)       n.thresholds.minScore=Math.max(MIN_SCORE,n.thresholds.minScore-SCORE_STEP_DOWN);
    const rLo=n.oddsRanges["8-11"],rMid=n.oddsRanges["12-16"],rHi=n.oddsRanges["17+"];
    // Raise minOdds when mid-odds outperform low-odds (avoid overbacking favorites)
    if(rMid.b>SCORE_BAND_MIN_BETS&&rLo.b>SCORE_BAND_MIN_BETS&&roi(rMid)>roi(rLo)+ODDS_ROI_FACTOR)
      n.thresholds.minOdds=Math.min(ODDS_MIN_CEIL,n.thresholds.minOdds+ODDS_STEP_UP);
    // Lower minOdds when low-odds outperform mid-odds but never below floor
    if(rLo.b>SCORE_BAND_MIN_BETS&&rMid.b>SCORE_BAND_MIN_BETS&&roi(rLo)>roi(rMid)+ODDS_ROI_FACTOR)
      n.thresholds.minOdds=Math.max(ODDS_MIN_FLOOR,n.thresholds.minOdds-ODDS_STEP_DOWN);
    if(rHi.b>SCORE_BAND_MIN_BETS&&roi(rHi)<-SCORE_ROI_THRESHOLD) n.thresholds.maxOdds=Math.max(ODDS_MAX_FLOOR,n.thresholds.maxOdds-ODDS_STEP_DOWN);
    const keys = Object.keys(n.weights) as (keyof typeof n.weights)[];
    const wSum = keys.reduce((a, k) => a + n.weights[k], 0);
    keys.forEach(k => { n.weights[k] = +(n.weights[k] / wSum).toFixed(WEIGHT_ROUND_DIGITS); });
    /* fix floating point residual on the largest weight */
    const wSum2 = keys.reduce((a, k) => a + n.weights[k], 0);
    if (wSum2 !== 1) {
      const largest = keys.reduce((a, k) => n.weights[k] > n.weights[a] ? k : a, keys[0]);
      n.weights[largest] = +(n.weights[largest] + (1 - wSum2)).toFixed(WEIGHT_ROUND_DIGITS);
    }
  }
  return n;
}

export function generateRace(kb: KB) {
  const track=pick(TRACKS),cond=pickW(CONDITIONS),cls=pick(CLASSES),dist=pick(DISTANCES),field=ri(6,14);
  const w=kb.weights;
  const placeDiv=field>=PLACE_FIELD_LG?PLACE_DIVIDEND_DIV_LG:PLACE_DIVIDEND_DIV;

  // Pass 1: build attributes and raw quality scores
  const raw=Array.from({length:field},(_,i)=>{
    const jockey=pick(JOCKEYS),trainer=pick(TRAINERS),barrier=i+1;
    const isWetSpec=jockey.wet||trainer.wet;
    const formArr=Array.from({length:6},()=>{const r=Math.random();return r<.18?"1":r<.32?"2":r<.44?"3":r<.56?"4":r<.68?"5":"x";});
    const formStr=formArr.join(""),top3=formArr.filter(f=>"123".includes(f)).length;
    const rF=Math.min(100,top3*14+ri(5,35)),cR=clamp(CLASSES.indexOf(cls)*9+ri(-10,15),10,100);
    const bbK=barrier<=3?"1-3":barrier<=6?"4-6":barrier<=9?"7-9":"10+";
    const bbData=kb.barriers[bbK as keyof typeof kb.barriers];
    const bbROI=bbData?.s>0?(bbData.r-bbData.s)/bbData.s:0;
    const bR=clamp((barrier<=3?ri(60,90):barrier<=6?ri(55,85):barrier<=9?ri(40,70):ri(25,55))+bbROI*SCORE_BAND_ROI_FACTOR,10,100);
    const wetR=cond.wet?(isWetSpec?ri(65,95):ri(15,50)):ri(45,75);
    const jR=jockey.tier===1?ri(65,95):jockey.tier===2?ri(40,75):ri(20,55);
    const tR=trainer.tier===1?ri(65,95):trainer.tier===2?ri(40,75):ri(20,55);
    const total=Math.round(rF*w.recentForm+cR*w.classRating+bR*w.barrier+wetR*w.wetTrack+jR*w.jockeyTier+tR*w.trainerTier);
    // Raw quality → unnormalized probability proxy (positive, bounded)
    // Weak score→prob correlation: high scores win more but upsets are very common
    // Signal range (score 55→85): 0.036  Noise stdev: 0.032  R²≈9%
    const rawProb=clamp(total/100*0.12+rf(-0.04,0.07),0.02,0.40);
    return {jockey,trainer,barrier,isWetSpec,formStr,total,rawProb,rF,cR,bR,wetR,jR,tR};
  });

  // Pass 2: normalize so trueProbWins sum to 1, then derive market odds
  // This ensures resolveRace outcome probs match odds — fixing the systematic negative-EV bug.
  const totalRaw=raw.reduce((s,r)=>s+r.rawProb,0);
  const runners=raw.map(r=>{
    const trueProbWin=r.rawProb/totalRaw;                   // sums to 1 across field
    // Market noise ±50% creates mispricings; 3% overround is the pre-margin fair price
    const mktProb=clamp(trueProbWin*rf(0.50,1.50)*1.03,0.02,0.65);
    // Raw "fair" odds before bookmaker margin
    const rawWinOdds=clamp(1/mktProb*rf(0.93,1.07),1.5,35);
    // Apply 15% bookmaker margin — this is what the punter actually sees and bets at
    const winOdds=parseFloat((rawWinOdds*BOOKMAKER_MARGIN).toFixed(1));
    const rawPlaceOdds=clamp((rawWinOdds-1)/placeDiv+1+rf(-0.1,0.2),1.1,rawWinOdds*0.5);
    const placeOdds=parseFloat((rawPlaceOdds*BOOKMAKER_MARGIN).toFixed(2));
    return {id:uid(),barrier:r.barrier,name:`${pick(H_ADJ)} ${pick(H_NOUN)}`,jockey:r.jockey.n,trainer:r.trainer.n,
      jockeyTier:r.jockey.tier,isWetSpec:r.isWetSpec,formStr:r.formStr,winOdds,placeOdds,
      scores:{total:r.total,rF:r.rF,cR:r.cR,bR:r.bR,wetR:r.wetR,jR:r.jR,tR:r.tR},
      trueProbWin,finishing:null as number|null,betType:"SKIP"};
  });
  return {id:uid(),track,cond,cls,dist,field,runners,isWet:cond.wet};
}

export type Race   = ReturnType<typeof generateRace>;
export type Runner = Race["runners"][number];

export function decideBet(race: Race, kb: KB, bank: number) {
  if(bank<MIN_UNIT) return {decision:"NO_BET",reason:"Insufficient bank",unit:0,runner:undefined,betType:undefined,totalStake:undefined,winStake:undefined,placeStake:undefined,adj:undefined,gap:undefined,tROI:undefined,cROI:undefined};
  const thr=kb.thresholds,unit=clamp(bank*UNIT_PCT,MIN_UNIT,MAX_UNIT);
  const sorted=[...race.runners].sort((a,b)=>b.scores.total-a.scores.total);
  const top=sorted[0],second=sorted[1];
  const roi=(b: Stat|undefined)=>b&&b.s>0?(b.r-b.s)/b.s:0;
  const NO_BET=(reason: string)=>({decision:"NO_BET",reason,unit,runner:undefined,betType:undefined,totalStake:undefined,winStake:undefined,placeStake:undefined,adj:undefined,gap:undefined,tROI:undefined,cROI:undefined});
  if(top.scores.total<thr.minScore) return NO_BET(`Score ${top.scores.total} < min ${thr.minScore.toFixed(0)}`);
  if(top.winOdds<thr.minOdds)       return NO_BET(`Odds $${top.winOdds} too short`);
  if(top.winOdds>thr.maxOdds)       return NO_BET(`Odds $${top.winOdds} too long`);
  if(kb.consLosses>=STRATEGY.selection.lossStreakThreshold&&top.scores.total<thr.minScore+STRATEGY.selection.lossStreakScoreBonus) return NO_BET(`Loss streak (${kb.consLosses}) — raising bar`);
  // Expected-value filter: estimate fair win prob from field scores, only bet at sufficient overlay.
  // With 15% bookmaker margin applied to all odds, we need the market to have meaningfully
  // underpriced our selection before there is positive expected value.
  const totalRawEst=race.runners.reduce((s,r)=>s+Math.max(0.01,r.scores.total/100*0.12),0);
  const myRawEst=Math.max(0.01,top.scores.total/100*0.12);
  const estTrueProb=myRawEst/totalRawEst;
  const valueRatio=top.winOdds*estTrueProb; // >1.0 = positive EV, target >1.30
  if(valueRatio<1.25) return NO_BET(`Insufficient value (EV est ${(valueRatio*100).toFixed(0)}% vs 125% min)`);
  const tROI=roi(kb.tracks[race.track.n]),cROI=roi(kb.conditions[race.cond.l]);
  const adj=top.scores.total+tROI*ADJ_TRAK_ROI_WEIGHT+cROI*ADJ_COND_ROI_WEIGHT-(kb.consLosses>LOSS_STREAK_THRESHOLD?LOSS_STREAK_ADJ_PENALTY:0);
  const gap=top.scores.total-second.scores.total;
  let betType: string;
  if(adj>=ADJ_WIN_SCORE_MIN&&top.winOdds>=ADJ_WIN_ODDS_MIN&&gap>=8&&race.field<=ADJ_WIN_FIELD_MAX)          betType="WIN";
  else if(adj>=ADJ_EW_SCORE_MIN&&top.winOdds>=thr.ewOddsMin&&race.field<=ADJ_EW_FIELD_MAX) betType="EACH-WAY";
  else if(adj>=ADJ_PLACE_SCORE_MIN&&top.placeOdds>=PLACE_ODDS_MIN)                         betType="PLACE";
  else return NO_BET(`Adj score ${adj.toFixed(0)} — no valid bet type`);
  /* post-adjustment odds guard — re-check minOdds/maxOdds after KB threshold adjustment */
  if(top.winOdds<thr.minOdds) return NO_BET(`Odds $${top.winOdds} below adjusted min ${thr.minOdds.toFixed(1)}`);
  if(top.winOdds>thr.maxOdds) return NO_BET(`Odds $${top.winOdds} above adjusted max ${thr.maxOdds.toFixed(1)}`);
  const mult=clamp(1.0+(tROI+cROI)*0.5,UNIT_MULT_CLAMP_LO,UNIT_MULT_CLAMP_HI);
  const finalUnit=clamp(unit*mult,MIN_UNIT,MAX_UNIT);
  // Account restriction: bookmakers limit winning accounts progressively once bank doubles
  const restrictionFactor=bank>START_BANK*2
    ?Math.max(0.1,1-((bank/START_BANK-2)*0.05))
    :1.0;
  const winStake=parseFloat((finalUnit*STRATEGY.staking.winPct*restrictionFactor).toFixed(2));
  const placeStake=parseFloat((finalUnit*STRATEGY.staking.placePct*restrictionFactor).toFixed(2));
  return { decision:"BET",runner:top,betType,totalStake:parseFloat((winStake+placeStake).toFixed(2)),
    winStake,placeStake,adj:adj.toFixed(0),gap,tROI:(tROI*100).toFixed(1),cROI:(cROI*100).toFixed(1),
    unit:finalUnit,restrictionFactor:parseFloat(restrictionFactor.toFixed(3)),reason:undefined };
}

export function resolveRace(runners: Runner[]) {
  const sh = <T,>(a: T[]): T[] => {const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;};
  const wpick=(pool: Runner[]): Runner =>{
    if(pool.length===0) return runners[0];
    const t=pool.reduce((s,r)=>s+r.trueProbWin,0);
    let c=0,rd=Math.random()*t;
    for(const r of sh(pool)){c+=r.trueProbWin;if(c>=rd)return r;}
    return pool[0];
  };
  const w1=wpick(runners);
  const pool2=runners.filter(r=>r.id!==w1.id);
  const w2=pool2.length>0?wpick(pool2):runners[0];
  const pool3=runners.filter(r=>r.id!==w1.id&&r.id!==w2.id);
  const _w3=pool3.length>0?wpick(pool3):runners[0];
  const pos: Record<string,number>={[w1.id]:1,[w2.id]:2,[_w3.id]:3};
  return runners.map((r,i)=>({...r,finishing:pos[r.id]||(i+4)}));
}

/**
 * AU Betfair place rules:
 *  < 5 runners : no place bet — WIN only result
 *  5–7 runners : top 2 pay place  (dividend = (winOdds-1)/4 + 1)
 *  8–15 runners: top 3 pay place  (dividend = (winOdds-1)/4 + 1)
 * 16+  runners : top 3 pay place  (dividend = (winOdds-1)/5 + 1)
 * placeOdds is already pre-computed on the runner and stored in the bet — use it directly.
 */
export function calcPL(bet: any, resolved: ReturnType<typeof resolveRace>) {
  const r=resolved.find(x=>x.id===bet.runnerId);
  if(!r) return {result:"LOSS",pl:-bet.totalStake};
  const pos=r.finishing;
  const fieldSize: number=bet.fieldSize;
  /* determine number of paid places per AU Betfair rules */
  let places: number;
  if(fieldSize>=PLACE_FIELD_MD)       places=3;
  else if(fieldSize>=PLACE_FIELD_SM)  places=2;
  else                                places=0; /* < 5 runners: no place bet */
  if(bet.betType==="WIN"){
    if(pos===1) return {result:"WIN",pl:parseFloat((bet.winStake*(bet.winOdds-1)+bet.placeStake*(bet.placeOdds-1)).toFixed(2))};
    if(places>0&&pos<=places) return {result:"PLACE",pl:parseFloat((bet.placeStake*(bet.placeOdds-1)-bet.winStake).toFixed(2))};
    return {result:"LOSS",pl:-bet.totalStake};
  }
  if(bet.betType==="PLACE"){
    if(places>0&&pos<=places) return {result:pos===1?"WIN":"PLACE",pl:parseFloat((bet.totalStake*(bet.placeOdds-1)).toFixed(2))};
    return {result:"LOSS",pl:-bet.totalStake};
  }
  if(bet.betType==="EACH-WAY"){
    // Use actual 20/80 stakes, not a 50/50 assumption
    const ws=bet.winStake,ps=bet.placeStake;
    const pl=pos===1
      ?ws*(bet.winOdds-1)+ps*(bet.placeOdds-1)
      :places>0&&pos<=places
        ?ps*(bet.placeOdds-1)-ws
        :-bet.totalStake;
    return {result:pos===1?"WIN":places>0&&pos<=places?"PLACE":"LOSS",pl:parseFloat(pl.toFixed(2))};
  }
  return {result:"LOSS",pl:-bet.totalStake};
}

export { STRATEGY };
