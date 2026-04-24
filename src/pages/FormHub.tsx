import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Paper,
  Button,
  LinearProgress,
  Chip,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { CloudDownloadRounded, RefreshRounded } from '@mui/icons-material';
import { apiFetch, apiPost } from '@/lib/fetch';
import { API_ENDPOINTS } from '@/config/api';
import { debug } from '@/lib/debug';

interface JockeyStats {
  name: string;
  runs: number;
  wins: number;
  places: number;
  winRate: string;
}

interface TrainerStats {
  name: string;
  runs: number;
  wins: number;
  places: number;
  winRate: string;
}

interface HorseStats {
  name: string;
  track: string;
  runs: number;
  wins: number;
  places: number;
  winRate: string;
}

interface KBSummary {
  totalRaces: number;
  totalJockeys: number;
  totalTrainers: number;
  totalHorses: number;
}

const FormHubComponent: React.FC = () => {
  const [summary, setSummary] = useState<KBSummary | null>(null);
  const [jockeys, setJockeys] = useState<JockeyStats[]>([]);
  const [trainers, setTrainers] = useState<TrainerStats[]>([]);
  const [horses, setHorses] = useState<HorseStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backing, setBacking] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState('');
  const [extractedUrls, setExtractedUrls] = useState<any[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [loadingRaces, setLoadingRaces] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [todaysRaces, setTodaysRaces] = useState<any[]>([]);

  useEffect(() => {
    const fetchKB = async () => {
      try {
        const data = await apiFetch<{ success: boolean; summary?: KBSummary; jockeys?: JockeyStats[]; trainers?: TrainerStats[]; horses?: HorseStats[] }>(
          API_ENDPOINTS.sessionBank.replace('/api/session/bank', '') + '/api/kb/stats'
        );

        if (data.success) {
          setSummary(data.summary || null);
          setJockeys(data.jockeys || []);
          setTrainers(data.trainers || []);
          setHorses(data.horses || []);
          setError('');
        } else {
          setError('Failed to load KB stats');
        }
      } catch (err) {
        debug.error('Failed to fetch KB:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch KB');
      } finally {
        setLoading(false);
      }
    };

    fetchKB();
    // Refresh every 10 seconds to show real-time growth
    const interval = setInterval(fetchKB, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleBackup = async () => {
    setBacking(true);
    try {
      const data = await apiPost<{ success: boolean; backupStats?: { jockeys: number; trainers: number; horses: number } }>(
        API_ENDPOINTS.sessionBank.replace('/api/session/bank', '') + '/api/backup/db',
        {}
      );
      if (data.success && data.backupStats) {
        setBackupSuccess(`✓ Backup complete: ${data.backupStats.jockeys} jockeys, ${data.backupStats.trainers} trainers, ${data.backupStats.horses} horses`);
        setTimeout(() => setBackupSuccess(''), 4000);
      }
    } catch (err) {
      debug.error('Backup failed:', err);
      setError('Backup failed');
    } finally {
      setBacking(false);
    }
  };

  const handleExtractUrls = async () => {
    setExtracting(true);
    try {
      const baseUrl = API_ENDPOINTS.sessionBank.replace('/api/session/bank', '');
      const data = await apiFetch<{ success: boolean; urls?: any[]; totalUrls?: number }>(
        baseUrl + '/api/form-scraper/extract-urls'
      );
      if (data.success && data.urls) {
        setExtractedUrls(data.urls);
        // Extract unique tracks from URLs
        const tracks = new Set<string>();
        data.urls.forEach((u: any) => {
          if (u.track) tracks.add(u.track);
        });
        setSelectedTracks(new Set());
        debug.log(`Found ${tracks.size} unique tracks`);
      } else {
        setError('Failed to extract URLs');
      }
    } catch (err) {
      debug.error('Extract URLs failed:', err);
      setError('Failed to extract race URLs');
    } finally {
      setExtracting(false);
    }
  };

  const handleLoadSelectedTracks = async () => {
    if (selectedTracks.size === 0) {
      setError('Please select at least one track');
      return;
    }

    setLoadingRaces(true);
    setLoadingStatus('Loading selected tracks...');
    try {
      const baseUrl = API_ENDPOINTS.sessionBank.replace('/api/session/bank', '');
      const tracksToLoad = Array.from(selectedTracks);

      const data = await apiPost<{ success: boolean; successCount?: number; errorCount?: number; totalRunners?: number }>(
        baseUrl + '/api/form-scraper/batch',
        { tracks: tracksToLoad, autoBet: false }
      );

      if (data.success) {
        setLoadingStatus(`✓ Loaded ${data.successCount || 0} races with ${data.totalRunners || 0} runners`);
        // Refresh today's races
        await fetchTodaysRaces();
      } else {
        setError('Failed to load tracks');
      }
    } catch (err) {
      debug.error('Load tracks failed:', err);
      setError('Failed to load selected tracks');
    } finally {
      setLoadingRaces(false);
    }
  };

  const fetchTodaysRaces = async () => {
    try {
      const baseUrl = API_ENDPOINTS.sessionBank.replace('/api/session/bank', '');
      const data = await apiFetch<{ success: boolean; races?: any[]; totalRaces?: number }>(
        baseUrl + '/api/form-scraper/today'
      );
      if (data.success && data.races) {
        setTodaysRaces(data.races);
      }
    } catch (err) {
      debug.error('Fetch today races failed:', err);
    }
  };

  const getUniqueTracks = () => {
    const tracks = new Set<string>();
    extractedUrls.forEach((u: any) => {
      if (u.track) tracks.add(u.track);
    });
    return Array.from(tracks).sort();
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
          Knowledge Base
        </Typography>
        <Typography variant="body2" sx={{ color: '#6B7280' }}>
          Real-time form data • Jockey & Trainer statistics • Automatic backups
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {backupSuccess && <Alert severity="success" sx={{ mb: 3 }}>{backupSuccess}</Alert>}

      {/* KB Growth Dashboard */}
      {summary && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 2, mb: 4 }}>
            <Card sx={{ backgroundColor: '#F0FDFA' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 1 }}>
                  RACES IN KB
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#0F766E', mb: 1 }}>
                  {summary.totalRaces}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (summary.totalRaces / 100) * 100)}
                  sx={{ backgroundColor: '#D1FAE5', '& .MuiLinearProgress-bar': { backgroundColor: '#10B981' } }}
                />
                <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mt: 1 }}>
                  Target: 1,000+ races
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ backgroundColor: '#FEF3C7' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 1 }}>
                  JOCKEYS TRACKED
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#D97706', mb: 1 }}>
                  {summary.totalJockeys}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.85rem' }}>
                  Unique jockeys in KB
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ backgroundColor: '#EFF6FF' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 1 }}>
                  TRAINERS TRACKED
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#0284C7', mb: 1 }}>
                  {summary.totalTrainers}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.85rem' }}>
                  Unique trainers in KB
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ backgroundColor: '#F5F3FF' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 1 }}>
                  HORSES TRACKED
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#7C3AED', mb: 1 }}>
                  {summary.totalHorses}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.85rem' }}>
                  Horse-track combinations
                </Typography>
              </CardContent>
            </Card>
          </Box>

          {/* Race Loader Panel */}
          <Card sx={{ mb: 4, backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 3 }}>
                🏁 Today's Races Loader
              </Typography>

              {/* Extract URLs Section */}
              <Box sx={{ mb: 3 }}>
                <Button
                  variant="contained"
                  startIcon={extracting ? <CircularProgress size={20} /> : <RefreshRounded />}
                  onClick={handleExtractUrls}
                  disabled={extracting}
                  sx={{ mb: 2 }}
                >
                  {extracting ? 'Extracting URLs...' : 'Extract Today\'s URLs'}
                </Button>
                {extractedUrls.length > 0 && (
                  <Typography variant="body2" sx={{ color: '#059669', fontWeight: 600 }}>
                    ✓ Found {extractedUrls.length} race URLs
                  </Typography>
                )}
              </Box>

              {/* Track Selection */}
              {extractedUrls.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: '#374151' }}>
                    Select Tracks to Load ({selectedTracks.size} selected):
                  </Typography>
                  <FormGroup sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1 }}>
                    {getUniqueTracks().map((track) => (
                      <FormControlLabel
                        key={track}
                        control={
                          <Checkbox
                            checked={selectedTracks.has(track)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedTracks);
                              if (e.target.checked) {
                                newSelected.add(track);
                              } else {
                                newSelected.delete(track);
                              }
                              setSelectedTracks(newSelected);
                            }}
                          />
                        }
                        label={track}
                      />
                    ))}
                  </FormGroup>
                </Box>
              )}

              {/* Load Selected Tracks Button */}
              {extractedUrls.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={loadingRaces ? <CircularProgress size={20} /> : <RefreshRounded />}
                    onClick={handleLoadSelectedTracks}
                    disabled={loadingRaces || selectedTracks.size === 0}
                  >
                    {loadingRaces ? 'Loading...' : `Load Selected Tracks (${selectedTracks.size})`}
                  </Button>
                  {loadingStatus && (
                    <Typography variant="body2" sx={{ color: '#059669', fontWeight: 600, mt: 1 }}>
                      {loadingStatus}
                    </Typography>
                  )}
                </Box>
              )}

              {/* Today's Races Table */}
              {todaysRaces.length > 0 && (
                <Box sx={{ mt: 4 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: '#374151' }}>
                    Today's Loaded Races ({todaysRaces.length}):
                  </Typography>
                  <TableContainer component={Paper}>
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Track</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600 }}>Race</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600 }}>Distance</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600 }}>Runners</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600 }}>w/ Odds</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {todaysRaces.map((race, idx) => (
                          <TableRow key={idx} sx={{ '&:hover': { backgroundColor: '#F9FAFB' } }}>
                            <TableCell sx={{ fontWeight: 600 }}>{race.track}</TableCell>
                            <TableCell align="center">R{race.race_number}</TableCell>
                            <TableCell align="center">{race.distance}m</TableCell>
                            <TableCell align="center" sx={{ color: '#0284C7', fontWeight: 600 }}>
                              {race.runners}
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={`${race.runners_with_odds}`}
                                size="small"
                                color={race.runners_with_odds > 0 ? 'success' : 'default'}
                                variant="outlined"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Backup Control */}
          <Card sx={{ mb: 4, backgroundColor: '#F9FAFB' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 1 }}>
                    Daily Backups
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#6B7280' }}>
                    KB is automatically backed up daily to /tmp/trackwise-backups/
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={backing ? <CircularProgress size={20} /> : <CloudDownloadRounded />}
                  onClick={handleBackup}
                  disabled={backing}
                >
                  {backing ? 'Backing up...' : 'Manual Backup Now'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </>
      )}

      {/* Top Jockeys */}
      {jockeys.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 3 }}>
              🏇 Top Jockeys by Runs
            </Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Jockey</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Runs</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Wins</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Places</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Win %</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {jockeys.slice(0, 15).map((j) => (
                    <TableRow key={j.name} sx={{ '&:hover': { backgroundColor: '#F9FAFB' } }}>
                      <TableCell sx={{ fontWeight: 600 }}>{j.name}</TableCell>
                      <TableCell align="center">{j.runs}</TableCell>
                      <TableCell align="center" sx={{ color: '#10B981', fontWeight: 600 }}>{j.wins}</TableCell>
                      <TableCell align="center" sx={{ color: '#0284C7', fontWeight: 600 }}>{j.places}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={`${j.winRate}%`}
                          size="small"
                          color={parseFloat(j.winRate) > 20 ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Trainers */}
      {trainers.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 3 }}>
              👔 Top Trainers by Runs
            </Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Trainer</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Runs</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Wins</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Places</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Win %</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {trainers.slice(0, 15).map((t) => (
                    <TableRow key={t.name} sx={{ '&:hover': { backgroundColor: '#F9FAFB' } }}>
                      <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                      <TableCell align="center">{t.runs}</TableCell>
                      <TableCell align="center" sx={{ color: '#10B981', fontWeight: 600 }}>{t.wins}</TableCell>
                      <TableCell align="center" sx={{ color: '#0284C7', fontWeight: 600 }}>{t.places}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={`${t.winRate}%`}
                          size="small"
                          color={parseFloat(t.winRate) > 20 ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Horses */}
      {horses.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 3 }}>
              🐴 Top Horses by Track
            </Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Horse</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Track</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Runs</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Wins</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Places</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Win %</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {horses.slice(0, 20).map((h) => (
                    <TableRow key={`${h.name}-${h.track}`} sx={{ '&:hover': { backgroundColor: '#F9FAFB' } }}>
                      <TableCell sx={{ fontWeight: 600 }}>{h.name}</TableCell>
                      <TableCell>{h.track}</TableCell>
                      <TableCell align="center">{h.runs}</TableCell>
                      <TableCell align="center" sx={{ color: '#10B981', fontWeight: 600 }}>{h.wins}</TableCell>
                      <TableCell align="center" sx={{ color: '#0284C7', fontWeight: 600 }}>{h.places}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={`${h.winRate}%`}
                          size="small"
                          color={parseFloat(h.winRate) > 20 ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default FormHubComponent;
