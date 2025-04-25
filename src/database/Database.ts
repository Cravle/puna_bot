import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the project root directory
// In development: src/database/.. -> src/.. -> project root
// In production: dist/src/database/.. -> dist/src/.. -> dist/.. -> project root
const rootDir = path.resolve(__dirname, '..', '..', '..');

/**
 * Database connection and management class
 */
class Database {
  private dbDir: string;
  private dbPath: string;
  private db: BetterSqlite3.Database;

  constructor() {
    // Always use the project root + data directory regardless of where we're running from
    this.dbDir = path.join(rootDir, 'data');
    this.dbPath = path.join(this.dbDir, 'betting.db');

    // Ensure data directory exists
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }

    console.log(`Using database at: ${this.dbPath}`);
    this.db = new BetterSqlite3(this.dbPath);
    this.initialize();
  }

  /**
   * Initialize database schema if it doesn't exist
   */
  private initialize(): void {
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        balance INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if matches table exists
    const matchesTableExists = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='matches'")
      .get();

    // If matches table exists, check if we need to update the schema
    if (matchesTableExists) {
      try {
        // Try to update a match with 'started' status to see if constraint exists
        const testStmt = this.db.prepare(`
          UPDATE matches SET status = 'started' WHERE 1=0
        `);
        testStmt.run();

        // If no error, create a new table with the correct constraints and migrate data
        this.migrateMatchesTable();
      } catch (error) {
        // If we get here, there was no constraint error - table already has correct schema
        console.log('Matches table already has correct constraints.');
      }
    } else {
      // Create Matches table with correct constraints
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team1 TEXT NOT NULL,
          team2 TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'started', 'done', 'canceled', 'none')),
          winner TEXT,
          match_type TEXT NOT NULL DEFAULT 'team', 
          player1_id TEXT,
          player2_id TEXT,
          game_type TEXT,
          event_title TEXT,
          event_description TEXT,
          participant_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          started_at TIMESTAMP,
          FOREIGN KEY (player1_id) REFERENCES users(id),
          FOREIGN KEY (player2_id) REFERENCES users(id),
          FOREIGN KEY (participant_id) REFERENCES users(id)
        )
      `);
    }

    // Create Events table (separate from matches)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        participant_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        success BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (participant_id) REFERENCES users(id)
      )
    `);

    // Create Bets table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        team TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        boolean_outcome BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (match_id) REFERENCES matches(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create Event Bets table (separate from match bets)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS event_bets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        outcome BOOLEAN NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create Transactions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL,
        reference_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
  }

  /**
   * Migrate matches table to include the correct constraints
   */
  private migrateMatchesTable(): void {
    try {
      console.log('Migrating matches table to update constraints...');
      // Begin a transaction
      this.db.exec('BEGIN TRANSACTION');

      // Create a temporary table with the correct constraints
      this.db.exec(`
        CREATE TABLE matches_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team1 TEXT NOT NULL,
          team2 TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'started', 'done', 'canceled', 'none')),
          winner TEXT,
          match_type TEXT NOT NULL DEFAULT 'team', 
          player1_id TEXT,
          player2_id TEXT,
          game_type TEXT,
          event_title TEXT,
          event_description TEXT,
          participant_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          started_at TIMESTAMP,
          FOREIGN KEY (player1_id) REFERENCES users(id),
          FOREIGN KEY (player2_id) REFERENCES users(id),
          FOREIGN KEY (participant_id) REFERENCES users(id)
        )
      `);

      // Get column names from original table
      const columns = this.db.prepare('PRAGMA table_info(matches)').all();
      const columnNames = columns.map(col => (col as { name: string }).name);

      // Check if started_at column exists, if not, we need to add it
      if (!columnNames.includes('started_at')) {
        // Copy data from old table to new one, setting started_at to null
        this.db.exec(`
          INSERT INTO matches_new (
            id, team1, team2, status, winner, match_type, player1_id, player2_id, 
            game_type, event_title, event_description, participant_id, 
            created_at, updated_at, started_at
          )
          SELECT 
            id, team1, team2, 
            CASE 
              WHEN status NOT IN ('pending', 'started', 'done', 'canceled', 'none') THEN 'pending'
              ELSE status 
            END, 
            winner, match_type, player1_id, player2_id, 
            game_type, event_title, event_description, participant_id, 
            created_at, updated_at, NULL
          FROM matches
        `);
      } else {
        // Copy data from old table to new one, including started_at
        this.db.exec(`
          INSERT INTO matches_new 
          SELECT 
            id, team1, team2, 
            CASE 
              WHEN status NOT IN ('pending', 'started', 'done', 'canceled', 'none') THEN 'pending'
              ELSE status 
            END, 
            winner, match_type, player1_id, player2_id, 
            game_type, event_title, event_description, participant_id, 
            created_at, updated_at, started_at
          FROM matches
        `);
      }

      // Drop the old table
      this.db.exec('DROP TABLE matches');

      // Rename the new table to the original name
      this.db.exec('ALTER TABLE matches_new RENAME TO matches');

      // Commit the transaction
      this.db.exec('COMMIT');
      console.log('Matches table migration completed successfully.');
    } catch (error) {
      console.error('Error migrating matches table:', error);
      this.db.exec('ROLLBACK');
    }
  }

  /**
   * Get the database connection instance
   * @returns {BetterSqlite3.Database} The database connection
   */
  getConnection(): BetterSqlite3.Database {
    return this.db;
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}

// Create a singleton instance
const instance = new Database();

export default instance;
