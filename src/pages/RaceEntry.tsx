import React, { useState } from 'react';
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
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
} from '@mui/material';
import { UploadRounded } from '@mui/icons-material';
import { apiFetch, apiPost } from '@/lib/fetch';
import { API_ENDPOINTS } from '@/config/api';
import { debug } from '@/lib/debug';

interface Pick {
  track: string;
  raceNum: number;
  horse: string;
  jockey: string;
  trainer: string;
  odds: number;
  confidence: number;
}

export const RaceEntry: React.FC = () => {
  const [raceInput, setRaceInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [selectedRunner, setSelectedRunner] = useState<{ horse: string; odds: number } | null>(null);
  const [resultDialog, setResultDialog] = useState(false);
  const [result, setResult] = useState<'WIN' | 'PLACE' | 'LOSS'>('WIN');

  const parseRacingCom = (text: string) => {
    // Remove HTML tags and entities
    const cleanText = text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#?\w+;/g, ' ')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n');

    const runners: any[] = [];
    const lines = cleanText.split('\n');

    // Extract race header info
    let track = '';
    let raceNum = 0;
    let raceTime = '';
    let distance = '';
    let trackCondition = 'Good';

    // Find all occurrences of track names
    const allTracks = ['Pinjarra Park', 'Hawkesbury', 'Sale', 'Moonee Valley', 'Sandown', 'Caulfield', 'Flemington', 'Randwick', 'Rosehill', 'Warwick Farm', 'Newcastle', 'Goulburn', 'Albury', 'Bendigo', 'Ballarat', 'Morphettville', 'Eagle Farm'];
    for (const t of allTracks) {
      if (cleanText.includes(t)) {
        track = t;
        break;
      }
    }

    // Extract race number - look for "Race 6", "Race 7", etc
    const raceMatch = cleanText.match(/Race\s+(\d+)/i);
    if (raceMatch) {
      raceNum = parseInt(raceMatch[1]);
    }

    // Extract time - look for "4:30pm", "13:00", etc
    const timeMatch = cleanText.match(/(\d{1,2}):(\d{2})(?:am|pm|AM|PM|\s|$)/);
    if (timeMatch) {
      raceTime = `${timeMatch[1]}:${timeMatch[2]}`;
    }

    // Extract distance - look for "1500m", "2000m", etc
    const distMatch = cleanText.match(/(\d{4})m/);
    if (distMatch) {
      distance = distMatch[1] + 'm';
    }

    // Extract track condition
    const condMatch = cleanText.match(/(Good|Firm|Soft|Heavy)\s+(\d+)?/);
    if (condMatch) {
      trackCondition = condMatch[1];
    }

    // Parse runners - look for numbered entries
    let currentRunner: any = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match runner line: "1. Crossbow (11)" or "2. Sacrify (6)"
      const runnerMatch = line.match(/^(\d+)\.\s+([^(]+?)\s*(?:\(([^)]*)\))?$/);
      if (runnerMatch && runnerMatch[2].length > 2) {
        if (currentRunner && currentRunner.horseName && currentRunner.jockey && currentRunner.trainer) {
          runners.push(currentRunner);
        }
        const barrierStr = runnerMatch[3];
        const barrier = barrierStr && barrierStr.match(/^\d+$/) ? parseInt(barrierStr) : undefined;
        currentRunner = {
          horseName: runnerMatch[2].trim(),
          barrier,
          weight: undefined,
          jockey: '',
          trainer: '',
          odds: 0,
        };
        continue;
      }

      if (!currentRunner) continue;

      // Extract trainer - match "Trainer:C.J.Waller" or "Trainer: C.J. Waller"
      const trainerMatch = line.match(/Trainer:\s*(.+)$/i);
      if (trainerMatch) {
        currentRunner.trainer = trainerMatch[1].trim();
      }

      // Extract jockey - match "Jockey:S.Grima" or "Jockey: S. Grima"
      const jockeyMatch = line.match(/Jockey:\s*(.+)$/i);
      if (jockeyMatch) {
        currentRunner.jockey = jockeyMatch[1].trim();
      }

      // Extract weight - match "Weight: 61kg" or "Weight:61kg"
      const weightMatch = line.match(/Weight:\s*(\d+(?:\.\d+)?)\s*kg/i);
      if (weightMatch) {
        currentRunner.weight = parseFloat(weightMatch[1]);
      }

      // Extract odds - $26.00 or $1.45 pattern, or standalone number like "26.00"
      const oddsMatch = line.match(/\$?\s*(\d+(?:\.\d+)?)/);
      if (oddsMatch && !currentRunner.odds && parseFloat(oddsMatch[1]) > 0.5) {
        currentRunner.odds = parseFloat(oddsMatch[1]);
      }
    }

    // Add last runner
    if (currentRunner && currentRunner.horseName) {
      // Allow runners with just horse name and one other field
      if ((currentRunner.jockey && currentRunner.jockey.length > 0) ||
          (currentRunner.trainer && currentRunner.trainer.length > 0)) {
        // Set defaults if missing
        if (!currentRunner.jockey) currentRunner.jockey = 'Unknown';
        if (!currentRunner.trainer) currentRunner.trainer = 'Unknown';
        runners.push(currentRunner);
      }
    }

    // Return race if we have valid data
    if (runners.length > 0) {
      return [{
        track: track || 'Unknown',
        raceNum: raceNum || 1,
        raceTime: raceTime || '00:00',
        distance: distance || '1500m',
        trackCondition,
        runners,
      }];
    }

    return null;
  };

  const parseSimpleFormat = (text: string) => {
    // Fallback: simple pipe-delimited format
    // Track,RaceNum,Time|Horse|Barrier|Weight|Jockey|Trainer|Odds
    const lines = text.split('\n').filter(l => l.trim());
    const races: any[] = [];

    let currentRaceInfo: any = null;
    let runners: any[] = [];

    for (const line of lines) {
      if (line.includes('|')) {
        const parts = line.split('|').map(p => p.trim());

        // Check if first part looks like race info
        if (parts[0].match(/\d+:\d+/)) {
          // This is race info: Track,Race,Time
          if (currentRaceInfo && runners.length > 0) {
            races.push({ ...currentRaceInfo, runners });
          }
          const [track, raceNum, time] = parts[0].split(',').map(p => p.trim());
          currentRaceInfo = {
            track: track || 'Unknown',
            raceNum: parseInt(raceNum) || 1,
            raceTime: time || '',
            distance: '1500m',
            trackCondition: 'Good',
          };
          runners = [];
        } else {
          // This is a runner: Horse|Barrier|Weight|Jockey|Trainer|Odds
          runners.push({
            horseName: parts[0],
            barrier: parts[1] ? parseInt(parts[1]) : undefined,
            weight: parts[2] ? parseFloat(parts[2]) : undefined,
            jockey: parts[3] || 'Unknown',
            trainer: parts[4] || 'Unknown',
            odds: parseFloat(parts[5]) || 0,
          });
        }
      }
    }

    if (currentRaceInfo && runners.length > 0) {
      races.push({ ...currentRaceInfo, runners });
    }

    return races.length > 0 ? races : null;
  };

  const addRaces = async () => {
    if (!raceInput.trim()) {
      setError('Paste race URL or data first');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      let textToParse = raceInput;

      // If it's a URL, fetch the content first
      if (raceInput.trim().startsWith('http')) {
        try {
          const scrapeData = await apiFetch<{ success: boolean; html: string }>(
            `${API_ENDPOINTS.dashboard.replace('/api/dashboard', '')}/api/scrape-race?url=${encodeURIComponent(raceInput)}`
          );
          if (scrapeData.success) {
            textToParse = scrapeData.html;
          } else {
            // Fallback: try to fetch directly
            const directText = await apiFetch<string>(raceInput, { parseAs: 'text' });
            textToParse = directText;
          }
        } catch (err) {
          setError('Could not fetch URL. Try pasting the page content instead.');
          setLoading(false);
          return;
        }
      }

      // Try Racing.com format first, then fallback to simple format
      let races = parseRacingCom(textToParse);
      if (!races) {
        races = parseSimpleFormat(textToParse);
      }

      if (!races || races.length === 0) {
        const preview = textToParse.substring(0, 500);
        debug.log('Parse failed. Preview:', preview);
        setError('Could not parse race data. Try: 1) Copy entire page from Racing.com, 2) Paste in simple format (Track,Race,Time | Horse | Barrier | Weight | Jockey | Trainer | Odds)');
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      let totalRunners = 0;

      // Add all races to backend
      for (const race of races) {
        await apiPost(API_ENDPOINTS.dashboard.replace('/api/dashboard', '') + '/api/races/add', {
          date: today,
          track: race.track,
          raceNum: race.raceNum,
          raceTime: race.raceTime,
          runners: race.runners,
        });
        totalRunners += race.runners.length;
      }

      setRaceInput('');
      setSuccess(`✓ Parsed ${races.length} race(s) with ${totalRunners} runners`);

      // Load auto-bets
      try {
        const betsData = await apiFetch<{ success: boolean; picks?: any[] }>(
          API_ENDPOINTS.dashboard.replace('/api/dashboard', '') + '/api/auto-bets'
        );
        if (betsData.success) {
          setPicks(betsData.picks || []);
          if (!betsData.picks || betsData.picks.length === 0) {
            setSuccess(`✓ Added races. No picks yet (build KB with results first).`);
          }
        }
      } catch (err) {
        debug.error('Failed to load auto-bets:', err);
      }
    } catch (err) {
      debug.error('Failed to parse races:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse races');
    } finally {
      setLoading(false);
    }
  };

  const markResult = async () => {
    if (!selectedRunner) return;

    try {
      await apiPost(API_ENDPOINTS.dashboard.replace('/api/dashboard', '') + '/api/runner/result', {
        horseName: selectedRunner.horse,
        jockey: '',
        trainer: '',
        track: '',
        result,
      });

      setResultDialog(false);
      setSelectedRunner(null);
      setSuccess('✓ Result marked. KB updated.');
    } catch (err) {
      debug.error('Failed to mark result:', err);
      setError('Failed to mark result');
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" sx={{ fontWeight: 700, color: '#1F2937', mb: 1 }}>
          Paste Race Card
        </Typography>
        <Typography variant="body2" sx={{ color: '#6B7280' }}>
          Paste from Racing.com race card or use simple format
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

      {/* Input */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 2 }}>
            PASTE RACING.COM RACE CARD OR FORMAT: Track,Race,Time | Horse | Barrier | Weight | Jockey | Trainer | Odds
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={12}
            placeholder="Paste entire race card from racing.com here..."
            value={raceInput}
            onChange={(e) => setRaceInput(e.target.value)}
            sx={{ mb: 2, fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
          <Button
            variant="contained"
            size="large"
            startIcon={loading ? <CircularProgress size={20} /> : <UploadRounded />}
            onClick={addRaces}
            disabled={loading || !raceInput.trim()}
            fullWidth
          >
            {loading ? 'Parsing...' : 'Parse & Generate Picks'}
          </Button>
        </CardContent>
      </Card>

      {/* Picks Table */}
      {picks.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 3 }}>
              Generated Picks ({picks.length})
            </Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Race</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Horse</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Jockey</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Confidence</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Odds</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {picks.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {p.track} R{p.raceNum}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{p.horse}</TableCell>
                      <TableCell>{p.jockey}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={p.confidence}
                            sx={{ flex: 1, width: 60, backgroundColor: '#E5E7EB' }}
                          />
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            {p.confidence}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>${p.odds.toFixed(2)}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setSelectedRunner({ horse: p.horse, odds: p.odds });
                            setResultDialog(true);
                          }}
                        >
                          Result
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Result Dialog */}
      <Dialog open={resultDialog} onClose={() => setResultDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Mark Result for {selectedRunner?.horse}</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" sx={{ mb: 2, color: '#6B7280' }}>
            Odds: ${selectedRunner?.odds.toFixed(2)}
          </Typography>
          <ToggleButtonGroup
            value={result}
            exclusive
            onChange={(_, newResult) => {
              if (newResult) setResult(newResult);
            }}
            fullWidth
          >
            <ToggleButton value="WIN" sx={{ py: 1.5 }}>
              <Typography sx={{ fontWeight: 700, color: '#10B981' }}>WIN</Typography>
            </ToggleButton>
            <ToggleButton value="PLACE" sx={{ py: 1.5 }}>
              <Typography sx={{ fontWeight: 700, color: '#0284C7' }}>PLACE</Typography>
            </ToggleButton>
            <ToggleButton value="LOSS" sx={{ py: 1.5 }}>
              <Typography sx={{ fontWeight: 700, color: '#EF4444' }}>LOSS</Typography>
            </ToggleButton>
          </ToggleButtonGroup>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setResultDialog(false)} variant="outlined">
            Cancel
          </Button>
          <Button onClick={markResult} variant="contained" color="success">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RaceEntry;
