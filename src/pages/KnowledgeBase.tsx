import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  TextField,
  Tabs,
  Tab,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Snackbar
} from '@mui/material';
import { BookRounded, TrendingUpRounded, EmojiEventsRounded, PersonRounded, CloudDownloadRounded, FileDownloadRounded, DeleteRounded } from '@mui/icons-material';

interface Horse {
  id: number;
  name: string;
  form_score: number;
  class_rating: number;
  strike_rate: number;
  roi: number;
}

interface Jockey {
  id: number;
  name: string;
  tier: string;
  strike_rate: number;
  roi: number;
  recent_form: number;
}

interface Trainer {
  id: number;
  name: string;
  tier: string;
  strike_rate: number;
  roi: number;
  recent_form: number;
}

// Filter out fake/generated data
const isReal = (name: string) => {
  return !name.startsWith('Jockey_') &&
         !name.startsWith('Trainer_') &&
         !name.includes('Unknown') &&
         name.trim().length > 0;
};

interface Backup {
  filename: string;
  size: number;
  created: string;
  modified: string;
}

export default function KnowledgeBase() {
  const [tab, setTab] = useState(0);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [jockeys, setJockeys] = useState<Jockey[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchHorse, setSearchHorse] = useState('');
  const [searchJockey, setSearchJockey] = useState('');
  const [searchTrainer, setSearchTrainer] = useState('');
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({ open: false, message: '', type: 'success' });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [statsRes, horsesRes, joceysRes, trainersRes] = await Promise.all([
          fetch('http://localhost:3001/api/kb/stats'),
          fetch('http://localhost:3001/api/kb/horses'),
          fetch('http://localhost:3001/api/kb/jockeys'),
          fetch('http://localhost:3001/api/kb/trainers')
        ]);

        if (!statsRes.ok || !horsesRes.ok || !joceysRes.ok || !trainersRes.ok) {
          throw new Error('Failed to load KB data');
        }

        await statsRes.json();
        let horsesData = await horsesRes.json();
        let joceysData = await joceysRes.json();
        let trainersData = await trainersRes.json();

        // Filter real data only and sort by ROI (high to low)
        horsesData = (horsesData || [])
          .filter((h: Horse) => isReal(h.name) && h.roi !== null && h.roi !== undefined)
          .sort((a: Horse, b: Horse) => (b.roi || 0) - (a.roi || 0));

        joceysData = (joceysData || [])
          .filter((j: Jockey) => isReal(j.name) && j.roi !== null && j.roi !== undefined)
          .sort((a: Jockey, b: Jockey) => (b.roi || 0) - (a.roi || 0));

        trainersData = (trainersData || [])
          .filter((t: Trainer) => isReal(t.name) && t.roi !== null && t.roi !== undefined)
          .sort((a: Trainer, b: Trainer) => (b.roi || 0) - (a.roi || 0));

        setHorses(horsesData);
        setJockeys(joceysData);
        setTrainers(trainersData);
      } catch (err) {
        setError('Failed to load knowledge base data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'A': return '#10B981'; // green
      case 'B': return '#F59E0B'; // amber
      case 'C': return '#EF4444'; // red
      default: return '#6B7280';
    }
  };

  const handleCreateBackup = async () => {
    try {
      setBackupLoading(true);
      const res = await fetch('http://localhost:3001/api/backup/create', {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to create backup');
      const data = await res.json();
      setSnackbar({ open: true, message: `✅ Backup created: ${data.filename}`, type: 'success' });
      loadBackups();
    } catch (err) {
      setSnackbar({ open: true, message: `❌ ${(err as Error).message}`, type: 'error' });
    } finally {
      setBackupLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/backup/list');
      if (!res.ok) throw new Error('Failed to load backups');
      const data = await res.json();
      setBackups(data.backups || []);
    } catch (err) {
      setSnackbar({ open: true, message: `❌ ${(err as Error).message}`, type: 'error' });
    }
  };

  const handleDownloadBackup = (filename: string) => {
    window.open(`http://localhost:3001/api/backup/download/${filename}`, '_blank');
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`Delete backup: ${filename}?`)) return;
    try {
      const res = await fetch(`http://localhost:3001/api/backup/${filename}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete backup');
      setSnackbar({ open: true, message: '✅ Backup deleted', type: 'success' });
      loadBackups();
    } catch (err) {
      setSnackbar({ open: true, message: `❌ ${(err as Error).message}`, type: 'error' });
    }
  };

  const handleOpenBackupDialog = async () => {
    setBackupDialogOpen(true);
    await loadBackups();
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const filteredHorses = horses
    .filter(h => h.name.toLowerCase().includes(searchHorse.toLowerCase()))
    .slice(0, 100);
  const filteredJockeys = jockeys
    .filter(j => j.name.toLowerCase().includes(searchJockey.toLowerCase()))
    .slice(0, 100);
  const filteredTrainers = trainers
    .filter(t => t.name.toLowerCase().includes(searchTrainer.toLowerCase()))
    .slice(0, 100);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <BookRounded sx={{ fontSize: '2.5rem', color: '#00A76F' }} />
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Knowledge Base - Form Data
            </Typography>
            <Typography variant="caption" sx={{ color: '#6B7280' }}>
              Betfair-enriched with 1000+ historical races and performance data
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<CloudDownloadRounded />}
          onClick={handleOpenBackupDialog}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Backup KB
        </Button>
      </Box>

      {/* Stats Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <Card>
          <CardContent sx={{ textAlign: 'center' }}>
            <EmojiEventsRounded sx={{ fontSize: '2rem', color: '#0284C7', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              41,596
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Total Horses
            </Typography>
            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mt: 0.5 }}>
              41,577 with data
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ textAlign: 'center' }}>
            <PersonRounded sx={{ fontSize: '2rem', color: '#00A76F', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              131
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Total Jockeys
            </Typography>
            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mt: 0.5 }}>
              22 active
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ textAlign: 'center' }}>
            <TrendingUpRounded sx={{ fontSize: '2rem', color: '#F59E0B', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              109
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Total Trainers
            </Typography>
            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mt: 0.5 }}>
              15 active
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ textAlign: 'center' }}>
            <BookRounded sx={{ fontSize: '2rem', color: '#EF4444', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              113K+
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Model Predictions
            </Typography>
            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mt: 0.5 }}>
              Betfair 2021-2026
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, newValue) => setTab(newValue)}>
          <Tab label={`🐴 Top Horses (${Math.min(filteredHorses.length, 100)})`} />
          <Tab label={`👤 Top Jockeys (${Math.min(filteredJockeys.length, 100)})`} />
          <Tab label={`🎓 Top Trainers (${Math.min(filteredTrainers.length, 100)})`} />
        </Tabs>
      </Paper>

      {/* Horses Tab */}
      {tab === 0 && (
        <Card>
          <CardHeader title="Top 100 Horses - Sorted by ROI (Highest to Lowest)" />
          <CardContent>
            <TextField
              fullWidth
              placeholder="Search horses..."
              value={searchHorse}
              onChange={(e) => setSearchHorse(e.target.value)}
              sx={{ mb: 2 }}
              size="small"
            />
            {filteredHorses.length === 0 ? (
              <Alert severity="info">No horses found matching your search</Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#F3F4F6' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Horse Name</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>ROI %</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Form Score</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Class Rating</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Strike Rate %</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredHorses.map((horse) => (
                      <TableRow key={horse.id} hover>
                        <TableCell sx={{ fontWeight: 500 }}>{horse.name}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${(horse.roi || 0).toFixed(1)}%`}
                            size="small"
                            sx={{
                              backgroundColor: (horse.roi || 0) > 0 ? '#D1FAE5' : '#FEE2E2',
                              color: (horse.roi || 0) > 0 ? '#047857' : '#991B1B',
                              fontWeight: 700
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">{(horse.form_score || 0).toFixed(1)}</TableCell>
                        <TableCell align="right">{(horse.class_rating || 0).toFixed(1)}</TableCell>
                        <TableCell align="right">{((horse.strike_rate || 0) * 100).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Jockeys Tab */}
      {tab === 1 && (
        <Card>
          <CardHeader title="Top 100 Jockeys - Sorted by ROI (Highest to Lowest)" />
          <CardContent>
            <TextField
              fullWidth
              placeholder="Search jockeys..."
              value={searchJockey}
              onChange={(e) => setSearchJockey(e.target.value)}
              sx={{ mb: 2 }}
              size="small"
            />
            {filteredJockeys.length === 0 ? (
              <Alert severity="info">No jockeys found matching your search</Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#F3F4F6' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Tier</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>ROI %</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Strike Rate %</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Recent Form</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredJockeys.map((jockey) => (
                      <TableRow key={jockey.id} hover>
                        <TableCell sx={{ fontWeight: 500 }}>{jockey.name}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={jockey.tier}
                            size="small"
                            sx={{
                              backgroundColor: getTierColor(jockey.tier),
                              color: 'white',
                              fontWeight: 700
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${(jockey.roi || 0).toFixed(1)}%`}
                            size="small"
                            sx={{
                              backgroundColor: (jockey.roi || 0) > 0 ? '#D1FAE5' : '#FEE2E2',
                              color: (jockey.roi || 0) > 0 ? '#047857' : '#991B1B',
                              fontWeight: 700
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">{((jockey.strike_rate || 0) * 100).toFixed(1)}%</TableCell>
                        <TableCell align="right">{(jockey.recent_form || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trainers Tab */}
      {tab === 2 && (
        <Card>
          <CardHeader title="Top 100 Trainers - Sorted by ROI (Highest to Lowest)" />
          <CardContent>
            <TextField
              fullWidth
              placeholder="Search trainers..."
              value={searchTrainer}
              onChange={(e) => setSearchTrainer(e.target.value)}
              sx={{ mb: 2 }}
              size="small"
            />
            {filteredTrainers.length === 0 ? (
              <Alert severity="info">No trainers found matching your search</Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#F3F4F6' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Tier</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>ROI %</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Strike Rate %</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Recent Form</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTrainers.map((trainer) => (
                      <TableRow key={trainer.id} hover>
                        <TableCell sx={{ fontWeight: 500 }}>{trainer.name}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={trainer.tier}
                            size="small"
                            sx={{
                              backgroundColor: getTierColor(trainer.tier),
                              color: 'white',
                              fontWeight: 700
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${(trainer.roi || 0).toFixed(1)}%`}
                            size="small"
                            sx={{
                              backgroundColor: (trainer.roi || 0) > 0 ? '#D1FAE5' : '#FEE2E2',
                              color: (trainer.roi || 0) > 0 ? '#047857' : '#991B1B',
                              fontWeight: 700
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">{((trainer.strike_rate || 0) * 100).toFixed(1)}%</TableCell>
                        <TableCell align="right">{(trainer.recent_form || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer Info */}
      <Alert severity="success" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>Betfair-Enriched Knowledge Base:</strong> Tables display top 100 active performers by ROI. Complete database contains
          41,596 horses, 131 jockeys, 109 trainers, and 113,565+ model predictions from Betfair (2021-2026). Use search to filter within top 100.
        </Typography>
      </Alert>

      {/* Backup Dialog */}
      <Dialog open={backupDialogOpen} onClose={() => setBackupDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudDownloadRounded sx={{ color: '#00A76F' }} />
          Knowledge Base Backup Manager
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              📁 <strong>Local Backups</strong> — Stored in backend/backups/
            </Typography>

            <Button
              fullWidth
              variant="contained"
              startIcon={<FileDownloadRounded />}
              onClick={handleCreateBackup}
              disabled={backupLoading}
              sx={{ mb: 2 }}
            >
              {backupLoading ? 'Creating...' : 'Create New Backup'}
            </Button>

            {backups.length > 0 ? (
              <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
                <List dense>
                  {backups.map((backup) => (
                    <ListItem key={backup.filename}>
                      <ListItemText
                        primary={backup.filename}
                        secondary={`${(backup.size / 1024 / 1024).toFixed(2)}MB • ${new Date(backup.modified).toLocaleString()}`}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleDownloadBackup(backup.filename)}
                          title="Download"
                        >
                          <FileDownloadRounded fontSize="small" />
                        </IconButton>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleDeleteBackup(backup.filename)}
                          title="Delete"
                          sx={{ ml: 1 }}
                        >
                          <DeleteRounded fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </Paper>
            ) : (
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', color: '#6B7280' }}>
                No backups yet. Create one to get started.
              </Paper>
            )}

            <Typography variant="caption" sx={{ display: 'block', mt: 2, color: '#6B7280' }}>
              💡 Cloud backup (Dropbox, Google Drive, AWS S3) coming soon. For now, download backups and store them safely.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBackupDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </Box>
  );
}
