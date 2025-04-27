// Database backup script
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { Logger } from '../utils/Logger.js';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

// Database paths
const dbDir = path.join(projectRoot, 'data');
const dbFile = path.join(dbDir, 'betting.db');
const backupDir = path.join(dbDir, 'backups');

// Ensure backup directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  Logger.info('Backup', `Created backup directory: ${backupDir}`);
}

// Create backup filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `betting-${timestamp}.db`);

// Check if database file exists
if (!fs.existsSync(dbFile)) {
  Logger.error('Backup', `Database file not found: ${dbFile}`);
  process.exit(1);
}

// Create the backup
try {
  // Copy the file while the database is not in use
  fs.copyFileSync(dbFile, backupFile);
  
  // Keep only the 10 most recent backups
  const backups = fs.readdirSync(backupDir)
    .filter(file => file.startsWith('betting-') && file.endsWith('.db'))
    .map(file => path.join(backupDir, file))
    .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
  
  // Delete older backups (keep the 10 most recent)
  if (backups.length > 10) {
    backups.slice(10).forEach(file => {
      fs.unlinkSync(file);
      Logger.info('Backup', `Deleted old backup: ${file}`);
    });
  }
  
  Logger.success('Backup', `Database backup created: ${backupFile}`);
  console.log(`Backup created: ${backupFile}`);
} catch (error) {
  Logger.error('Backup', `Backup failed: ${error}`);
  console.error(`Backup failed: ${error}`);
  process.exit(1);
} 