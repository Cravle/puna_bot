import db from '../database/Database.js';
import { Logger } from '../utils/Logger.js';

/**
 * Migration script to fix match status constraint in the database
 */
async function fixMatchStatusConstraint() {
  try {
    // Begin a transaction
    const connection = db.getConnection();
    connection.exec('BEGIN TRANSACTION');

    // Check if database has matches table
    const tableExists = connection.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='matches'
    `).get();

    if (!tableExists) {
      Logger.info('Migration', 'Matches table does not exist. Nothing to migrate.');
      return;
    }

    // Create a temporary table with the correct constraints
    connection.exec(`
      CREATE TABLE IF NOT EXISTS matches_new (
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

    // Copy data from the old table to the new one
    connection.exec(`
      INSERT INTO matches_new 
      SELECT id, team1, team2, 
        CASE 
          WHEN status NOT IN ('pending', 'started', 'done', 'canceled', 'none') THEN 'pending'
          ELSE status 
        END as status,
        winner, match_type, player1_id, player2_id, game_type, event_title, event_description, participant_id, 
        created_at, updated_at, started_at
      FROM matches
    `);

    // Drop the old table
    connection.exec('DROP TABLE matches');

    // Rename the new table to the original name
    connection.exec('ALTER TABLE matches_new RENAME TO matches');

    // Commit the transaction
    connection.exec('COMMIT');

    Logger.success('Migration', 'Successfully updated match status constraints');
  } catch (error) {
    Logger.error('Migration', 'Error updating match status constraints', error);
    db.getConnection().exec('ROLLBACK');
    throw error;
  }
}

// Run the migration
fixMatchStatusConstraint()
  .then(() => {
    Logger.success('Migration', 'Database migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    Logger.error('Migration', 'Database migration failed', error);
    process.exit(1);
  }); 