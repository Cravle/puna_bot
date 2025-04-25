const BetterSqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Database connection and management class
 */
class Database {
  constructor() {
    this.dbDir = path.join(__dirname, '..', '..', 'data');
    this.dbPath = path.join(this.dbDir, 'betting.db');
    
    // Ensure data directory exists
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }
    
    this.db = new BetterSqlite3(this.dbPath);
    this.initialize();
  }
  
  /**
   * Initialize database schema if it doesn't exist
   */
  initialize() {
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    // Create Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        balance INTEGER NOT NULL DEFAULT 1000,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create Matches table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL CHECK(status IN ('pending', 'done', 'canceled', 'none')) DEFAULT 'none',
        team1 TEXT,
        team2 TEXT,
        winner TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create Bets table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        match_id INTEGER NOT NULL,
        team TEXT NOT NULL,
        amount INTEGER NOT NULL,
        result TEXT CHECK(result IN ('win', 'loss', 'refund', 'pending')) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
      )
    `);
    
    // Create Transactions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('init', 'bet', 'payout', 'refund', 'donate')),
        reference_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }
  
  /**
   * Get the database connection instance
   * @returns {BetterSqlite3.Database} The database connection
   */
  getConnection() {
    return this.db;
  }
  
  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// Create a singleton instance
const instance = new Database();

module.exports = instance; 