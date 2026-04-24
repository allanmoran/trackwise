import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiFetch } from '@/lib/fetch'
import { debug } from '@/lib/debug'

// ── types ────────────────────────────────────────────────────────────────────
interface PerfRow {
  label: string; bets: number; wins: number; places: number;
  winStrike: number; placeStrike: number; roi: number;
  staked: number; returned: number;
}
interface Results {
  meta: {
    totalRaces: number; totalBets: number; noBets: number;
    startedAt: string; lastUpdated: string;
  };
  bankroll: {
    start: number; current: number; peak: number; trough: number;
    totalPL: number; maxDrawdown: number; history: number[];
  };
  kb: any;
  bets: any[];
  performance: {
    summary: {
      totalRaces: number; totalBets: number; noBets: number;
      wins: number; places: number; losses: number;
      winStrike: number; placeStrike: number; roi: number;
      totalStaked: number; growth: number; maxDrawdown: number;
    };
    byTrack: PerfRow[]; byCondition: PerfRow[]; byOddsRange: PerfRow[];
    byBetType: PerfRow[]; byScoreBand: PerfRow[]; byBarrier: PerfRow[];
    byDistance: PerfRow[]; byFieldSize: PerfRow[];
    roiCurve: { race: number; roi: number; bank: number }[];
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function roiColor(roi: number) {
  return roi >= 5 ? 'text-green-600' : roi >= 0 ? 'text-amber-600' : 'text-red-500';
}

// Sample array to max N points
function sample<T>(arr: T[], maxPts: number): T[] {
  if (arr.length <= maxPts) return arr;
  const step = Math.ceil(arr.length / maxPts);
  return arr.filter((_, i) => i % step === 0);
}

// ── PerfTable ─────────────────────────────────────────────────────────────────
function PerfTable({ rows }: { rows: PerfRow[] }) {
  if (!rows?.length) return <div className="text-xs text-slate-400 p-4">No data yet</div>;
  return (
    <div className="text-xs">
      <div className="grid grid-cols-7 gap-1 px-3 py-1.5 bg-slate-50 border-b border-slate-200 font-semibold text-[9px] text-slate-400 tracking-widest sticky top-0">
        {['LABEL','BETS','WIN%','PLACE%','ROI','STAKED','RETURN'].map(h => (
          <div key={h}>{h}</div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} className={`grid grid-cols-7 gap-1 px-3 py-2 border-b border-slate-50 hover:bg-slate-50 items-center`}>
          <div className="font-mono font-semibold text-slate-700 truncate">{r.label}</div>
          <div className="font-mono text-slate-500">{r.bets.toLocaleString()}</div>
          <div className="font-mono text-slate-500">{r.winStrike}%</div>
          <div className="font-mono text-slate-500">{r.placeStrike}%</div>
          <div className={`font-mono font-bold ${roiColor(r.roi)}`}>{r.roi >= 0 ? '+' : ''}{r.roi}%</div>
          <div className="font-mono text-slate-400">${r.staked.toFixed(0)}</div>
          <div className="font-mono text-slate-400">${r.returned.toFixed(0)}</div>
        </div>
      ))}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color = 'text-slate-800' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-lg p-3 shadow-sm">
      <div className="text-[8px] text-slate-400 tracking-widest mb-1">{label}</div>
      <div className={`text-base font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function Analysis() {
  const [data,     setData]     = useState<Results | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [lastSeen, setLastSeen] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const json: Results = await apiFetch(`/data/results.json?t=${Date.now()}`);
      setData(json);
      setError('');
      setLastSeen(json.meta.lastUpdated);
    } catch (err) {
      debug.error('Failed to fetch analysis data:', err);
      setError('no-data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // suppress unused warning — lastSeen is used implicitly via state
  void lastSeen;

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-400 font-mono text-sm">Loading analysis…</div>
    </div>
  );

  if (error || !data) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
      <div className="text-4xl">📊</div>
      <div className="text-slate-700 font-bold text-lg">No analysis data yet</div>
      <div className="text-slate-500 text-sm font-mono bg-white border border-slate-200 rounded-lg px-4 py-3">
        Run: <span className="text-violet-600 font-bold">npm run engine</span>
      </div>
      <div className="text-slate-400 text-xs">Let it run for a few minutes, then refresh this page</div>
      <Link to="/" className="text-sm text-blue-600 hover:underline mt-2">← Back to live dashboard</Link>
    </div>
  );

  const { meta, bankroll, performance, bets } = data;
  const { summary } = performance;

  // bankroll chart data (sampled)
  const bankChartData = sample(
    bankroll.history.map((b, i) => ({ i, bank: b })),
    400
  );

  // ROI curve data
  const roiChartData = performance.roiCurve;

  // Best/worst bets
  const sortedBets = [...bets].sort((a, b) => (b.pl ?? 0) - (a.pl ?? 0));
  const bestBets  = sortedBets.slice(0, 20);
  const worstBets = sortedBets.slice(-20).reverse();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-base">📊</div>
            <div>
              <div className="text-sm font-bold tracking-wider text-slate-900">TRACKWISE ANALYSIS</div>
              <div className="text-[9px] text-slate-400 tracking-widest">
                {meta.totalRaces.toLocaleString()} races · last updated {new Date(meta.lastUpdated).toLocaleTimeString()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`font-mono ${roiColor(summary.roi)}`}>
              ROI {summary.roi >= 0 ? '+' : ''}{summary.roi}%
            </Badge>
            <div className="flex gap-1 text-[11px] font-mono">
              <Link to="/"            className="px-2 py-1 rounded text-slate-500 hover:text-slate-800 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">SIMULATION</Link>
              <Link to="/recommender" className="px-2 py-1 rounded text-slate-500 hover:text-slate-800 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">RECOMMENDER</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-6">

        {/* Summary stat grid */}
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
          <StatCard label="TOTAL RACES"  value={meta.totalRaces.toLocaleString()} />
          <StatCard label="TOTAL BETS"   value={meta.totalBets.toLocaleString()} />
          <StatCard label="NO BET"        value={meta.noBets.toLocaleString()} />
          <StatCard label="WIN STRIKE"   value={`${summary.winStrike}%`}   color="text-green-600" />
          <StatCard label="PLACE STRIKE" value={`${summary.placeStrike}%`} color="text-blue-600" />
          <StatCard label="ROI"           value={`${summary.roi >= 0 ? '+' : ''}${summary.roi}%`} color={roiColor(summary.roi)} />
          <StatCard label="GROWTH"        value={`${summary.growth >= 0 ? '+' : ''}${summary.growth}%`} color={summary.growth >= 0 ? 'text-green-600' : 'text-red-500'} />
          <StatCard label="CURRENT BANK" value={`$${bankroll.current.toFixed(2)}`} color={bankroll.current >= bankroll.start ? 'text-green-600' : 'text-red-500'} />
          <StatCard label="PEAK BANK"    value={`$${bankroll.peak.toFixed(2)}`}    color="text-green-600" />
          <StatCard label="MAX DRAWDOWN" value={`-$${bankroll.maxDrawdown.toFixed(2)}`} color="text-red-500" />
          <StatCard label="KB VERSION"   value={`v${data.kb?.version ?? '?'}`}     color="text-violet-600" />
          <StatCard label="WAGERED"      value={`$${summary.totalStaked.toFixed(0)}`} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Bankroll curve */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[9px] font-semibold text-slate-400 tracking-widest mb-3">BANKROLL HISTORY</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={bankChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="i" tick={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} width={56} />
                <Tooltip formatter={(v: any) => [`$${(v as number).toFixed(2)}`, 'Bank']} labelFormatter={() => ''} />
                <ReferenceLine y={bankroll.start} stroke="#cbd5e1" strokeDasharray="4 2" />
                <Line type="monotone" dataKey="bank" dot={false} stroke="#16a34a" strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ROI over time */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[9px] font-semibold text-slate-400 tracking-widest mb-3">ROI OVER TIME (every 500 races)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={roiChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="race" tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} width={44} />
                <Tooltip formatter={(v: any) => [`${(v as number).toFixed(1)}%`, 'ROI']} />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
                <ReferenceLine y={5} stroke="#16a34a" strokeDasharray="4 2" label={{ value: 'target', position: 'right', fontSize: 9, fill: '#16a34a' }} />
                <Line type="monotone" dataKey="roi" dot={false} stroke="#7c3aed" strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance breakdown tabs */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <Tabs defaultValue="track">
            <div className="border-b border-slate-200 bg-slate-50 px-1">
              <TabsList className="rounded-none bg-transparent h-9 gap-0">
                {['track','condition','odds','bettype','score','barrier','distance','fieldsize'].map(t => (
                  <TabsTrigger key={t} value={t}
                    className="text-[9px] tracking-widest uppercase rounded-none px-3 h-full data-[state=active]:border-b-2 data-[state=active]:border-slate-900 data-[state=active]:shadow-none data-[state=active]:bg-transparent">
                    {t === 'bettype' ? 'BET TYPE' : t === 'fieldsize' ? 'FIELD' : t.toUpperCase()}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <ScrollArea className="h-64">
              <TabsContent value="track"     className="m-0"><PerfTable rows={performance.byTrack} /></TabsContent>
              <TabsContent value="condition" className="m-0"><PerfTable rows={performance.byCondition} /></TabsContent>
              <TabsContent value="odds"      className="m-0"><PerfTable rows={performance.byOddsRange} /></TabsContent>
              <TabsContent value="bettype"   className="m-0"><PerfTable rows={performance.byBetType} /></TabsContent>
              <TabsContent value="score"     className="m-0"><PerfTable rows={performance.byScoreBand} /></TabsContent>
              <TabsContent value="barrier"   className="m-0"><PerfTable rows={performance.byBarrier} /></TabsContent>
              <TabsContent value="distance"  className="m-0"><PerfTable rows={performance.byDistance} /></TabsContent>
              <TabsContent value="fieldsize" className="m-0"><PerfTable rows={performance.byFieldSize} /></TabsContent>
            </ScrollArea>
          </Tabs>
        </div>

        {/* ROI bar chart — by odds range */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[9px] font-semibold text-slate-400 tracking-widest mb-3">ROI BY ODDS RANGE</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={performance.byOddsRange} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} width={40} />
                <Tooltip formatter={(v: any) => [`${(v as number).toFixed(1)}%`, 'ROI']} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="roi" fill="#7c3aed" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[9px] font-semibold text-slate-400 tracking-widest mb-3">ROI BY SCORE BAND</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={performance.byScoreBand} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} width={40} />
                <Tooltip formatter={(v: any) => [`${(v as number).toFixed(1)}%`, 'ROI']} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="roi" fill="#0284c7" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Best & worst bets */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { title: 'BEST 20 BETS', items: bestBets, positive: true },
            { title: 'WORST 20 BETS', items: worstBets, positive: false },
          ].map(({ title, items }) => (
            <div key={title} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="text-[9px] font-semibold text-slate-400 tracking-widest px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                {title}
              </div>
              <ScrollArea className="h-64">
                {items.map((b, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-slate-50 hover:bg-slate-50 text-xs">
                    <div>
                      <div className="font-semibold text-slate-800">{b.horse}</div>
                      <div className="text-[9px] text-slate-400 font-mono mt-0.5">{b.track} · {b.condition} · @${b.winOdds}</div>
                    </div>
                    <div className={`font-bold font-mono text-sm ${(b.pl ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {(b.pl ?? 0) >= 0 ? '+$' : '-$'}{Math.abs(b.pl ?? 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </div>
          ))}
        </div>

        {/* KB weights */}
        {data.kb?.weights && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[9px] font-semibold text-slate-400 tracking-widest mb-3">CURRENT KB WEIGHTS (after {data.kb.totalBets?.toLocaleString()} bets)</div>
            <div className="space-y-2">
              {Object.entries(data.kb.weights as Record<string, number>).map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-28 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-700 rounded-full" style={{ width: `${(v / 0.40) * 100}%` }} />
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700 w-10 text-right">{(v * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
