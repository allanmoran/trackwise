import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';
import { TrendingUpRounded, CheckCircleRounded, DownloadRounded, RefreshRounded } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch, apiPost } from '@/lib/fetch';
import { API_ENDPOINTS, API_BASE } from '@/config/api';
import { debug } from '@/lib/debug';
import type { Bet } from '@/types';

interface DashboardStats {
  bank: number;
  totalBetsPlaced?: number;
  totalWins?: number;
  totalPlaces?: number;
  totalLosses?: number;
  cumulativePnL: number;
  roi: number;
  winRate?: number;
  totalBets: number;
  betsWithResult: number;
  totalStaked: number;
  betsWithEdge: number;
  edgeFoundPercent: number;
  avgEvPercent: number;
  evValidationPercent: number;
  targetRoi: number;
  status: string;
}

const DailyPicksComponent: React.FC = () => {
  const [picks, setPicks] = useState<Bet[]>([]);
  const [placedBets, setPlacedBets] = useState<Bet[]>([]);
  const [activeBets, setActiveBets] = useState<Bet[]>([]);
  const [archiveBets, setArchiveBets] = useState<Bet[]>([]);
  const [betTab, setBetTab] = useState<'active' | 'archive' | 'summary' | 'results'>('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [resultDialog, setResultDialog] = useState(false);
  const [selectedBet, setSelectedBet] = useState<Bet | null>(null);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<{ updated: number; total: number } | null>(null);
  const [, setScrapeJobId] = useState<string | null>(null);
  const [scrapeResult, setScrapeResult] = useState<{ track: string; raceNum: number; resultsCount: number; betsMarked: number } | null>(null);
  const [historyData, setHistoryData] = useState<{ date: string; pnl: number }[]>([]);
  // Results entry form state
  const [resultTrack, setResultTrack] = useState('');
  const [resultRaceNum, setResultRaceNum] = useState('');
  const [resultTable, setResultTable] = useState('');
  const [submittingResults, setSubmittingResults] = useState(false);

  // Load dashboard and bets on mount
  useEffect(() => {
    loadDashboard();
    loadActiveBets();
    loadArchiveBets();
    loadHistoricalData();
  }, []);

  // Auto-clear success/error messages after 5 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const loadDashboard = async () => {
    try {
      const data = await apiFetch<DashboardStats>(API_ENDPOINTS.dashboard);
      setDashboard(data);
    } catch (err) {
      debug.error('Failed to load dashboard', err);
    }
  };

  const loadActiveBets = async () => {
    try {
      const data = await apiFetch<{ success: boolean; bets: any[] }>(API_ENDPOINTS.betsActive);
      if (data.success) {
        const betsWithCalcs: Bet[] = data.bets.map((b: any) => ({
          id: b.id,
          track: b.track,
          raceNum: b.race_num,
          raceTime: b.race_time,
          horse: b.horse,
          jockey: b.jockey || 'Unknown',
          trainer: b.trainer || 'Unknown',
          odds: parseFloat(b.odds) || 0,
          confidence: b.confidence || 0,
          predictedOdds: calculatePredictedOdds(b.confidence || 0),
          kellyStak: parseFloat(b.stake) || 0,
          placed: true,
          sourceUrl: b.source_url,
        }));
        setActiveBets(betsWithCalcs);
      }
    } catch (err) {
      debug.error('Failed to load active bets', err);
    }
  };

  const loadArchiveBets = async () => {
    try {
      const data = await apiFetch<{ success: boolean; bets: any[] }>(API_ENDPOINTS.betsArchive);
      if (data.success) {
        const betsWithCalcs: Bet[] = data.bets.map((b: any) => ({
          id: b.id,
          track: b.track,
          raceNum: b.race_num,
          raceTime: b.race_time,
          horse: b.horse,
          jockey: b.jockey || 'Unknown',
          trainer: b.trainer || 'Unknown',
          odds: parseFloat(b.odds) || 0,
          confidence: b.confidence || 0,
          predictedOdds: calculatePredictedOdds(b.confidence || 0),
          kellyStak: parseFloat(b.stake) || 0,
          placed: true,
          result: b.result as 'WIN' | 'PLACE' | 'LOSS' | undefined,
          pnl: parseFloat(b.pnl) || 0,
        }));
        setArchiveBets(betsWithCalcs);
      }
    } catch (err) {
      debug.error('Failed to load archive bets', err);
    }
  };

  const loadHistoricalData = async () => {
    try {
      const data = await apiFetch<{ success: boolean; history: { date: string; pnl: number }[] }>(API_ENDPOINTS.historicalPnL);
      if (data.success && data.history) {
        setHistoryData(data.history);
      }
    } catch (err) {
      debug.error('Failed to load historical data', err);
    }
  };

  const loadTodayRaces = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE}/api/results/load-todays-races`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (data.success) {
        // Reload dashboard to get latest stats
        await loadDashboard();

        // Get latest dashboard stats for display
        const dashData = await apiFetch<DashboardStats>(API_ENDPOINTS.dashboard);
        const evPercent = Math.round(dashData.evValidationPercent || 0);
        const message = `✓ ${dashData.totalBets} bets tracked | ${dashData.betsWithResult} results marked | EV validation: ${evPercent}% accurate`;
        setSuccess(message);
        // Don't auto-populate textarea - races are now in database
      } else {
        setError(`Failed to load races: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Error loading races: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const submitResults = async () => {
    setSubmittingResults(true);
    setError('');
    setSuccess('');

    try {
      if (!resultTrack.trim() || !resultRaceNum.trim() || !resultTable.trim()) {
        setError('Fill in Track, Race #, and Results');
        setSubmittingResults(false);
        return;
      }

      // Parse results from racing.com or any format
      const text = resultTable;
      const results: Array<{ track: string; raceNum: number; horse: string; result: 'WIN' | 'PLACE' | 'LOSS' }> = [];

      // Split by position markers (1st, 2nd, 3rd, etc.)
      const positionBlocks = text.split(/(?=(?:1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b)/i);

      positionBlocks.forEach((block) => {
        if (!block.trim()) return;

        // Extract position (1st, 2nd, etc.)
        const posMatch = block.match(/^(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b/i);
        if (!posMatch) return;

        const posStr = posMatch[1].toLowerCase();
        let position = 1;
        if (posStr === '1st') position = 1;
        else if (posStr === '2nd') position = 2;
        else if (posStr === '3rd') position = 3;
        else position = parseInt(posStr) || 1;

        // Extract horse name from the block
        // racing.com format: "1st\n\n8. White Hot Mama (2)"
        let horseName = '';

        // Pattern 1: "N. Horse Name" (racing.com format - includes apostrophes, hyphens)
        const numDotMatch = block.match(/\n\s*\d+\.\s+([A-Za-z\s\-']+?)(?:\s*\(|\s*$|\n)/);
        if (numDotMatch) {
          horseName = numDotMatch[1].trim();
        }

        // Pattern 2: Simple "Horse Name" after position on same line
        if (!horseName) {
          const simpleMatch = block.match(/^(?:1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s+([A-Za-z\s\-']+?)(?:\s*\(|\s*$)/i);
          if (simpleMatch) {
            horseName = simpleMatch[1].trim();
          }
        }

        // Pattern 3: First horse-like name in block (with apostrophes/hyphens)
        if (!horseName) {
          const anyMatch = block.match(/([A-Z][a-z\-']+(?:\s+[A-Z][a-z\-']+)*)/);
          if (anyMatch) {
            horseName = anyMatch[1].trim();
          }
        }

        // Clean horse name
        horseName = horseName
          .replace(/\([^)]*\)/g, '') // Remove parentheses
          .replace(/\s+/g, ' ') // Normalize spaces
          .trim();

        // Determine result
        const result: 'WIN' | 'PLACE' | 'LOSS' = position === 1 ? 'WIN' : position <= 3 ? 'PLACE' : 'LOSS';

        if (horseName && horseName.length > 2 && !horseName.match(/^[T|J|C]:/)) { // Avoid trainer/jockey lines
          results.push({
            track: resultTrack.trim(),
            raceNum: parseInt(resultRaceNum),
            horse: horseName,
            result,
          });
        }
      });

      if (results.length === 0) {
        setError('No horses parsed. Check format and try again.');
        setSubmittingResults(false);
        return;
      }

      // Submit results
      try {
        const data = await apiPost<{ success: boolean; marked?: number; error?: string }>(
          API_ENDPOINTS.resultsMarkKelly,
          { results }
        );

        if (data.success) {
          setSuccess(`✓ Parsed ${results.length} horses. Updated ${data.marked || 0} bets.`);
          // Clear form
          setResultTrack('');
          setResultRaceNum('');
          setResultTable('');
          // Reload active bets to refresh display
          await loadActiveBets();
          await loadDashboard();
        } else {
          setError(`Failed to submit: ${data.error || 'Unknown error'}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`Error: ${errorMsg}`);
      }
    } finally {
      setSubmittingResults(false);
    }
  };

  const runTradingStrategy = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Step 1: Extract race URLs from Sportsbet
      setSuccess('📡 Extracting race URLs from Sportsbet...');
      const extractResponse = await fetch(`${API_BASE}/api/form-scraper/extract-urls`);
      const extractData = await extractResponse.json();

      if (!extractData.success || !extractData.urls || extractData.urls.length === 0) {
        setError('Failed to extract race URLs');
        setLoading(false);
        return;
      }

      setSuccess(`✓ Found ${extractData.urls.length} race URLs. Now loading runners...`);

      // Step 2: Batch load races with runners
      const batchResponse = await fetch(`${API_BASE}/api/form-scraper/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: extractData.urls.map((u: any) => u.url),
          autoBet: false
        })
      });
      const batchData = await batchResponse.json();

      if (!batchData.success) {
        setError(`Failed to load races: ${batchData.error || 'Unknown error'}`);
        setLoading(false);
        return;
      }

      setSuccess(`✓ Loaded ${batchData.successCount} races. Generating picks...`);

      // Step 3: Get today's races with runners from form scraper
      const racesResponse = await fetch(`${API_BASE}/api/form-scraper/today`);
      const racesData = await racesResponse.json();

      if (!racesData.success || !racesData.races || racesData.races.length === 0) {
        setError('No races available. Check back when races are scheduled.');
        setLoading(false);
        return;
      }

      const allPicks: Bet[] = [];
      const bankToUse = dashboard?.bank || 200;
      const racesLoaded = racesData.races;
      let totalEVFiltered = 0;

      // Generate picks from loaded races using form guide recommendations
      const pickPromises = racesLoaded.map(async (race: any) => {
        try {
          // Call recommender to get picks for this race
          const response = await fetch(`${API_BASE}/api/races/${race.id}/picks`);
          if (response.ok) {
            const data = await response.json();
            // Track EV filtering stats
            if (data.stats?.filtered) {
              totalEVFiltered += data.stats.filtered;
            }
            return data.picks || [];
          }
        } catch (err) {
          // If individual race picks endpoint doesn't exist, skip
        }
        return [];
      });

      const pickResults = await Promise.allSettled(pickPromises);

      for (const result of pickResults) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          result.value.forEach((p: any) => {
            const predictedOdds = calculatePredictedOdds(p.confidence);
            const stake = calculateKellyStake(p.confidence, p.odds || 0, bankToUse);

            allPicks.push({
              id: `${p.track}-${p.raceNum}-${Math.random()}`,
              track: p.track,
              raceNum: p.raceNum,
              raceTime: p.raceTime,
              horse: p.horse,
              jockey: p.jockey || 'Unknown',
              trainer: p.trainer || 'Unknown',
              odds: p.odds || 0,
              confidence: p.confidence,
              predictedOdds,
              kellyStak: stake,
              placed: false,
              sourceUrl: '',
            });
          });
        }
      }

      // If no picks generated from today's races, that's expected - races may not have runners yet
      if (allPicks.length === 0) {
        setSuccess('No picks qualified from loaded races (low EV or missing data). Try running again later.');
        setPicks([]);
        setLoading(false);
        return;
      }

      if (allPicks.length > 0) {
        // Sort by confidence (highest first)
        allPicks.sort((a, b) => b.confidence - a.confidence);

        // STRATEGY V2: Apply core filters for 10%+ ROI
        const MIN_CONFIDENCE = 75;
        const MAX_ODDS = 7.0;
        const BLACKLIST_JOCKEYS = ['Julia Martin', 'Kevin Mahoney'];
        const BLACKLIST_TRAINERS = ['Aidan Holt'];

        const filteredPicks = allPicks.filter(pick => {
          if (pick.confidence < MIN_CONFIDENCE) return false;
          if (pick.odds > MAX_ODDS) return false;
          if (BLACKLIST_JOCKEYS.includes(pick.jockey)) return false;
          if (BLACKLIST_TRAINERS.includes(pick.trainer)) return false;
          return true;
        });

        const topPicks = filteredPicks.length > 0 ? filteredPicks : allPicks.slice(0, 10);

        setPicks(topPicks);

        const filterStats = filteredPicks.length > 0
          ? `✅ STRATEGY V2: ${filteredPicks.length} qualified (${allPicks.length - filteredPicks.length} filtered) - placing ${filteredPicks.length} bets...`
          : `⚠️ No bets met strict filters (Conf≥75%, Odds≤7.0). Showing top picks instead.`;

        const evFilterInfo = totalEVFiltered > 0
          ? ` | 📊 EV Filter: ${totalEVFiltered} picks rejected (insufficient edge <5%)`
          : '';

        setSuccess(
          `Generated ${allPicks.length} picks from ${racesLoaded.length} races${evFilterInfo}. ${filterStats}`
        );

        // Auto-place bets immediately after generation
        await doPlaceBets(topPicks);
      } else {
        setError(`Could not generate picks from loaded races`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate picks');
    } finally {
      setLoading(false);
    }
  };

  const calculatePredictedOdds = (confidence: number): number => {
    // Convert confidence % to predicted odds
    // 50% confidence = 2.00 odds, 70% = 1.43 odds, etc.
    const prob = confidence / 100;
    return Math.max(1.01, 1 / prob);
  };

  const calculateKellyStake = (confidence: number, odds: number, bank: number): number => {
    // Validate inputs
    if (!confidence || confidence <= 0 || confidence > 100) return 0;
    if (!odds || odds < 1.01) return 0;
    if (!bank || bank <= 0) return 0;

    // Kelly Criterion: f = (bp - q) / b
    // where f = fraction of bankroll, b = odds-1, p = prob win, q = prob lose
    const p = confidence / 100; // Convert % to decimal
    const b = odds - 1;
    const q = 1 - p;

    // Calculate edge (should be positive)
    const edge = (p * odds) - 1;
    if (edge <= 0) return 0; // No positive edge

    // Full Kelly percentage
    const kellyFraction = (b * p - q) / b;
    if (kellyFraction <= 0) return 0;

    // Apply 0.25 multiplier (quarter Kelly) for conservative, sustainable betting
    const kellyMultiplier = 0.25;
    const stakePercent = kellyFraction * kellyMultiplier;
    const stake = bank * stakePercent;

    // Round to cents
    return Math.round(stake * 100) / 100;
  };

  const calculateEV = (predictedOdds: number, closingOdds: number): number => {
    if (!closingOdds || closingOdds <= predictedOdds) return 0;
    const predictedProb = 1 / predictedOdds;
    const marketProb = 1 / closingOdds;
    return ((predictedProb - marketProb) / marketProb) * 100;
  };

  const calculateCLV = (openingOdds: number, closingOdds: number): number => {
    // CLV = (implied_prob_from_closing × opening_odds) − 1
    // Example: opening 5.0, closing 4.0, conf 77%
    // Closing implies prob = 1/4.0 = 0.25
    // CLV = (0.25 × 5.0) - 1 = 0.25 = +25% value
    const closingImpliedProb = 1 / closingOdds;
    return (closingImpliedProb * openingOdds) - 1;
  };

  const doPlaceBets = async (betsToPlace: Bet[]) => {
    if (betsToPlace.length === 0) return;

    try {
      const today = new Date().toISOString().split('T')[0];

      // Step 1: Fetch TAB odds to validate CLV before placing
      const racesToFetch = [...new Set(betsToPlace.map(p => ({ track: p.track, raceNum: p.raceNum })))];
      debug.log(`[CLV] Fetching TAB odds for ${racesToFetch.length} races to validate picks...`);

      let tabOddsData: any = null;
      try {
        tabOddsData = await apiPost<{ success: boolean; odds?: any }>(
          API_ENDPOINTS.oddsBatch,
          { races: racesToFetch },
          { timeoutMs: 15000 }
        );
        if (tabOddsData.success) {
          debug.log('[CLV] Market odds loaded from Racing API');
        }
      } catch (err) {
        debug.warn('[CLV] Market odds fetch failed, proceeding without CLV filter', err);
      }

      // Step 2: Filter bets by CLV - only place if closing odds (TAB) < opening odds (Sportsbet)
      let placedBetsCount = 0;
      let skippedBetsCount = 0;
      const clvValidationResults: { horse: string; clv: number; placed: boolean }[] = [];

      for (const pick of betsToPlace) {
        // Get TAB closing odds
        const raceKey = `${pick.track}-R${pick.raceNum}`;
        let tabOdds: number | null = null;

        if (tabOddsData?.odds?.[raceKey]) {
          const raceData = tabOddsData.odds[raceKey];
          if (raceData.runners) {
            const horseData = raceData.runners.find((r: any) =>
              r.name?.toLowerCase() === pick.horse.toLowerCase()
            );
            if (horseData?.price?.decimal) {
              tabOdds = horseData.price.decimal;
            }
          }
        }

        // Calculate CLV: if TAB odds < Sportsbet odds, we got value
        let clv = 0;
        let shouldPlace = true;

        if (tabOdds && tabOdds > 0) {
          clv = calculateCLV(pick.odds, tabOdds);
          // Phase 1: Only place bets where market validates (closing shorter = confidence)
          shouldPlace = tabOdds < pick.odds; // TAB < Sportsbet = market backing pick
          clvValidationResults.push({
            horse: pick.horse,
            clv: Number((clv * 100).toFixed(2)), // Convert to %
            placed: shouldPlace,
          });

          debug.log(`[CLV] ${pick.horse}: Opening ${pick.odds.toFixed(2)} → Closing ${tabOdds.toFixed(2)} = ${clv > 0 ? '+' : ''}${(clv * 100).toFixed(1)}% CLV ${shouldPlace ? '✓ PLACE' : '✗ SKIP'}`);
        } else {
          // No TAB odds available, place bet anyway
          shouldPlace = true;
          clvValidationResults.push({
            horse: pick.horse,
            clv: 0,
            placed: true,
          });
          debug.log(`[CLV] ${pick.horse}: No TAB odds, placing anyway`);
        }

        if (shouldPlace) {
          placedBetsCount++;
          const closingOdds = tabOdds || pick.odds;

          // Save to active bets table
          try {
            await apiPost(API_ENDPOINTS.betsSportsbet, {
              track: pick.track,
              raceNum: pick.raceNum,
              horse: pick.horse,
              jockey: pick.jockey,
              trainer: pick.trainer,
              odds: pick.odds,
              stake: pick.kellyStak,
              confidence: pick.confidence,
              raceTime: pick.raceTime,
              sourceUrl: pick.sourceUrl,
              opening_odds: pick.odds,
              closing_odds: closingOdds,
            });
          } catch (err) {
            debug.error('Failed to save bet', err);
          }

          // Calculate CLV for logging
          const clv = calculateCLV(pick.odds, closingOdds);

          // Log with CLV tracking
          try {
            await apiPost(API_ENDPOINTS.kellyLog, {
              date: today,
              track: pick.track,
              raceNum: pick.raceNum,
              horseName: pick.horse,
              jockey: pick.jockey,
              trainer: pick.trainer,
              predictedOdds: pick.predictedOdds,
              closingOdds: closingOdds,
              kellyStake: pick.kellyStak,
              confidence: pick.confidence,
              opening_odds: pick.odds,
              clv_percent: Number((clv * 100).toFixed(2)),
              closing_odds_source: tabOdds ? 'racenet' : 'sportsbet',
            });
          } catch (err) {
            debug.error('Failed to log kelly stake', err);
          }
        } else {
          skippedBetsCount++;
        }
      }

      // Update bank with only placed bets
      const totalStaked = betsToPlace
        .filter((_, i) => clvValidationResults[i]?.placed)
        .reduce((sum, p) => sum + p.kellyStak, 0);
      const currentBank = dashboard?.bank || 200;
      const newBank = Math.max(0, currentBank - totalStaked);

      try {
        await apiPost(API_ENDPOINTS.sessionBank, {
          bank: newBank,
          totalStaked: totalStaked,
        });
      } catch (err) {
        debug.error('Failed to update bank', err);
      }

      // Mark placed bets
      const updatedPicks = betsToPlace.map((p, i) => ({
        ...p,
        placed: clvValidationResults[i]?.placed ?? false,
      }));
      setPlacedBets(updatedPicks.filter(p => p.placed));

      // Show CLV validation results
      const clvSummary = clvValidationResults
        .filter(r => r.clv !== 0)
        .map(r => `${r.horse} ${r.clv > 0 ? '+' : ''}${r.clv}%`)
        .join(', ');

      setSuccess(
        `✓ CLV Validation: Placed ${placedBetsCount}/${betsToPlace.length} bets. ` +
        `${skippedBetsCount} skipped (no market backing). ` +
        (clvSummary ? `CLV: ${clvSummary}` : 'No CLV data available')
      );

      // Wait a moment for backend to process, then reload all data
      await new Promise(r => setTimeout(r, 1000));
      await loadDashboard();
      await loadActiveBets();
      await loadArchiveBets();
    } catch (err) {
      setError('Failed to place bets');
      debug.error('doPlaceBets error', err);
    }
  };

  const placeAllBets = async () => {
    if (picks.length === 0) return;
    await doPlaceBets(picks);
  };

  const submitResult = async () => {
    if (!selectedBet || !selectedBet.result) return;

    try {
      const pnl = calculatePnL(selectedBet);

      // Mark result and update KB
      try {
        await apiPost(API_ENDPOINTS.betsMarkResult, {
          betId: selectedBet.id,
          result: selectedBet.result,
        });
      } catch (err) {
        debug.error('Failed to mark result', err);
      }

      // Also log the old way for backwards compatibility
      try {
        await apiPost(API_ENDPOINTS.betsResult, {
          betId: selectedBet.id,
          horseName: selectedBet.horse,
          jockey: selectedBet.jockey,
          trainer: selectedBet.trainer,
          result: selectedBet.result,
          pnl,
          stakeAmount: selectedBet.kellyStak,
        });
      } catch (err) {
        debug.error('Failed to log result', err);
      }

      // Update placed bets display
      const updatedBets = placedBets.map(b =>
        b.id === selectedBet.id ? { ...b, result: selectedBet.result, pnl } : b
      );
      setPlacedBets(updatedBets);
      setResultDialog(false);
      setSelectedBet(null);
      setSuccess('✓ Result recorded and KB updated');
      await loadDashboard();
      await loadActiveBets();
      await loadArchiveBets();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to record result: ${errorMsg}`);
    }
  };

  const calculatePnL = (bet: Bet): number => {
    if (!bet.result) return 0;
    if (bet.result === 'WIN') return bet.kellyStak * (bet.odds - 1);
    if (bet.result === 'PLACE') return bet.kellyStak * ((bet.odds - 1) * 0.25);
    return -bet.kellyStak;
  };

  const scrapeResults = async () => {
    if (!scrapeUrl.trim()) {
      setError('Paste a Sportsbet Form race URL to scrape results');
      return;
    }

    setScrapeLoading(true);
    setError('');
    setScrapeResult(null);

    try {
      const data = await apiPost<{ success: boolean; resultsCount: number; betsMarked: number; message?: string; track?: string; raceNum?: number }>(
        API_ENDPOINTS.scrapeResults,
        { url: scrapeUrl }
      );

      if (data.success) {
        setScrapeResult({
          track: data.track || 'Unknown',
          raceNum: data.raceNum || 0,
          resultsCount: data.resultsCount,
          betsMarked: data.betsMarked,
        });
        setSuccess(`✓ Scraper found ${data.resultsCount} placings, marked ${data.betsMarked} bets`);
        setScrapeUrl('');
        await loadDashboard();
        await loadActiveBets();
        await loadArchiveBets();
      } else {
        setError(data.message || 'Failed to scrape results');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg || 'Failed to scrape results');
    } finally {
      setScrapeLoading(false);
    }
  };

  const scrapeCompletedRaces = async () => {
    if (activeBets.length === 0) return;

    setScrapeLoading(true);
    setError('');
    setSuccess('');
    setScrapeProgress(null);

    try {
      // Start the scraping job
      const startData = await apiPost<{ success: boolean; jobId: string; message?: string; pending?: number; error?: string }>(
        API_ENDPOINTS.resultsScrape,
        {}
      );

      if (!startData.success || !startData.jobId) {
        setError(startData.error || 'Failed to start scraping');
        setScrapeLoading(false);
        return;
      }

      setScrapeJobId(startData.jobId);
      setSuccess(`✓ Started scraping ${activeBets.length} races from public sources (${activeBets.length} still pending)`);

      // Poll job status every 2 seconds
      let isComplete = false;
      let pollCount = 0;
      const maxPolls = 180; // 6 minutes max

      while (!isComplete && pollCount < maxPolls) {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds between polls
        pollCount++;

        try {
          const statusResponse = await fetch(`/api/results/job/${startData.jobId}`);
          const statusData = await statusResponse.json();

          if (statusData.success && statusData.job) {
            const job = statusData.job;
            setScrapeProgress({ updated: job.updated, total: job.total });

            if (job.status === 'completed') {
              isComplete = true;
              setSuccess(
                `✓ Scraping complete: ${job.updated} results updated (${job.totalSettled} settled)`
              );
              await loadDashboard();
              await loadActiveBets();
              await loadArchiveBets();
            }
          }
        } catch (pollErr) {
          // Continue polling even if this request fails
          console.error('Error polling job status:', pollErr);
        }
      }

      if (!isComplete) {
        setSuccess(`✓ Scraping in progress (${scrapeProgress?.updated || 0}/${scrapeProgress?.total || activeBets.length} completed)`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg || 'Failed to scrape results');
    } finally {
      setScrapeLoading(false);
      setScrapeJobId(null);
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>
      {/* Dashboard Stats - EV Focused */}
      {dashboard && (
        <>
          {/* Top Hero Cards: Bank & ROI */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3, mb: 4 }}>
            <Card sx={{ backgroundColor: '#F0F9FF', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 1 }}>
                  💰 BANKROLL
                </Typography>
                <Typography sx={{ fontSize: '3.5rem', fontWeight: 900, color: '#0284C7', lineHeight: 1 }}>
                  ${dashboard.bank.toFixed(2)}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', mt: 2 }}>
                  Started: $200 | Growth: {((dashboard.bank - 200) / 200 * 100).toFixed(1)}%
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ backgroundColor: dashboard.roi >= 10 ? '#F0FDFA' : dashboard.roi >= 0 ? '#FFFBEB' : '#FEF2F2', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 1 }}>
                  📊 RETURN ON INVESTMENT
                </Typography>
                <Typography sx={{ fontSize: '3.5rem', fontWeight: 900, color: dashboard.roi >= 10 ? '#10B981' : dashboard.roi >= 0 ? '#F59E0B' : '#EF4444', lineHeight: 1 }}>
                  {dashboard.roi >= 0 ? '+' : ''}{dashboard.roi.toFixed(1)}%
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', mt: 2 }}>
                  P&L: {dashboard.cumulativePnL >= 0 ? '+' : ''}${dashboard.cumulativePnL.toFixed(2)} | Target: {dashboard.targetRoi}%
                </Typography>
              </CardContent>
            </Card>
          </Box>

          {/* Secondary Stats Grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 2, mb: 2 }}>
            <Card sx={{ backgroundColor: dashboard.status === 'HITTING TARGET 🎯' ? '#F0FDFA' : '#FEF3C7' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 0.5 }}>
                  STATUS
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: dashboard.status === 'HITTING TARGET 🎯' ? '#10B981' : dashboard.roi >= 0 ? '#92400E' : '#EF4444' }}>
                  {dashboard.status}
                </Typography>
                <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mt: 1 }}>
                  {dashboard.totalBets} bets tracked
                </Typography>
              </CardContent>
            </Card>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 0.5 }}>
                  EDGE FOUND
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#0284C7' }}>
                  {dashboard.edgeFoundPercent.toFixed(0)}%
                </Typography>
                <Typography variant="caption" sx={{ color: '#6B7280' }}>
                  {dashboard.betsWithEdge} / {dashboard.totalBets} bets
                </Typography>
              </CardContent>
            </Card>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 0.5 }}>
                  AVG EV
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: dashboard.avgEvPercent > 0 ? '#10B981' : '#EF4444' }}>
                  {dashboard.avgEvPercent > 0 ? '+' : ''}{dashboard.avgEvPercent.toFixed(2)}%
                </Typography>
                <Typography variant="caption" sx={{ color: '#6B7280' }}>
                  Per bet value
                </Typography>
              </CardContent>
            </Card>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 0.5 }}>
                  STAKED
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#06B6D4' }}>
                  ${dashboard.totalStaked.toFixed(2)}
                </Typography>
                <Typography variant="caption" sx={{ color: '#6B7280' }}>
                  {dashboard.betsWithResult} results marked
                </Typography>
              </CardContent>
            </Card>
          </Box>

          {dashboard.betsWithResult > 0 && (
            <Alert severity="info" sx={{ mb: 3 }}>
              ✓ {dashboard.totalBets} bets tracked | {dashboard.betsWithResult} results marked | EV validation: {dashboard.evValidationPercent.toFixed(0)}% accurate
            </Alert>
          )}
        </>
      )}

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

      {/* Bank & P&L Charts */}
      {historyData.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 3 }}>
              📈 Bank & P&L Trends
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
              {/* Bank Chart */}
              <Box sx={{ backgroundColor: '#F0F9FF', borderRadius: 1, p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1F2937', mb: 2 }}>
                  💰 Bankroll
                </Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="date"
                      stroke="#9CA3AF"
                      style={{ fontSize: '0.75rem' }}
                    />
                    <YAxis stroke="#9CA3AF" style={{ fontSize: '0.75rem' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 4 }}
                      formatter={(value) => [`$${(value as number).toFixed(2)}`, 'Bank']}
                      labelFormatter={(label) => `${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="bank"
                      stroke="#0284C7"
                      strokeWidth={3}
                      dot={false}
                      name="Bank"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>

              {/* P&L Chart */}
              <Box sx={{ backgroundColor: '#F0FDFA', borderRadius: 1, p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1F2937', mb: 2 }}>
                  📊 Cumulative P&L
                </Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="date"
                      stroke="#9CA3AF"
                      style={{ fontSize: '0.75rem' }}
                    />
                    <YAxis stroke="#9CA3AF" style={{ fontSize: '0.75rem' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 4 }}
                      formatter={(value) => [`$${(value as number).toFixed(2)}`, 'P&L']}
                      labelFormatter={(label) => `${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="pnl"
                      stroke={historyData[historyData.length - 1]?.pnl >= 0 ? '#10B981' : '#EF4444'}
                      strokeWidth={3}
                      dot={false}
                      name="P&L"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
            <Button
              variant="contained"
              size="large"
              onClick={runTradingStrategy}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : <TrendingUpRounded />}
              fullWidth
              sx={{
                background: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #0d5f59 0%, #0f9885 100%)',
                }
              }}
            >
              {loading ? 'Running strategy...' : 'Run Trading Strategy'}
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={scrapeCompletedRaces}
              disabled={scrapeLoading}
              startIcon={scrapeLoading ? <CircularProgress size={20} /> : <RefreshRounded />}
              fullWidth
            >
              {scrapeLoading ? 'Checking...' : 'Check Results'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Scraping Progress */}
      {scrapeProgress && scrapeLoading && (
        <Card sx={{ mb: 4, backgroundColor: '#FEF3C7', borderLeft: '4px solid #F59E0B' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#92400E' }}>
                Scraping in progress...
              </Typography>
              <Typography variant="body2" sx={{ color: '#92400E', fontWeight: 600 }}>
                {scrapeProgress.updated} / {scrapeProgress.total}
              </Typography>
            </Box>
            <Box sx={{ width: '100%', height: 8, backgroundColor: '#FDE68A', borderRadius: 1, overflow: 'hidden' }}>
              <Box
                sx={{
                  height: '100%',
                  backgroundColor: '#F59E0B',
                  width: `${(scrapeProgress.updated / scrapeProgress.total) * 100}%`,
                  transition: 'width 0.3s ease',
                }}
              />
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Races Loaded Confirmation */}
      {success && (
        <Card sx={{ mb: 4, backgroundColor: '#ECFDF5', borderLeft: '4px solid #10B981' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
              <CheckCircleRounded sx={{ color: '#10B981', mt: 0.5, flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#065F46', mb: 1 }}>
                  ✓ {scrapeLoading ? 'Scraping' : 'Complete'}
                </Typography>
                <Typography variant="body2" sx={{ color: '#047857' }}>
                  {success}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Bets Placed Counter */}
      {activeBets.length > 0 && (
        <Card sx={{ mb: 4, backgroundColor: '#F0F9FF', borderLeft: '4px solid #3B82F6' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" sx={{ color: '#6B7280', mb: 1 }}>
                  Active Bets Placed
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#1F2937' }}>
                  {activeBets.length}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="body2" sx={{ color: '#6B7280', mb: 1 }}>
                  Total Stake
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937' }}>
                  ${activeBets.reduce((sum, bet) => sum + (bet.stake || 0), 0).toFixed(2)}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Today's Top Picks */}
      {picks.length > 0 && !placedBets.length && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 3 }}>
              🎯 Top {picks.length} Picks Today
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, mb: 3 }}>
              {picks.map((pick, i) => (
                <Box
                  key={pick.id}
                  sx={{
                    border: '1px solid #E5E7EB',
                    borderRadius: 2,
                    p: 2,
                    backgroundColor: '#F9FAFB',
                  }}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937' }}>
                        #{i + 1}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#6B7280' }}>
                        {pick.track} R{pick.raceNum}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: '#0F766E' }}>
                        {pick.horse}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280' }}>
                        {pick.jockey} • {pick.trainer}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, mt: 2 }}>
                    <Box sx={{ backgroundColor: '#EFF6FF', p: 1.5, borderRadius: 1 }}>
                      <Typography variant="caption" sx={{ color: '#0284C7', fontWeight: 600, display: 'block' }}>
                        PREDICTED
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#0284C7' }}>
                        ${pick.predictedOdds ? pick.predictedOdds.toFixed(2) : 'N/A'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.75rem' }}>
                        {pick.predictedOdds ? ((1 / pick.predictedOdds) * 100).toFixed(0) : 'N/A'}%
                      </Typography>
                    </Box>
                    <Box sx={{ backgroundColor: '#FEF3C7', p: 1.5, borderRadius: 1 }}>
                      <Typography variant="caption" sx={{ color: '#92400E', fontWeight: 600, display: 'block' }}>
                        MARKET ODDS
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#92400E' }}>
                        ${pick.odds.toFixed(2)}
                      </Typography>
                      <TextField
                        size="small"
                        type="number"
                        placeholder="Closing"
                        inputProps={{ step: '0.01' }}
                        onChange={(e) => {
                          const closing = parseFloat(e.target.value);
                          if (!isNaN(closing) && pick.predictedOdds) {
                            const ev = calculateEV(pick.predictedOdds, closing);
                            picks[i].closingOdds = closing;
                            picks[i].expectedValuePercent = ev;
                            setPicks([...picks]);
                          }
                        }}
                        sx={{ mt: 0.5, '& input': { fontSize: '0.75rem' } }}
                      />
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
                        CONFIDENCE
                      </Typography>
                      <Chip
                        label={`${pick.confidence}%`}
                        size="small"
                        color={pick.confidence >= 70 ? 'success' : 'default'}
                      />
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
                        KELLY STAKE
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#10B981' }}>
                        ${pick.kellyStak.toFixed(2)}
                      </Typography>
                    </Box>
                    {pick.expectedValuePercent !== undefined && (
                      <Box sx={{ backgroundColor: pick.expectedValuePercent > 0 ? '#DBEAFE' : '#FEE2E2', p: 1.5, borderRadius: 1 }}>
                        <Typography variant="caption" sx={{ color: pick.expectedValuePercent > 0 ? '#0284C7' : '#DC2626', fontWeight: 600, display: 'block' }}>
                          EV
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: pick.expectedValuePercent > 0 ? '#10B981' : '#EF4444' }}>
                          {pick.expectedValuePercent > 0 ? '+' : ''}{pick.expectedValuePercent.toFixed(1)}%
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>

            <Typography variant="body2" sx={{ color: '#6B7280', mb: 2 }}>
              Total Stake: <strong>${picks.reduce((sum, p) => sum + p.kellyStak, 0).toFixed(2)}</strong>
            </Typography>

            <Button
              variant="contained"
              color="success"
              size="large"
              onClick={placeAllBets}
              startIcon={<CheckCircleRounded />}
              fullWidth
            >
              Place All {picks.length} Bets
            </Button>
          </CardContent>
        </Card>
      )}


      {/* Placed Bets & Results */}
      {(placedBets.length > 0 || activeBets.length > 0 || archiveBets.length > 0) && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937' }}>
                📊 Bets
              </Typography>
              {activeBets.length > 0 && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={scrapeCompletedRaces}
                  disabled={scrapeLoading}
                  startIcon={scrapeLoading ? <CircularProgress size={16} /> : undefined}
                >
                  {scrapeLoading ? 'Scraping...' : 'Check & Scrape Completed'}
                </Button>
              )}
            </Box>
            <Tabs value={betTab} onChange={(_, val) => setBetTab(val)} sx={{ mb: 2, borderBottom: '1px solid #E5E7EB' }}>
              <Tab label={`Pending Today (${activeBets.length})`} value="active" />
              <Tab label={`Results - Past 2 Days (${archiveBets.length})`} value="archive" />
              <Tab label="📋 Daily Summary - All Bets" value="summary" />
              <Tab label="📝 Enter Results" value="results" />
            </Tabs>

            {betTab === 'active' && (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Race</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Horse</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Jockey / Trainer</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Stake</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Odds</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Confidence</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Mark Result</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activeBets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 3, color: '#9CA3AF' }}>
                          No active bets today
                        </TableCell>
                      </TableRow>
                    ) : (
                      activeBets.map((bet) => (
                        <TableRow key={bet.id}>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {bet.track} R{bet.raceNum}
                            {bet.raceTime && <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>{bet.raceTime}</div>}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{bet.horse}</TableCell>
                          <TableCell sx={{ fontSize: '0.85rem', color: '#6B7280' }}>
                            {bet.jockey} • {bet.trainer}
                          </TableCell>
                          <TableCell align="right">${bet.kellyStak.toFixed(2)}</TableCell>
                          <TableCell align="right">${bet.odds.toFixed(2)}</TableCell>
                          <TableCell>
                            <Chip label={`${bet.confidence}%`} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                setSelectedBet(bet);
                                setResultDialog(true);
                              }}
                            >
                              Mark
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {betTab === 'archive' && (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Date & Race</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Horse</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Jockey / Trainer</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Stake</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Odds</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Confidence</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Result</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>P&L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {archiveBets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 3, color: '#9CA3AF' }}>
                          No results from past 2 days
                        </TableCell>
                      </TableRow>
                    ) : (
                      archiveBets.map((bet) => (
                        <TableRow key={bet.id}>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {bet.track} R{bet.raceNum}
                            {bet.raceTime && <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>{bet.raceTime}</div>}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{bet.horse}</TableCell>
                          <TableCell sx={{ fontSize: '0.85rem', color: '#6B7280' }}>
                            {bet.jockey} • {bet.trainer}
                          </TableCell>
                          <TableCell align="right">${bet.kellyStak.toFixed(2)}</TableCell>
                          <TableCell align="right">${bet.odds.toFixed(2)}</TableCell>
                          <TableCell>
                            <Chip label={`${bet.confidence}%`} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={bet.result}
                              size="small"
                              color={
                                bet.result === 'WIN'
                                  ? 'success'
                                  : bet.result === 'PLACE'
                                    ? 'info'
                                    : 'error'
                              }
                            />
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 600,
                              color: (bet.pnl ?? 0) >= 0 ? '#10B981' : '#EF4444',
                            }}
                          >
                            {(bet.pnl ?? 0) >= 0 ? '+$' : '-$'}{Math.abs(bet.pnl ?? 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {betTab === 'summary' && (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Race</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Horse</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Jockey / Trainer</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Stake</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Odds</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Confidence</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>P&L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activeBets.length === 0 && archiveBets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 3, color: '#9CA3AF' }}>
                          No bets placed today
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {activeBets.map((bet) => (
                          <TableRow key={bet.id} sx={{ backgroundColor: '#F0FDF4' }}>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {bet.track} R{bet.raceNum}
                              {bet.raceTime && <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>{bet.raceTime}</div>}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{bet.horse}</TableCell>
                            <TableCell sx={{ fontSize: '0.85rem', color: '#6B7280' }}>
                              {bet.jockey} • {bet.trainer}
                            </TableCell>
                            <TableCell align="right">${bet.kellyStak.toFixed(2)}</TableCell>
                            <TableCell align="right">${bet.odds.toFixed(2)}</TableCell>
                            <TableCell>
                              <Chip label={`${bet.confidence}%`} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <Chip label="PENDING" size="small" color="warning" variant="outlined" />
                            </TableCell>
                            <TableCell align="right" sx={{ color: '#6B7280' }}>—</TableCell>
                          </TableRow>
                        ))}
                        {archiveBets.map((bet) => (
                          <TableRow key={bet.id}>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {bet.track} R{bet.raceNum}
                              {bet.raceTime && <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>{bet.raceTime}</div>}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{bet.horse}</TableCell>
                            <TableCell sx={{ fontSize: '0.85rem', color: '#6B7280' }}>
                              {bet.jockey} • {bet.trainer}
                            </TableCell>
                            <TableCell align="right">${bet.kellyStak.toFixed(2)}</TableCell>
                            <TableCell align="right">${bet.odds.toFixed(2)}</TableCell>
                            <TableCell>
                              <Chip label={`${bet.confidence}%`} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={bet.result}
                                size="small"
                                color={
                                  bet.result === 'WIN'
                                    ? 'success'
                                    : bet.result === 'PLACE'
                                      ? 'info'
                                      : 'error'
                                }
                              />
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                fontWeight: 600,
                                color: (bet.pnl ?? 0) >= 0 ? '#10B981' : '#EF4444',
                              }}
                            >
                              {(bet.pnl ?? 0) >= 0 ? '+$' : '-$'}{Math.abs(bet.pnl ?? 0).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {betTab === 'results' && (
              <Card sx={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <CardContent>
                  {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                  {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                  <TextField
                    multiline
                    rows={16}
                    placeholder={'Track: Cranbourne\nRace: 1\n\n1st\n\n8. White Hot Mama (2)\n...'}
                    value={resultTable}
                    onChange={(e) => setResultTable(e.target.value)}
                    fullWidth
                    sx={{ mb: 2, fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />

                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => {
                      // Extract track and race from first two lines
                      const lines = resultTable.split('\n');
                      let track = '';
                      let race = '';

                      for (const line of lines) {
                        if (line.toLowerCase().includes('track:')) {
                          track = line.replace(/track:\s*/i, '').trim();
                        }
                        if (line.toLowerCase().includes('race:')) {
                          race = line.replace(/race:\s*/i, '').trim();
                        }
                      }

                      if (track) setResultTrack(track);
                      if (race) setResultRaceNum(race);
                      submitResults();
                    }}
                    disabled={submittingResults}
                    startIcon={submittingResults ? <CircularProgress size={16} /> : undefined}
                    fullWidth
                  >
                    {submittingResults ? 'Submitting...' : 'Submit Results'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}

      {/* Result Dialog */}
      <Dialog open={resultDialog} onClose={() => setResultDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Mark Result: {selectedBet?.horse}</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" sx={{ mb: 2, color: '#6B7280' }}>
            Stake: ${selectedBet?.kellyStak.toFixed(2)} @ ${selectedBet?.odds.toFixed(2)}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
            <Button
              variant={selectedBet?.result === 'WIN' ? 'contained' : 'outlined'}
              color="success"
              onClick={() => setSelectedBet(selectedBet ? { ...selectedBet, result: 'WIN' } : null)}
              fullWidth
            >
              WIN
            </Button>
            <Button
              variant={selectedBet?.result === 'PLACE' ? 'contained' : 'outlined'}
              color="info"
              onClick={() => setSelectedBet(selectedBet ? { ...selectedBet, result: 'PLACE' } : null)}
              fullWidth
            >
              PLACE
            </Button>
            <Button
              variant={selectedBet?.result === 'LOSS' ? 'contained' : 'outlined'}
              color="error"
              onClick={() => setSelectedBet(selectedBet ? { ...selectedBet, result: 'LOSS' } : null)}
              fullWidth
            >
              LOSS
            </Button>
          </Box>
          {selectedBet?.result && (
            <Box sx={{ mt: 2, p: 2, backgroundColor: '#F9FAFB', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mb: 0.5 }}>
                P&L if {selectedBet.result}:
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: calculatePnL(selectedBet) >= 0 ? '#10B981' : '#EF4444' }}>
                {calculatePnL(selectedBet) >= 0 ? '+' : ''} ${calculatePnL(selectedBet).toFixed(2)}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setResultDialog(false)} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={submitResult}
            variant="contained"
            disabled={!selectedBet?.result}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Auto Scrape Results */}
      {activeBets.length > 0 && (
        <Card sx={{ mt: 4 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 2 }}>
              🔄 Auto Scrape Race Results
            </Typography>
            <Typography variant="body2" sx={{ color: '#6B7280', mb: 2 }}>
              Paste the completed Sportsbet Form URL to automatically match and mark results from your active bets
            </Typography>
            <TextField
              fullWidth
              placeholder="https://www.sportsbetform.com.au/[meeting-id]/[race-id]/"
              value={scrapeUrl}
              onChange={(e) => setScrapeUrl(e.target.value)}
              sx={{ mb: 2, fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
            <Button
              variant="contained"
              size="large"
              onClick={scrapeResults}
              disabled={scrapeLoading || !scrapeUrl.trim()}
              startIcon={scrapeLoading ? <CircularProgress size={20} /> : undefined}
              fullWidth
            >
              {scrapeLoading ? 'Scraping...' : 'Scrape Results & Auto-Mark'}
            </Button>

            {scrapeResult && (
              <Alert severity="success" sx={{ mt: 2 }}>
                ✓ {scrapeResult.track} Race {scrapeResult.raceNum}: Found {scrapeResult.resultsCount} placings, marked {scrapeResult.betsMarked} bets
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default DailyPicksComponent;
