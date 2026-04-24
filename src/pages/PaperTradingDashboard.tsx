import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  TextField,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { apiFetch, apiPost } from '@/lib/fetch';
import { API_ENDPOINTS } from '@/config/api';
import { debug } from '@/lib/debug';

interface Race {
  id?: number;
  date: string;
  track: string;
  raceNum: number;
  raceTime: string;
  runners: Runner[];
}

interface Runner {
  horseName: string;
  jockey: string;
  trainer: string;
  barrier?: number;
  weight?: number;
  odds: number;
  trueProb?: number;
  edge?: number;
  kellyPercent?: number;
  betStatus?: 'NOT_BET' | 'BETTED' | 'WIN' | 'PLACE' | 'LOSS';
  stake?: number;
}

export default function PaperTradingDashboard() {
  const [races, setRaces] = useState<Race[]>([]);
  const [bank, setBank] = useState(200);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Race entry
  const [runnersText, setRunnersText] = useState('');
  const [selectedTrack, setSelectedTrack] = useState('');
  const [selectedRaceNum, setSelectedRaceNum] = useState(0);

  // Result dialog
  const [resultDialog, setResultDialog] = useState(false);
  const [selectedRunner, setSelectedRunner] = useState<{race: Race, runner: Runner} | null>(null);
  const [selectedResult, setSelectedResult] = useState<'WIN' | 'PLACE' | 'LOSS'>('LOSS');

  useEffect(() => {
    loadBank();
  }, []);

  const loadBank = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ success: boolean; bank: number }>(API_ENDPOINTS.sessionBank);
      if (data.success) {
        setBank(data.bank);
      }
    } catch (err) {
      debug.error('Failed to load bank:', err);
      setError('Failed to load bank');
    } finally {
      setLoading(false);
    }
  };

  const parseRunners = () => {
    // Parse format: Horse | Barrier | Weight | Jockey | Trainer | Odds
    const lines = runnersText.split('\n').filter(l => l.trim());
    const parsed: Omit<Runner, 'betStatus'>[] = [];

    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 4) {
        parsed.push({
          horseName: parts[0],
          barrier: parts[1] ? parseInt(parts[1]) : undefined,
          weight: parts[2] ? parseFloat(parts[2]) : undefined,
          jockey: parts[3],
          trainer: parts[4] || 'Unknown',
          odds: parseFloat(parts[parts.length - 1]) || 0,
        });
      }
    }

    return parsed;
  };

  const addRace = async () => {
    if (!selectedTrack || selectedRaceNum === 0 || !runnersText.trim()) {
      setError('Missing race details');
      return;
    }

    try {
      const runners = parseRunners();
      const today = new Date().toISOString().split('T')[0];

      const data = await apiPost<{ success: boolean }>(API_ENDPOINTS.sessionBank.replace('/api/session/bank', '') + '/api/races/add', {
        date: today,
        track: selectedTrack,
        raceNum: selectedRaceNum,
        raceTime: '',
        runners,
      });

      if (data.success) {
        setRunnersText('');
        setError('');
        // Reload races with probability data
        await loadRacesWithProbability(selectedTrack, selectedRaceNum, runners);
      }
    } catch (err) {
      debug.error('Failed to add race:', err);
      setError(err instanceof Error ? err.message : 'Failed to add race');
    }
  };

  const loadRacesWithProbability = async (track: string, raceNum: number, runners: Omit<Runner, 'betStatus'>[]) => {
    try {
      const enrichedRunners = await Promise.all(
        runners.map(async (runner) => {
          try {
            const data = await apiFetch<{ success: boolean; trueProb?: string; edge?: string; kellyPercent?: string }>(
              `${API_ENDPOINTS.sessionBank.replace('/api/session/bank', '')}/api/kb/probability?horse=${encodeURIComponent(runner.horseName)}&jockey=${encodeURIComponent(runner.jockey)}&trainer=${encodeURIComponent(runner.trainer)}&track=${encodeURIComponent(track)}&odds=${runner.odds}`
            );

            return {
              ...runner,
              trueProb: data.success ? parseFloat(data.trueProb || '0') : 0,
              edge: data.success ? parseFloat(data.edge || '0') : 0,
              kellyPercent: data.success ? parseFloat(data.kellyPercent || '0') : 0,
              betStatus: 'NOT_BET' as const,
            };
          } catch (err) {
            debug.error(`Failed to get probability for ${runner.horseName}:`, err);
            return {
              ...runner,
              trueProb: 0,
              edge: 0,
              kellyPercent: 0,
              betStatus: 'NOT_BET' as const,
            };
          }
        })
      );

      const newRace: Race = {
        date: new Date().toISOString().split('T')[0],
        track,
        raceNum,
        raceTime: '',
        runners: enrichedRunners,
      };

      setRaces([...races, newRace]);
    } catch (err) {
      debug.error('Failed to calculate probabilities:', err);
      setError('Failed to calculate probabilities');
    }
  };

  const placeBet = async (race: Race, runner: Runner) => {
    if (!runner.kellyPercent || runner.kellyPercent <= 0) {
      setError('No positive edge for this bet');
      return;
    }

    const stake = Math.floor(bank * (runner.kellyPercent / 100));
    if (stake < 1) {
      setError('Bank too small for this bet');
      return;
    }

    try {
      const data = await apiPost<{ success: boolean }>(API_ENDPOINTS.sessionBank.replace('/api/session/bank', '') + '/api/bets', {
        marketId: `${race.track}-R${race.raceNum}`,
        selectionId: `${runner.horseName}-${race.raceNum}`,
        track: race.track,
        raceNum: race.raceNum,
        date: race.date,
        horse: runner.horseName,
        odds: runner.odds,
        stake,
      });

      if (data.success) {
        const updatedRaces = races.map(r =>
          r === race
            ? {
              ...r,
              runners: r.runners.map(run =>
                run === runner
                  ? { ...run, betStatus: 'BETTED' as const, stake }
                  : run
              ),
            }
            : r
        );
        setRaces(updatedRaces);
        const newBank = bank - stake;
        setBank(newBank);
        await apiPost(API_ENDPOINTS.sessionBank, { bank: newBank, totalStaked: stake });
      }
    } catch (err) {
      debug.error('Failed to place bet:', err);
      setError('Failed to place bet');
    }
  };

  const markResult = async (race: Race, runner: Runner, result: 'WIN' | 'PLACE' | 'LOSS') => {
    try {
      await apiPost(API_ENDPOINTS.sessionBank.replace('/api/session/bank', '') + '/api/runner/result', {
        horseName: runner.horseName,
        jockey: runner.jockey,
        trainer: runner.trainer,
        track: race.track,
        result,
      });

      // Calculate P&L
      let pnl = 0;
      if (result === 'WIN') {
        pnl = (runner.stake || 0) * (runner.odds - 1);
      } else if (result === 'PLACE') {
        pnl = (runner.stake || 0) * (Math.max(runner.odds / 4, 1.5) - 1);
      } else {
        pnl = -(runner.stake || 0);
      }

      // Update bank
      const newBank = bank + pnl;
      setBank(newBank);
      await apiPost(API_ENDPOINTS.sessionBank, { bank: newBank, totalStaked: 0 });

      // Update UI
      const updatedRaces = races.map(r =>
        r === race
          ? {
            ...r,
            runners: r.runners.map(run =>
              run === runner
                ? { ...run, betStatus: result }
                : run
            ),
          }
          : r
      );
      setRaces(updatedRaces);
      setResultDialog(false);
    } catch (err) {
      debug.error('Failed to record result:', err);
      setError('Failed to record result');
    }
  };

  const totalStaked = races.flatMap(r => r.runners).reduce((s, r) => s + (r.stake || 0), 0);
  const totalProfit = races
    .flatMap(r => r.runners)
    .reduce((sum, r) => {
      if (!r.betStatus || r.betStatus === 'NOT_BET' || r.betStatus === 'BETTED') return sum;
      if (r.betStatus === 'WIN') return sum + (r.stake || 0) * (r.odds - 1);
      if (r.betStatus === 'PLACE') return sum + (r.stake || 0) * (Math.max(r.odds / 4, 1.5) - 1);
      if (r.betStatus === 'LOSS') return sum - (r.stake || 0);
      return sum;
    }, 0);

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" sx={{ fontWeight: 700, color: '#1F2937', mb: 1 }}>
          Kelly Criterion Betting Advisor
        </Typography>
        <Typography variant="body2" sx={{ color: '#6B7280', mb: 3 }}>
          Value-based betting with KB learning · Quarter-Kelly sizing · Target 10% ROI
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {/* Bank Display */}
        <Card sx={{ mb: 4, backgroundColor: bank > 200 ? '#F0FDFB' : bank < 200 ? '#FEF2F2' : '#F9FAFB' }}>
          <CardContent sx={{ textAlign: 'center', py: 3 }}>
            <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
              BANK
            </Typography>
            <Typography variant="h2" sx={{ fontWeight: 700, color: bank > 200 ? '#10B981' : bank < 200 ? '#EF4444' : '#1F2937' }}>
              ${bank.toFixed(0)}
            </Typography>
            <Typography variant="caption" sx={{ color: '#6B7280' }}>
              P&L: {totalProfit > 0 ? '+' : ''} ${totalProfit.toFixed(0)} | Staked: ${totalStaked.toFixed(0)}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Race Entry */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 2 }}>
            Add Race
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
            <TextField
              label="Track"
              value={selectedTrack}
              onChange={(e) => setSelectedTrack(e.target.value)}
              size="small"
            />
            <TextField
              label="Race Number"
              type="number"
              value={selectedRaceNum || ''}
              onChange={(e) => setSelectedRaceNum(parseInt(e.target.value) || 0)}
              size="small"
            />
          </Box>

          <TextField
            label="Paste Runners (Horse | Barrier | Weight | Jockey | Trainer | Odds)"
            multiline
            rows={4}
            value={runnersText}
            onChange={(e) => setRunnersText(e.target.value)}
            fullWidth
            placeholder="Horse Name | 1 | 56.0 | Jockey Name | Trainer Name | 2.50"
            sx={{ mb: 2 }}
          />

          <Button variant="contained" onClick={addRace} fullWidth>
            Add Race
          </Button>
        </CardContent>
      </Card>

      {/* Analysis Table */}
      {races.length > 0 && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#F3F4F6' }}>
                  <TableCell sx={{ fontWeight: 700, color: '#1F2937' }}>Race</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1F2937' }}>Horse</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1F2937' }}>Jockey</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1F2937' }}>Trainer</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#1F2937' }}>Odds</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#1F2937' }}>True %</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#1F2937' }}>Edge %</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#1F2937' }}>Kelly %</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#1F2937' }}>Stake</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: '#1F2937' }}>Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: '#1F2937' }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {races.map((race) =>
                  race.runners.map((runner, idx) => (
                    <TableRow
                      key={`${race.track}-${race.raceNum}-${idx}`}
                      sx={{
                        backgroundColor: (runner.edge || 0) > 0 ? '#F0FDFB' : '#FFFFFF',
                        '&:hover': { backgroundColor: '#F9FAFB' },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 600, color: '#1F2937' }}>
                        {race.track} R{race.raceNum}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, color: '#0F766E' }}>
                        {runner.horseName}
                      </TableCell>
                      <TableCell sx={{ color: '#6B7280' }}>
                        {runner.jockey}
                      </TableCell>
                      <TableCell sx={{ color: '#6B7280' }}>
                        {runner.trainer}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                        ${runner.odds}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {runner.trueProb?.toFixed(1)}%
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: (runner.edge || 0) > 0 ? '#10B981' : '#EF4444',
                        }}
                      >
                        {runner.edge?.toFixed(1)}%
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {runner.kellyPercent?.toFixed(2)}%
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                        ${runner.stake || '-'}
                      </TableCell>
                      <TableCell align="center">
                        <Box
                          sx={{
                            display: 'inline-block',
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            backgroundColor:
                              runner.betStatus === 'WIN'
                                ? '#D1FAE5'
                                : runner.betStatus === 'PLACE'
                                ? '#DBEAFE'
                                : runner.betStatus === 'LOSS'
                                ? '#FEE2E2'
                                : '#F3F4F6',
                            color:
                              runner.betStatus === 'WIN'
                                ? '#065F46'
                                : runner.betStatus === 'PLACE'
                                ? '#0C4A6E'
                                : runner.betStatus === 'LOSS'
                                ? '#7F1D1D'
                                : '#6B7280',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                          }}
                        >
                          {runner.betStatus || 'NOT BET'}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        {!runner.betStatus || runner.betStatus === 'NOT_BET' ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => placeBet(race, runner)}
                            disabled={(runner.edge || 0) <= 0}
                          >
                            Bet
                          </Button>
                        ) : runner.betStatus === 'BETTED' ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                              setSelectedRunner({ race, runner });
                              setResultDialog(true);
                            }}
                          >
                            Result
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Result Dialog */}
      <Dialog open={resultDialog} onClose={() => setResultDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#1F2937' }}>
          Mark Result
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedRunner && (
            <Box>
              <Typography variant="body2" sx={{ color: '#6B7280', mb: 3 }}>
                {selectedRunner.runner.horseName} @ ${selectedRunner.runner.odds}
              </Typography>
              <ToggleButtonGroup
                value={selectedResult}
                exclusive
                onChange={(_, newResult) => {
                  if (newResult) setSelectedResult(newResult);
                }}
                fullWidth
              >
                <ToggleButton value="WIN" sx={{ py: 2 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#10B981' }}>
                      WIN
                    </Typography>
                  </Box>
                </ToggleButton>
                <ToggleButton value="PLACE" sx={{ py: 2 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#0284C7' }}>
                      PLACE
                    </Typography>
                  </Box>
                </ToggleButton>
                <ToggleButton value="LOSS" sx={{ py: 2 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#EF4444' }}>
                      LOSS
                    </Typography>
                  </Box>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setResultDialog(false)} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedRunner) {
                markResult(selectedRunner.race, selectedRunner.runner, selectedResult);
              }
            }}
            variant="contained"
            color="success"
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
}
