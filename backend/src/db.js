import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/trackwise.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initializeDatabase() {
  // Horses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS horses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER,
      sex TEXT,
      colour TEXT,
      sire TEXT,
      dam TEXT,
      damsire TEXT,
      career_wins INTEGER DEFAULT 0,
      career_places INTEGER DEFAULT 0,
      career_bets INTEGER DEFAULT 0,
      career_stake REAL DEFAULT 0,
      career_return REAL DEFAULT 0,
      avg_odds REAL,
      strike_rate REAL,
      place_rate REAL,
      roi REAL,
      form_score INTEGER,
      class_rating REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name)
    )
  `);

  // Jockeys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS jockeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      career_wins INTEGER DEFAULT 0,
      career_places INTEGER DEFAULT 0,
      career_bets INTEGER DEFAULT 0,
      career_stake REAL DEFAULT 0,
      career_return REAL DEFAULT 0,
      strike_rate REAL,
      place_rate REAL,
      roi REAL,
      tier TEXT DEFAULT 'UNKNOWN',
      recent_form REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Trainers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS trainers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      career_wins INTEGER DEFAULT 0,
      career_places INTEGER DEFAULT 0,
      career_bets INTEGER DEFAULT 0,
      career_stake REAL DEFAULT 0,
      career_return REAL DEFAULT 0,
      strike_rate REAL,
      place_rate REAL,
      roi REAL,
      tier TEXT DEFAULT 'UNKNOWN',
      recent_form REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Races table
  db.exec(`
    CREATE TABLE IF NOT EXISTS races (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track TEXT NOT NULL,
      date DATE NOT NULL,
      race_number INTEGER NOT NULL,
      race_name TEXT,
      race_time TEXT,
      distance INTEGER,
      condition TEXT,
      track_condition TEXT,
      prize_pool REAL,
      meeting_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(track, date, race_number)
    )
  `);

  // Race runners table
  db.exec(`
    CREATE TABLE IF NOT EXISTS race_runners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      race_id INTEGER NOT NULL,
      horse_id INTEGER NOT NULL,
      jockey_id INTEGER,
      trainer_id INTEGER,
      barrier INTEGER,
      weight REAL,
      finishing_position INTEGER,
      starting_odds REAL,
      closing_odds REAL,
      result TEXT,
      form_score INTEGER,
      class_rating REAL,
      FOREIGN KEY(race_id) REFERENCES races(id),
      FOREIGN KEY(horse_id) REFERENCES horses(id),
      FOREIGN KEY(jockey_id) REFERENCES jockeys(id),
      FOREIGN KEY(trainer_id) REFERENCES trainers(id)
    )
  `);

  // Bets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      race_id INTEGER NOT NULL,
      horse_id INTEGER NOT NULL,
      jockey_id INTEGER,
      trainer_id INTEGER,
      bet_type TEXT NOT NULL,
      stake REAL NOT NULL,
      opening_odds REAL,
      closing_odds REAL,
      ev_percent REAL,
      clv_percent REAL,
      status TEXT DEFAULT 'ACTIVE',
      result TEXT,
      return_amount REAL,
      profit_loss REAL,
      confidence INTEGER,
      placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      settled_at DATETIME,
      FOREIGN KEY(race_id) REFERENCES races(id),
      FOREIGN KEY(horse_id) REFERENCES horses(id),
      FOREIGN KEY(jockey_id) REFERENCES jockeys(id),
      FOREIGN KEY(trainer_id) REFERENCES trainers(id)
    )
  `);

  // Knowledge Base aggregate stats
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stat_type TEXT NOT NULL,
      stat_key TEXT NOT NULL,
      bets INTEGER,
      wins INTEGER,
      places INTEGER,
      stake REAL,
      return_amount REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(stat_type, stat_key)
    )
  `);

  // Commission configuration and tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS commission_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exchange TEXT NOT NULL UNIQUE,
      commission_rate REAL NOT NULL,
      effective_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT
    )
  `);

  // Commission tracking per bet
  db.exec(`
    CREATE TABLE IF NOT EXISTS commission_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bet_id INTEGER NOT NULL,
      gross_return REAL,
      gross_profit REAL,
      commission_paid REAL,
      commission_rate REAL,
      net_profit REAL,
      net_roi REAL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(bet_id) REFERENCES bets(id)
    )
  `);

  // Daily commission summary
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_commission_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL UNIQUE,
      bets_placed INTEGER DEFAULT 0,
      bets_settled INTEGER DEFAULT 0,
      total_stakes REAL DEFAULT 0,
      gross_return REAL DEFAULT 0,
      gross_profit REAL DEFAULT 0,
      commission_paid REAL DEFAULT 0,
      net_profit REAL DEFAULT 0,
      gross_roi REAL DEFAULT 0,
      net_roi REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Initialize Sportsbet commission if not exists
  const commissionCheck = db.prepare('SELECT COUNT(*) as count FROM commission_config WHERE exchange = ?').get('sportsbet');
  if (commissionCheck.count === 0) {
    db.prepare(`
      INSERT INTO commission_config (exchange, commission_rate, notes)
      VALUES (?, ?, ?)
    `).run('sportsbet', 0.10, 'Australian racing: 10% standard rate (varies 7-10% by state)');
  }

  // Error logging table
  db.exec(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_type TEXT NOT NULL,
      message TEXT NOT NULL,
      context TEXT,
      severity TEXT DEFAULT 'LOW',
      logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved BOOLEAN DEFAULT 0
    )
  `);

  // Scheduler job logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduler_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER,
      error TEXT,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Scheduler job tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduler_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'IDLE',
      last_run DATETIME,
      last_error TEXT,
      next_run DATETIME,
      run_count INTEGER DEFAULT 0
    )
  `);

  // Operation logs (bet operations, KB updates, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      operation TEXT NOT NULL,
      details TEXT,
      logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // API request logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      status_code INTEGER,
      duration_ms INTEGER,
      error TEXT,
      logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Model prediction logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      horse_id INTEGER NOT NULL,
      confidence REAL,
      odds REAL,
      result TEXT,
      logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(horse_id) REFERENCES horses(id)
    )
  `);

  console.log('✅ Database initialized');
}

export default db;
