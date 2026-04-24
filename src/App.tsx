import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from 'react-router-dom';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  KB_VERSION,
  START_BANK, UNIT_PCT, MIN_UNIT, MAX_UNIT,
  uid, ts, clamp, fmt$,
  initKB,
  type KB, type Stat, type Race, type Runner,
} from "./simulation";

/* ─────────────────────────────────────────────────────────────────────────────
   TRACKWISE v2  ·  Self-Learning AU Racing · Light / shadcn (no Table)
───────────────────────────────────────────────────────────────────────────── */

/* ── localStorage keys & helpers ── */
const LS_KB       = "trackwise_kb";
const LS_LEDGER   = "trackwise_ledger";
const LS_BANK     = "trackwise_bank";
const LS_BANKHIST = "trackwise_bank_history";
const LS_RACES    = "trackwise_races";

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; }
  catch { return fallback; }
}
function lsSet(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function lsClear(...keys: string[]): void {
  keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
}

/* ── Sparkline ── */
function Sparkline({ history }: { history: {bank:number,n:number}[] }) {
  if(history.length<2) return <div className="h-16 flex items-center justify-center text-xs text-slate-400">Awaiting data…</div>;
  const vals=history.map(h=>h.bank);
  const min=Math.min(...vals,START_BANK)*0.993,max=Math.max(...vals,START_BANK)*1.007,range=max-min||1;
  const W=260,H=64,P=4;
  const x=(i: number)=>P+(i/(vals.length-1||1))*(W-P*2);
  const y=(v: number)=>P+(1-(v-min)/range)*(H-P*2);
  const pts=vals.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
  const area=`${x(0)},${H-P} ${pts} ${x(vals.length-1)},${H-P}`;
  const isUp=vals[vals.length-1]>=START_BANK;
  const lc=isUp?"#16a34a":"#dc2626";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lc} stopOpacity="0.15"/>
          <stop offset="100%" stopColor={lc} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#sg)"/>
      <polyline points={pts} fill="none" stroke={lc} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
      <line x1={P} x2={W-P} y1={y(START_BANK)} y2={y(START_BANK)} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,2"/>
      <circle cx={x(vals.length-1)} cy={y(vals[vals.length-1])} r="2.5" fill={lc}/>
    </svg>
  );
}

/* ── Sub-components ── */
function KBRow({ label, data }: { label: string; data: Stat }) {
  if(!data||data.b===0) return null;
  const roi=(data.r-data.s)/data.s*100;
  const strike=data.b>0?Math.round(data.p/data.b*100):0;
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-50 text-xs">
      <span className="font-mono text-slate-700 w-20 truncate">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-slate-400 font-mono">{data.b}b</span>
        <span className="text-slate-400 font-mono">{strike}%↑</span>
        <span className={`font-semibold font-mono w-14 text-right ${roi>=5?"text-green-600":roi>=0?"text-amber-600":"text-red-500"}`}>
          {roi>=0?"+":""}{roi.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  const cfg: Record<string,{label:string,cls:string}> = {
    idle:{ label:"Idle",       cls:"" },
    feed:{ label:"Data Feed",  cls:"bg-sky-100 text-sky-700 border-sky-200" },
    pre: { label:"Pre-Race",   cls:"bg-amber-100 text-amber-700 border-amber-200" },
    race:{ label:"Race Live",  cls:"bg-violet-100 text-violet-700 border-violet-200" },
    post:{ label:"Learning",   cls:"bg-green-100 text-green-700 border-green-200" },
  };
  const c=cfg[phase]||cfg.idle;
  return (
    <Badge variant="outline" className={`gap-1.5 ${c.cls}`}>
      {phase!=="idle" && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block"/>}
      {c.label}
    </Badge>
  );
}
function ResultBadge({ result }: { result: string }) {
  if(result==="WIN")   return <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px] h-5">WIN</Badge>;
  if(result==="PLACE") return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] h-5">PLACE</Badge>;
  if(result==="LOSS")  return <Badge variant="destructive" className="text-[10px] h-5">LOSS</Badge>;
  return <Badge variant="outline" className="text-[10px] h-5">PENDING</Badge>;
}
function BetBadge({ type }: { type: string }) {
  if(type==="WIN")      return <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] h-5">WIN</Badge>;
  if(type==="PLACE")    return <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] h-5">PLACE</Badge>;
  if(type==="EACH-WAY") return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] h-5">E/W</Badge>;
  return <Badge variant="outline" className="text-[10px] h-5">SKIP</Badge>;
}
function TrackBadge({ type }: { type: string }) {
  if(type==="metro")  return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Metro</Badge>;
  if(type==="prov")   return <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-xs">Provincial</Badge>;
  return <Badge className="bg-orange-50 text-orange-700 border-orange-200 text-xs">Country</Badge>;
}

/* ── Runner row ── */
function RunnerRow({ r, currentBet }: { r: any; currentBet: any }) {
  const isWinner = r.finishing===1;
  const isPlaced = r.finishing!==null && r.finishing>1 && r.finishing<=3;
  const isBet    = currentBet?.runnerId===r.id;
  const scoreColor = r.scores.total>=75?"#16a34a":r.scores.total>=62?"#d97706":"#ef4444";

  let rowBg="bg-white", leftBorder="border-l-2 border-l-transparent";
  if(isWinner)      { rowBg="bg-green-50";  leftBorder="border-l-2 border-l-green-500"; }
  else if(isPlaced) { rowBg="bg-blue-50";   leftBorder="border-l-2 border-l-blue-400"; }
  else if(isBet)    { rowBg="bg-amber-50";  leftBorder="border-l-2 border-l-amber-400"; }

  return (
    <div className={`grid border-b border-slate-100 items-center gap-2 px-3 py-2 ${rowBg} ${leftBorder} hover:brightness-95 transition-all`}
      style={{gridTemplateColumns:"28px 1fr 54px 58px 58px 96px 52px"}}>
      <div className="w-6 h-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-mono font-semibold text-slate-600">
        {r.barrier}
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-800 leading-tight">
          {r.name}{r.finishing===1?" 🏆":r.finishing===2?" 🥈":r.finishing===3?" 🥉":""}
        </div>
        <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{r.jockey}</div>
      </div>
      <div className="font-mono text-[11px] text-slate-500 tracking-wider">{r.formStr}</div>
      <div className="font-mono text-[13px] font-semibold text-green-600 text-right">${r.winOdds}</div>
      <div className="font-mono text-[13px] font-semibold text-blue-600 text-right">${r.placeOdds}</div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] font-bold w-6" style={{color:scoreColor}}>{r.scores.total}</span>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{width:`${r.scores.total}%`,background:scoreColor}}/>
        </div>
      </div>
      <div><BetBadge type={r.betType}/></div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────────────────────────────────────── */
export default function TrackwiseLight() {
  const [running,     setRunning]     = useState(false);
  const [phase,       setPhase]       = useState("idle");
  const [progPct,     setProgPct]     = useState(0);
  const [nextIn,      setNextIn]      = useState(0);
  const [kb,          setKB]          = useState<KB>(()  => {
    const saved = lsGet<any>(LS_KB, null);
    if (saved && saved._version === KB_VERSION) return saved as KB;
    if (saved) lsClear(LS_KB); // stale schema — remove it
    return initKB();
  });
  const [bank,        setBank]        = useState<number>(()  => {
    const savedKBRaw = localStorage.getItem(LS_KB);
    const savedKB = savedKBRaw ? (() => { try { return JSON.parse(savedKBRaw); } catch { return null; } })() : null;
    const kbValid = savedKB && savedKB._version === KB_VERSION;
    if (!kbValid) lsClear(LS_BANK); // if KB was stale, reset bank too
    return lsGet(LS_BANK, START_BANK);
  });
  const [race,        setRace]        = useState<Race|null>(null);
  const [runners,     setRunners]     = useState<Runner[]>([]);
  const [noBetReason, setNoBetReason] = useState("");
  const [currentBet,  setCurrentBet]  = useState<any>(null);
  const [ledger,      setLedger]      = useState<any[]>(()  => lsGet(LS_LEDGER,   []));
  const [bankHist,    setBankHist]    = useState(()  => lsGet(LS_BANKHIST, [{bank:START_BANK,n:0}]));
  const [feedLog,     setFeedLog]     = useState<{id:string,time:string,msg:string,type:string}[]>([]);
  const [savedFlash,   setSavedFlash]   = useState(false);
  const [kbLoadedFlash,setKbLoadedFlash] = useState(()=>!!localStorage.getItem(LS_KB));
  const [totalRaces,   setTotalRaces]   = useState(()=>lsGet<number>(LS_RACES, 0));

  const [speed, setSpeed] = useState<1|5|20>(1);

  const workerRef  = useRef<Worker|null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  /* ── dismiss 📦 Loaded flash after 3 s ── */
  useEffect(()=>{
    if(!kbLoadedFlash) return;
    const t = setTimeout(()=>setKbLoadedFlash(false), 3000);
    return()=>clearTimeout(t);
  },[kbLoadedFlash]);

  /* ── worker setup ── */
  useEffect(()=>{
    const w = new Worker(
      new URL('./workers/simulation.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = w;

    /* restore persisted state into worker on startup */
    const savedKB   = localStorage.getItem(LS_KB);
    const savedBank = localStorage.getItem(LS_BANK);
    if (savedKB)   w.postMessage({ type: 'LOAD_KB',   payload: JSON.parse(savedKB) });
    if (savedBank) w.postMessage({ type: 'LOAD_BANK', payload: parseFloat(savedBank) });

    const PHASE_PROG: Record<string,number> = { feed:10, pre:40, race:70, post:90, idle:0 };

    w.onmessage = ({ data }: MessageEvent) => {
      const { type, payload } = data as { type: string; payload: any };
      switch(type) {
        case 'PHASE':
          setPhase(payload);
          setProgPct(PHASE_PROG[payload] ?? 0);
          break;
        case 'NEXT_IN':
          setNextIn(payload);
          break;
        case 'LOG':
          setFeedLog(p=>[{id:uid(),time:ts(),msg:payload.msg,type:payload.logType},...p].slice(0,200));
          break;
        case 'RACE':
          setRace(payload.race);
          setRunners(payload.runners);
          setCurrentBet(null);
          setNoBetReason('');
          break;
        case 'BET':
          setCurrentBet(payload.bet);
          setRunners(payload.runners);
          setBank(payload.bank);
          break;
        case 'RESET_DONE':
          /* worker has confirmed its internal state is clean */
          break;
        case 'RACE_RESULT': {
          const { race: r, runners: rs, bet, result, pl: _pl, bank: newBank, kb: newKB, reason } = payload;
          setRace(r);
          setRunners(rs);
          setBank(newBank);
          setKB(newKB);
          if (result === 'NO_BET') {
            setCurrentBet(null);
            setNoBetReason(reason ?? '');
          } else {
            setCurrentBet(bet);
            setNoBetReason('');
            setLedger(p=>{ const u=[bet,...p].slice(0,300); lsSet(LS_LEDGER,u); return u; });
            setBankHist(p=>{ const u=[...p,{bank:newBank,n:p.length}].slice(-200); lsSet(LS_BANKHIST,u); return u; });
          }
          lsSet(LS_KB,   newKB);
          lsSet(LS_BANK, newBank);
          setTotalRaces(n=>{ const next=n+1; lsSet(LS_RACES,next); return next; });
          setSavedFlash(true);
          if(savedTimer.current) clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(()=>setSavedFlash(false), 2000);
          break;
        }
      }
    };

    return()=>{ w.terminate(); };
  },[]);

  useEffect(() => {
    workerRef.current?.postMessage({ type: 'SET_SPEED', payload: speed });
  }, [speed]);

  /* ── visibility sync: re-read localStorage when tab comes back into focus ── */
  useEffect(()=>{
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const savedKBRaw  = localStorage.getItem(LS_KB);
      const savedBank   = localStorage.getItem(LS_BANK);
      const savedLedger = localStorage.getItem(LS_LEDGER);
      const savedHist   = localStorage.getItem(LS_BANKHIST);
      if (savedKBRaw) {
        try {
          const parsed = JSON.parse(savedKBRaw);
          if (parsed && parsed._version === KB_VERSION) setKB(parsed as KB);
        } catch { /* ignore malformed data */ }
      }
      if (savedBank)   setBank(parseFloat(savedBank));
      if (savedLedger) setLedger(JSON.parse(savedLedger));
      if (savedHist)   setBankHist(JSON.parse(savedHist));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return()=>document.removeEventListener('visibilitychange', onVisibility);
  },[]);

  const toggle=()=>{
    if(running){
      workerRef.current?.postMessage({type:'STOP'});
      setRunning(false); setPhase("idle"); setNextIn(0);
      setFeedLog(p=>[{id:uid(),time:ts(),msg:"Simulation paused",type:"warn"},...p].slice(0,200));
    } else {
      workerRef.current?.postMessage({type:'START'});
      setRunning(true);
      setFeedLog(p=>[
        {id:uid(),time:ts(),msg:"Target: +5–10% ROI | Unit: 2.5% bank | 80% Place + 20% Win",type:"info"},
        {id:uid(),time:ts(),msg:"TRACKWISE started — 80/20 self-learning system active",type:"win"},
        ...p,
      ].slice(0,200));
    }
  };
  const reset=()=>{
    workerRef.current?.postMessage({type:'RESET'});
    setRunning(false);
    setBank(START_BANK); setKB(initKB());
    setTotalRaces(0);
    setLedger([]); setFeedLog([]); setBankHist([{bank:START_BANK,n:0}]);
    setRace(null); setRunners([]); setCurrentBet(null); setNoBetReason("");
    setPhase("idle"); setNextIn(0); setProgPct(0);
    lsClear(LS_KB,LS_LEDGER,LS_BANK,LS_BANKHIST,LS_RACES);
    setSavedFlash(false); setKbLoadedFlash(false);
    setTimeout(()=>setFeedLog([{id:uid(),time:ts(),msg:"System reset — $200 bankroll | Fresh knowledge database",type:"warn"}]),0);
  };

  const stats = useMemo(() => {
    const settled = ledger.filter(b => b.result !== 'PENDING');
    const wins    = settled.filter(b => b.result === 'WIN').length;
    const places  = settled.filter(b => b.result === 'PLACE').length;
    const losses  = settled.filter(b => b.result === 'LOSS').length;
    const totalW  = settled.reduce((a, b) => a + b.totalStake, 0);
    const totalPL = settled.reduce((a, b) => a + (b.pl || 0), 0);
    const roi     = totalW > 0 ? totalPL / totalW * 100 : 0;
    const growth  = (bank - START_BANK) / START_BANK * 100;
    const strike  = settled.length > 0 ? Math.round((wins + places) / settled.length * 100) : 0;
    return { settled, wins, places, losses, totalW, totalPL, roi, growth, strike };
  }, [ledger, bank]);
  const { settled, wins, places, losses, totalW, totalPL, roi, growth, strike } = stats;

  const kbSections = useMemo(() => [
    {title:"BARRIER BANDS",  data:kb.barriers as Record<string,Stat>},
    {title:"SCORE BANDS",    data:kb.scoreBands as Record<string,Stat>},
    {title:"BET TYPES",      data:kb.betTypes as Record<string,Stat>},
    {title:"ODDS RANGES",    data:kb.oddsRanges as Record<string,Stat>},
    {title:"TRACKS",         data:kb.tracks},
    {title:"CONDITIONS",     data:kb.conditions},
  ], [kb]);

  const logColors: Record<string,string> = {win:"text-green-600",place:"text-blue-600",loss:"text-red-500",bet:"text-amber-700",learn:"text-violet-600",warn:"text-amber-500",race:"text-violet-500",info:"text-slate-500"};
  const progColor=phase==="race"?"#7c3aed":phase==="post"?"#16a34a":phase==="pre"?"#d97706":"#0284c7";

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">

      {/* ── Topbar ── */}
      <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center h-13 px-4 gap-0" style={{height:52}}>
          <div className="flex items-center gap-2.5 pr-4 border-r border-slate-200 mr-3" style={{minWidth:155}}>
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-base">🏇</div>
            <div>
              <div className="text-sm font-bold tracking-wider text-slate-900 leading-none">TRACKWISE</div>
              <div className="text-[9px] text-slate-400 tracking-widest mt-1">AU RACING · v2</div>
            </div>
          </div>
          <div className="flex flex-1 h-full">
            {[
              {l:"BANKROLL", v:`$${bank.toFixed(2)}`,                              c:bank>=START_BANK?"text-green-600":"text-red-500"},
              {l:"GROWTH",   v:`${growth>=0?"+":""}${growth.toFixed(1)}%`,         c:growth>=0?"text-green-600":"text-red-500"},
              {l:"P&L",      v:`${totalPL>=0?"+$":"-$"}${Math.abs(totalPL).toFixed(2)}`, c:totalPL>=0?"text-green-600":"text-red-500"},
              {l:"ROI",      v:`${roi>=0?"+":""}${roi.toFixed(1)}%`,               c:roi>=5?"text-green-600":roi>=0?"text-amber-600":"text-red-500"},
              {l:"STRIKE",   v:`${strike}%`,                                       c:"text-blue-600"},
              {l:"W/P/L",    v:`${wins}W ${places}P ${losses}L`,                  c:"text-slate-600"},
              {l:"BETS",     v:settled.length,                                     c:"text-slate-600"},
              {l:"KB VER",      v:`v${kb.version}`,    c:"text-violet-600"},
              {l:"TOTAL RACES", v:totalRaces,          c:"text-slate-500"},
            ].map((s,i)=>(
              <div key={i} className="flex flex-col justify-center px-3 border-r border-slate-100 last:border-r-0">
                <div className="text-[8px] text-slate-400 tracking-widest mb-0.5">{s.l}</div>
                <div className={`text-sm font-bold font-mono leading-none ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-3">
            {kbLoadedFlash && (
              <span className="text-[10px] text-blue-600 font-mono tracking-wide transition-opacity duration-500">
                📦 Loaded
              </span>
            )}
            {savedFlash && (
              <span className="text-[10px] text-green-600 font-mono tracking-wide transition-opacity duration-500">
                💾 Saved
              </span>
            )}
            <PhaseBadge phase={phase}/>
            {phase==="idle"&&running&&nextIn>0 && <span className="text-xs text-slate-400 font-mono">next {nextIn}s</span>}
            <div className="flex items-center border border-slate-200 rounded-md overflow-hidden mr-1">
              {([1, 5, 20] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2 py-1 text-[10px] font-mono font-semibold transition-colors ${
                    speed === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <Button size="sm" onClick={toggle} variant={running?"destructive":"default"} className={running?"":"bg-slate-900 hover:bg-slate-700 text-white"}>
              {running?"■ Stop":"▶ Start"}
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>↺ Reset</Button>
            <div className="flex gap-1 text-[10px] font-mono ml-1">
              <Link to="/recommender" className="px-2 py-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors tracking-wide">RECOMMENDER</Link>
              <Link to="/analysis"    className="px-2 py-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors tracking-wide">ANALYSIS</Link>
            </div>
          </div>
        </div>
        {phase!=="idle"&&(
          <div className="h-0.5 bg-slate-100">
            <div className="h-full transition-all duration-300" style={{width:`${progPct}%`,background:progColor}}/>
          </div>
        )}
      </div>

      {/* ── Main 3-col layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: KB */}
        <div className="w-72 border-r border-slate-200 bg-white flex flex-col overflow-hidden flex-shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
            <span className="text-[9px] font-semibold text-slate-500 tracking-widest">KNOWLEDGE DATABASE</span>
            <Badge variant="outline" className="text-[10px] text-violet-600 border-violet-200">{kb.totalBets} learned</Badge>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              <div>
                <div className="text-[9px] font-semibold text-slate-400 tracking-widest mb-2">ADAPTIVE WEIGHTS</div>
                <div className="space-y-1.5">
                  {Object.entries(kb.weights).map(([k,v])=>(
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-[9px] text-slate-500 w-20 truncate capitalize">{k.replace(/([A-Z])/g," $1")}</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-700 rounded-full transition-all duration-700" style={{width:`${(v/0.40)*100}%`}}/>
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-slate-700 w-7 text-right">{(v*100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <Separator/>
              <div>
                <div className="text-[9px] font-semibold text-slate-400 tracking-widest mb-2">LIVE THRESHOLDS</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    {l:"Min Score",v:kb.thresholds.minScore.toFixed(0)},
                    {l:"Min Odds", v:`$${kb.thresholds.minOdds.toFixed(1)}`},
                    {l:"Max Odds", v:`$${kb.thresholds.maxOdds.toFixed(1)}`},
                    {l:"E/W Min",  v:`$${kb.thresholds.ewOddsMin.toFixed(1)}`},
                  ].map(t=>(
                    <div key={t.l} className="bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
                      <div className="text-[8px] text-amber-700 tracking-wide">{t.l}</div>
                      <div className="text-sm font-bold font-mono text-amber-800 mt-0.5">{t.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <Separator/>
              {kbSections.map(({title,data})=>
                Object.values(data).some(v=>v.b>0)&&(
                  <div key={title}>
                    <div className="text-[9px] font-semibold text-slate-400 tracking-widest mb-1">{title}</div>
                    {Object.entries(data).map(([k,v])=><KBRow key={k} label={k} data={v}/>)}
                  </div>
                )
              )}
            </div>
          </ScrollArea>
        </div>

        {/* CENTRE */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
            {race?(
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <TrackBadge type={race.track.t}/>
                    {race.isWet&&<Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">🌧 Wet</Badge>}
                    <span className="text-xs text-slate-400">{race.track.s}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 leading-none">{race.track.n}</h2>
                  <p className="text-xs text-slate-500 font-mono mt-1">{race.cls} · {race.dist}m · {race.cond.l} · {race.field} runners</p>
                </div>
                <div className="flex gap-4 text-right">
                  <div>
                    <div className="text-[8px] text-slate-400 tracking-widest">UNIT</div>
                    <div className="text-lg font-bold font-mono text-slate-900">${clamp(bank*UNIT_PCT,MIN_UNIT,MAX_UNIT).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-slate-400 tracking-widest">KB</div>
                    <div className="text-lg font-bold font-mono text-violet-600">v{kb.version}</div>
                  </div>
                </div>
              </div>
            ):(
              <div className="flex items-center justify-center py-5 text-slate-400 text-sm">
                {running?"Connecting to live feed…":"Press Start to begin autonomous simulation"}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {runners.length===0?(
              <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-sm gap-2">
                <span className="text-2xl">🐎</span>
                <span>Runners load automatically when feed connects</span>
              </div>
            ):(
              <>
                <div className="grid items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 sticky top-0"
                  style={{gridTemplateColumns:"28px 1fr 54px 58px 58px 96px 52px"}}>
                  {["BAR","RUNNER / JOCKEY","FORM","WIN$","PLC$","SCORE","ACTION"].map(h=>(
                    <div key={h} className="text-[9px] font-semibold text-slate-400 tracking-widest">{h}</div>
                  ))}
                </div>
                {[...runners].sort((a,b)=>b.scores.total-a.scores.total).map(r=>(
                  <RunnerRow key={r.id} r={r} currentBet={currentBet}/>
                ))}
              </>
            )}
          </div>

          <div className="bg-white border-t border-slate-200 px-4 py-2.5 flex-shrink-0">
            {!currentBet&&noBetReason&&(
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <span>⏭</span><span className="font-mono">NO BET — {noBetReason}</span>
              </div>
            )}
            {!currentBet&&!noBetReason&&(
              <div className="text-xs text-slate-400 font-mono">80/20 system · 2.5% unit · Self-learning KB · Target +5–10% ROI</div>
            )}
            {currentBet&&(
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm text-slate-900 truncate">{currentBet.horse}</span>
                    <BetBadge type={currentBet.betType}/>
                    {currentBet.result!=="PENDING"&&<ResultBadge result={currentBet.result}/>}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">Win ${currentBet.winOdds} · Place ${currentBet.placeOdds} · {currentBet.track} · {currentBet.dist}</div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {[
                    {v:`$${currentBet.placeStake.toFixed(2)}`,l:"PLACE 80%",tc:"text-blue-700",  bg:"bg-blue-50",  bc:"border-blue-100"},
                    {v:`$${currentBet.winStake.toFixed(2)}`,  l:"WIN 20%",  tc:"text-green-700", bg:"bg-green-50", bc:"border-green-100"},
                    {v:`$${currentBet.totalStake.toFixed(2)}`,l:"TOTAL",    tc:"text-slate-700", bg:"bg-slate-50", bc:"border-slate-200"},
                  ].map(c=>(
                    <div key={c.l} className={`text-center px-2.5 py-1.5 rounded-md border ${c.bg} ${c.bc}`}>
                      <div className={`text-sm font-bold font-mono ${c.tc}`}>{c.v}</div>
                      <div className="text-[8px] text-slate-400 tracking-wide mt-0.5">{c.l}</div>
                    </div>
                  ))}
                  {currentBet.result!=="PENDING"&&(
                    <div className={`text-center px-2.5 py-1.5 rounded-md border ${currentBet.pl>=0?"bg-green-50 border-green-100":"bg-red-50 border-red-100"}`}>
                      <div className={`text-sm font-bold font-mono ${currentBet.pl>=0?"text-green-700":"text-red-600"}`}>{fmt$(currentBet.pl)}</div>
                      <div className="text-[8px] text-slate-400 tracking-wide mt-0.5">P&L</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="w-80 border-l border-slate-200 bg-white flex flex-col overflow-hidden flex-shrink-0">
          <Tabs defaultValue="chart" className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="rounded-none border-b border-slate-200 h-9 bg-slate-50 w-full justify-start px-1 flex-shrink-0">
              {["chart","ledger","feed"].map(t=>(
                <TabsTrigger key={t} value={t}
                  className="text-[10px] tracking-widest uppercase rounded-none h-full px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-slate-900">
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="chart" className="flex-1 overflow-auto m-0">
              <div className="p-3 border-b border-slate-100">
                <div className="text-[9px] text-slate-400 tracking-widest mb-2">BANKROLL HISTORY</div>
                <Sparkline history={bankHist}/>
                <div className="flex justify-between mt-1 text-[9px] font-mono text-slate-400">
                  <span>Start $200</span>
                  <span className={`font-semibold ${bank>=START_BANK?"text-green-600":"text-red-500"}`}>Now ${bank.toFixed(2)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                {[
                  {l:"P&L",        v:`${totalPL>=0?"+$":"-$"}${Math.abs(totalPL).toFixed(2)}`, c:totalPL>=0?"text-green-600":"text-red-500"},
                  {l:"ROI",        v:`${roi>=0?"+":""}${roi.toFixed(1)}%`,                      c:roi>=5?"text-green-600":roi>=0?"text-amber-600":"text-red-500"},
                  {l:"Growth",     v:`${growth>=0?"+":""}${growth.toFixed(1)}%`,                c:growth>=0?"text-green-600":"text-red-500"},
                  {l:"Strike",     v:`${strike}%`,                                              c:"text-blue-600"},
                  {l:"Wins",       v:wins,       c:"text-green-600"},
                  {l:"Places",     v:places,     c:"text-blue-600"},
                  {l:"Losses",     v:losses,     c:"text-red-500"},
                  {l:"Total Bets", v:settled.length, c:"text-slate-600"},
                  {l:"Wagered",    v:`$${totalW.toFixed(2)}`, c:"text-slate-600"},
                  {l:"Loss Streak",v:kb.consLosses, c:kb.consLosses>3?"text-red-500":"text-slate-600"},
                  {l:"KB Version", v:`v${kb.version}`, c:"text-violet-600"},
                  {l:"Learned",    v:kb.totalBets,    c:"text-violet-600"},
                ].map(s=>(
                  <div key={s.l} className="bg-slate-50 border border-slate-100 rounded-md p-2">
                    <div className="text-[8px] text-slate-400 tracking-widest mb-1">{s.l}</div>
                    <div className={`text-base font-bold font-mono ${s.c}`}>{s.v}</div>
                  </div>
                ))}
              </div>
              <div className="mx-3 mb-3 p-3 bg-slate-50 border border-slate-100 rounded-md">
                <div className="text-[9px] text-slate-400 tracking-widest mb-2">SYSTEM RULES</div>
                {[
                  "Unit: 2.5% bank · min $2 · max $25",
                  "80% Place + 20% Win every bet",
                  `Score ≥${kb.thresholds.minScore.toFixed(0)} · Odds $${kb.thresholds.minOdds.toFixed(1)}–$${kb.thresholds.maxOdds.toFixed(1)}`,
                  "Loss streak ≥4 → +8 score required",
                  "Weights recalibrate every 10 bets",
                ].map((rule,i)=>(
                  <div key={i} className="text-[10px] font-mono text-slate-500 mb-1">{rule}</div>
                ))}
                <div className="text-[10px] font-mono text-green-600 font-semibold mt-2">Target: +5–10% ROI minimum</div>
              </div>
            </TabsContent>

            <TabsContent value="ledger" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full">
                {ledger.length===0?(
                  <div className="flex flex-col items-center justify-center h-28 text-slate-400 text-xs gap-2">
                    <span>📋</span><span>Bets appear here automatically</span>
                  </div>
                ):ledger.map(b=>(
                  <div key={b.id} className="px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-slate-800">{b.horse}</span>
                      <span className={`font-bold font-mono text-sm ${b.pl==null?"text-slate-400":b.pl>=0?"text-green-600":"text-red-500"}`}>
                        {b.pl==null?"—":fmt$(b.pl)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mb-1.5">{b.track} · {b.cls} · {b.dist}</div>
                    <div className="flex flex-wrap gap-1">
                      <ResultBadge result={b.result}/>
                      <BetBadge type={b.betType}/>
                      <Badge variant="outline" className="text-[9px] h-5">${b.totalStake.toFixed(2)}</Badge>
                      <Badge variant="outline" className="text-[9px] h-5 text-green-700 border-green-200">@${b.winOdds}</Badge>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="feed" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full">
                {feedLog.length===0?(
                  <div className="flex flex-col items-center justify-center h-28 text-slate-400 text-xs gap-2">
                    <span>📡</span><span>Live feed activates on Start</span>
                  </div>
                ):feedLog.map(item=>(
                  <div key={item.id} className="px-3 py-2 border-b border-slate-50">
                    <div className="text-[8px] text-slate-300 font-mono">{item.time}</div>
                    <div className={`text-[10px] font-mono mt-0.5 leading-relaxed ${logColors[item.type]||"text-slate-500"}`}>{item.msg}</div>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
