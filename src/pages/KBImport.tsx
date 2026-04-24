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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import { UploadRounded } from '@mui/icons-material';

export const KBImport: React.FC = () => {
  const [importData, setImportData] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stats, setStats] = useState<{
    racesProcessed: number;
    statsUpdated: number;
  } | null>(null);

  const importJSON = async () => {
    if (!importData.trim()) {
      setError('Paste JSON data first');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      let data;
      try {
        data = JSON.parse(importData);
      } catch (e) {
        setError('Invalid JSON format');
        setLoading(false);
        return;
      }

      const res = await fetch('http://localhost:3001/api/kb/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      if (result.success) {
        setSuccess(`✓ ${result.message}`);
        setStats({
          racesProcessed: result.racesProcessed,
          statsUpdated: result.statsUpdated,
        });
        setImportData('');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" sx={{ fontWeight: 700, color: '#1F2937', mb: 1 }}>
          Import Historical Data
        </Typography>
        <Typography variant="body2" sx={{ color: '#6B7280' }}>
          Populate the Knowledge Base with historical race results
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

      {/* Format Guide */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 2 }}>
            JSON Format
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280', mb: 2, fontFamily: 'monospace' }}>
            Paste an array of races with results:
          </Typography>
          <Paper sx={{ p: 2, backgroundColor: '#F3F4F6', mb: 2 }}>
            <code style={{ fontSize: '0.85rem', color: '#1F2937' }}>
{`[
  {
    "date": "2026-04-01",
    "track": "Caulfield",
    "raceNum": 1,
    "runners": [
      {
        "horseName": "Thunder",
        "jockey": "Smith",
        "trainer": "Jones",
        "result": "WIN"
      },
      {
        "horseName": "Lightning",
        "jockey": "Brown",
        "trainer": "Lee",
        "result": "PLACE"
      }
    ]
  }
]`}
            </code>
          </Paper>
          <Typography variant="caption" sx={{ color: '#6B7280' }}>
            Result must be: WIN, PLACE, or LOSS
          </Typography>
        </CardContent>
      </Card>

      {/* Import Input */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1F2937', mb: 2 }}>
            Paste JSON Data
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={12}
            placeholder="Paste JSON array here..."
            value={importData}
            onChange={(e) => setImportData(e.target.value)}
            sx={{ mb: 2, fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
          <Button
            variant="contained"
            size="large"
            startIcon={loading ? <CircularProgress size={20} /> : <UploadRounded />}
            onClick={importJSON}
            disabled={loading || !importData.trim()}
            fullWidth
          >
            {loading ? 'Importing...' : 'Import to KB'}
          </Button>
        </CardContent>
      </Card>

      {/* Import Results */}
      {stats && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F2937', mb: 3 }}>
              Import Summary
            </Typography>
            <TableContainer component={Paper}>
              <Table>
                <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Metric</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Count</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>Races Imported</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {stats.racesProcessed}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Stats Updated (jockey/trainer/horse)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {stats.statsUpdated}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="body2" sx={{ color: '#6B7280', mt: 2 }}>
              ✓ Knowledge Base populated. Go to Race Entry to see recommendations!
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default KBImport;
