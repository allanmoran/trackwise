import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/trackwise.db');
const backupDir = path.join(__dirname, '../../backups');

// Ensure backups directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

/**
 * POST /api/backup/create
 * Create a backup of the KB database
 */
router.post('/create', (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `trackwise-kb-${timestamp}.db`;
    const backupPath = path.join(backupDir, backupName);

    // Copy database file
    fs.copyFileSync(dbPath, backupPath);

    res.json({
      success: true,
      message: 'Backup created successfully',
      filename: backupName,
      path: backupPath,
      timestamp: new Date().toISOString(),
      size: fs.statSync(backupPath).size
    });
  } catch (err) {
    console.error('Backup creation error:', err);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

/**
 * GET /api/backup/list
 * List all available backups
 */
router.get('/list', (req, res) => {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const filePath = path.join(backupDir, f);
        const stat = fs.statSync(filePath);
        return {
          filename: f,
          size: stat.size,
          created: stat.birthtime,
          modified: stat.mtime
        };
      })
      .sort((a, b) => b.modified - a.modified);

    res.json({
      success: true,
      count: files.length,
      backups: files
    });
  } catch (err) {
    console.error('Backup listing error:', err);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

/**
 * GET /api/backup/download/:filename
 * Download a backup file
 */
router.get('/download/:filename', (req, res) => {
  try {
    const { filename } = req.params;

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const backupPath = path.join(backupDir, filename);

    // Verify file exists and is in backups directory
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    // Check if path is actually in backups directory
    const realPath = fs.realpathSync(backupPath);
    const realBackupDir = fs.realpathSync(backupDir);
    if (!realPath.startsWith(realBackupDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.download(backupPath, filename);
  } catch (err) {
    console.error('Backup download error:', err);
    res.status(500).json({ error: 'Failed to download backup' });
  }
});

/**
 * POST /api/backup/restore/:filename
 * Restore from a backup (creates backup of current before restoring)
 */
router.post('/restore/:filename', (req, res) => {
  try {
    const { filename } = req.params;

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const backupPath = path.join(backupDir, filename);

    // Verify file exists
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    // Create safety backup of current state
    const safetyTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safetyPath = path.join(backupDir, `trackwise-kb-pre-restore-${safetyTimestamp}.db`);
    fs.copyFileSync(dbPath, safetyPath);

    // Restore the backup
    fs.copyFileSync(backupPath, dbPath);

    res.json({
      success: true,
      message: 'Restored successfully',
      restoredFrom: filename,
      safetyBackup: `trackwise-kb-pre-restore-${safetyTimestamp}.db`,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Backup restore error:', err);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

/**
 * DELETE /api/backup/:filename
 * Delete a backup file
 */
router.delete('/:filename', (req, res) => {
  try {
    const { filename } = req.params;

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const backupPath = path.join(backupDir, filename);

    // Verify file exists
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    fs.unlinkSync(backupPath);

    res.json({
      success: true,
      message: 'Backup deleted',
      filename
    });
  } catch (err) {
    console.error('Backup deletion error:', err);
    res.status(500).json({ error: 'Failed to delete backup' });
  }
});

export default router;
