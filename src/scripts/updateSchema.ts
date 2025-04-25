import db from '../database/Database.js';
import { Logger } from '../utils/Logger.js';

/**
 * Update the database schema to add missing columns
 */
function updateSchema() {
  const connection = db.getConnection();

  try {
    // Start a transaction
    connection.exec('BEGIN TRANSACTION');

    // Check if match_type column exists in matches table
    const matchTypeExists = connection
      .prepare('PRAGMA table_info(matches)')
      .all()
      .some((col: any) => col.name === 'match_type');

    if (!matchTypeExists) {
      Logger.info('Migration', 'Adding match_type column to matches table');
      connection.exec('ALTER TABLE matches ADD COLUMN match_type TEXT DEFAULT "team"');
    }

    // Check if player1_id column exists in matches table
    const player1IdExists = connection
      .prepare('PRAGMA table_info(matches)')
      .all()
      .some((col: any) => col.name === 'player1_id');

    if (!player1IdExists) {
      Logger.info('Migration', 'Adding player1_id column to matches table');
      connection.exec('ALTER TABLE matches ADD COLUMN player1_id TEXT');
    }

    // Check if player2_id column exists in matches table
    const player2IdExists = connection
      .prepare('PRAGMA table_info(matches)')
      .all()
      .some((col: any) => col.name === 'player2_id');

    if (!player2IdExists) {
      Logger.info('Migration', 'Adding player2_id column to matches table');
      connection.exec('ALTER TABLE matches ADD COLUMN player2_id TEXT');
    }

    // Check if game_type column exists in matches table
    const gameTypeExists = connection
      .prepare('PRAGMA table_info(matches)')
      .all()
      .some((col: any) => col.name === 'game_type');

    if (!gameTypeExists) {
      Logger.info('Migration', 'Adding game_type column to matches table');
      connection.exec('ALTER TABLE matches ADD COLUMN game_type TEXT');
    }

    // Check if event_title column exists in matches table
    const eventTitleExists = connection
      .prepare('PRAGMA table_info(matches)')
      .all()
      .some((col: any) => col.name === 'event_title');

    if (!eventTitleExists) {
      Logger.info('Migration', 'Adding event_title column to matches table');
      connection.exec('ALTER TABLE matches ADD COLUMN event_title TEXT');
    }

    // Check if event_description column exists in matches table
    const eventDescriptionExists = connection
      .prepare('PRAGMA table_info(matches)')
      .all()
      .some((col: any) => col.name === 'event_description');

    if (!eventDescriptionExists) {
      Logger.info('Migration', 'Adding event_description column to matches table');
      connection.exec('ALTER TABLE matches ADD COLUMN event_description TEXT');
    }

    // Check if participant_id column exists in matches table
    const participantIdExists = connection
      .prepare('PRAGMA table_info(matches)')
      .all()
      .some((col: any) => col.name === 'participant_id');

    if (!participantIdExists) {
      Logger.info('Migration', 'Adding participant_id column to matches table');
      connection.exec('ALTER TABLE matches ADD COLUMN participant_id TEXT');
    }

    // Check if started_at column exists in matches table
    const startedAtExists = connection
      .prepare('PRAGMA table_info(matches)')
      .all()
      .some((col: any) => col.name === 'started_at');

    if (!startedAtExists) {
      Logger.info('Migration', 'Adding started_at column to matches table');
      connection.exec('ALTER TABLE matches ADD COLUMN started_at TIMESTAMP');
    }

    // Commit the transaction
    connection.exec('COMMIT');

    Logger.success('Migration', 'Database schema update completed successfully');
  } catch (error) {
    // Rollback on error
    connection.exec('ROLLBACK');
    Logger.error('Migration', `Error updating database schema: ${error}`);
    throw error;
  }
}

// Run the schema update
updateSchema();

// Export the function for potential programmatic use
export { updateSchema };
