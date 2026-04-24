import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Paper,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { TrendingUpRounded, CheckCircleRounded } from '@mui/icons-material';
import { apiFetch, apiPost } from '@/lib/fetch';
import { API_ENDPOINTS } from '@/config/api';
import { debug } from '@/lib/debug';

interface Bet {
  track: string;
  raceNum: number;
  raceTime: string;
  horse: string;
  jockey: string;
  trainer: string;
  odds: number;
  confidence: number;
  reasoning: string;
}

interface KBStats {
  totalRaces: number;
  jockeys: number;
  trainers: number;
}

export const Recommender: React.FC = () => {
  const [bets, setBets] = useState<Bet[]>([]);
  const [kbStats, setKbStats] = useState<KBStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bank, setBank] = useState(200);
  const [selectedBet, setSelectedBet] = useState<Bet | null>(null);
  const [betDialog, setBetDialog] = useState(false);
  const [stakeAmount, setStakeAmount] = useState(0);

  useEffect(() => {
    loadRecommendations();
    loadBank();
  }, []);

  const loadBank = async () => {
    try {
      const data = await apiFetch<{ success: boolean; bank: number }>(API_ENDPOINTS.sessionBank);
      if (data.success) {
        setBank(data.bank);
      }
    } catch (err) {
      debug.error('Failed to load bank:', err);
    }
  };

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ success: boolean; picks?: Bet[]; kbStats?: KBStats; error?: string }>(
        API_ENDPOINTS.sessionBank.replace('/api/session/bank', '') + '/api/auto-bets'
      );

      if (data.success) {
        setBets(data.picks || []);
        setKbStats(data.kbStats || null);
        setError('');
      } else {
        setError(data.error || 'Failed to load recommendations');
      }
    } catch (err) {
      debug.error('Failed to load recommendations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  const calculateKellyStake = (confidence: number, odds: number): number => {
    // Confidence 0-100 -> estimated win probability
    const trueProb = confidence / 100;
    const edge = (trueProb * odds) - 1;

    if (edge <= 0) return 0;

    const b = odds - 1;
    const fullKelly = (b * trueProb - (1 - trueProb)) / b;
    const quarterKelly = Math.max(0, fullKelly * 0.25);
    
    return Math.round(quarterKelly * bank * 100) / 100;
  };

  const handlePlaceBet = (bet: Bet) => {
    const stake = calculateKellyStake(bet.confidence, bet.odds);
    setSelectedBet(bet);
    setStakeAmount(stake);
    setBetDialog(true);
  };

  const confirmBet = async () => {
    if (!selectedBet) return;

    try {
      // Update bank
      const newBank = bank - stakeAmount;
      await apiPost(API_ENDPOINTS.sessionBank, {
        bank: newBank,
        totalStaked: stakeAmount,
      });

      setBank(newBank);
      setBetDialog(false);
      setSelectedBet(null);
      setError('');
    } catch (err) {
      debug.error('Failed to place bet:', err);
      setError('Failed to place bet');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" sx={{ fontWeight: 700, color: '#1F2937', mb: 1 }}>
          Today's Recommendations
        </Typography>
        <Typography variant="body2" sx={{ color: '#6B7280' }}>
          Kelly Criterion betting picks with positive expected value
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* Bank & KB Status */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 4 }}>
        <Card>
          <CardContent>
            <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 0.5 }}>
              CURRENT BANK
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: bank >= 200 ? '#10B981' : '#EF4444', mb: 1 }}>
              ${bank.toFixed(2)}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(bank / 200) * 100}
              sx={{ backgroundColor: '#E5E7EB', '& .MuiLinearProgress-bar': { backgroundColor: bank >= 200 ? '#10B981' : '#EF4444' } }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 0.5 }}>
              KNOWLEDGE BASE
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#0F766E', mb: 1 }}>
              {kbStats?.totalRaces ?? 0} races
            </Typography>
            <Typography variant="body2" sx={{ color: '#6B7280' }}>
              {kbStats?.jockeys ?? 0} jockeys • {kbStats?.trainers ?? 0} trainers
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Picks Table */}
      {bets.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Race</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Horse</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Jockey</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Trainer</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Odds</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Confidence</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Kelly Stake</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bets.map((bet, i) => {
                const stake = calculateKellyStake(bet.confidence, bet.odds);
                return (
                  <TableRow key={i} sx={{ '&:hover': { backgroundColor: '#F9FAFB' } }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {bet.track} R{bet.raceNum}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280' }}>
                        {bet.raceTime}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{bet.horse}</TableCell>
                    <TableCell>{bet.jockey}</TableCell>
                    <TableCell>{bet.trainer}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>${bet.odds.toFixed(2)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ flex: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={bet.confidence}
                            sx={{
                              backgroundColor: '#E5E7EB',
                              '& .MuiLinearProgress-bar': { backgroundColor: bet.confidence > 70 ? '#10B981' : '#0F766E' },
                            }}
                          />
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 45 }}>
                          {bet.confidence}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#0F766E' }}>
                      ${stake.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => handlePlaceBet(bet)}
                        disabled={stake === 0 || stake > bank}
                        startIcon={<CheckCircleRounded />}
                      >
                        Bet
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <TrendingUpRounded sx={{ fontSize: '3rem', color: '#9CA3AF', mb: 2 }} />
            <Typography variant="h6" sx={{ color: '#6B7280', mb: 1 }}>
              No recommendations today
            </Typography>
            <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
              No runners with positive expected value found. Check back later.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Bet Confirmation Dialog */}
      <Dialog open={betDialog} onClose={() => setBetDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Bet</DialogTitle>
        {selectedBet && (
          <DialogContent>
            <Box sx={{ display: 'grid', gap: 2, mt: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
                  HORSE
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937' }}>
                  {selectedBet.horse}
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
                    ODDS
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937' }}>
                    ${selectedBet.odds.toFixed(2)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
                    CONFIDENCE
                  </Typography>
                  <Chip label={`${selectedBet.confidence}%`} color="primary" />
                </Box>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
                  QUARTER-KELLY STAKE
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#10B981' }}>
                  ${stakeAmount.toFixed(2)}
                </Typography>
                <Typography variant="caption" sx={{ color: '#6B7280' }}>
                  from bank of ${bank.toFixed(2)}
                </Typography>
              </Box>
            </Box>
          </DialogContent>
        )}
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setBetDialog(false)} variant="outlined">
            Cancel
          </Button>
          <Button onClick={confirmBet} variant="contained" color="success">
            Place Bet
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Recommender;
