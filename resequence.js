import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to the database
const dbPath = path.join(__dirname, 'data', 'betting.db');
console.log(`Connecting to database at: ${dbPath}`);
const db = new Database(dbPath);

try {
  // Begin transaction
  db.prepare('BEGIN TRANSACTION').run();
  
  // Get current matches
  const currentMatches = db.prepare(`
    SELECT id, team1, team2, status, match_type, winner, 
           player1_id, player2_id, game_type, event_title, 
           event_description, participant_id, created_at, 
           updated_at, started_at 
    FROM matches 
    ORDER BY id
  `).all();
  
  console.log('Current matches:');
  console.table(currentMatches);
  
  // Create a mapping of old IDs to new IDs
  const idMapping = {};
  currentMatches.forEach((match, index) => {
    idMapping[match.id] = index + 1; // New IDs start from 1
  });
  
  console.log('ID mapping:');
  console.log(idMapping);
  
  // Get references in bets table
  const bets = db.prepare(`
    SELECT id, match_id 
    FROM bets 
    WHERE match_id IN (${Object.keys(idMapping).join(',')})
  `).all();
  
  console.log(`Found ${bets.length} bets that need updating`);
  
  // Get references in transactions table
  const transactions = db.prepare(`
    SELECT id, reference_id 
    FROM transactions 
    WHERE type = 'bet' AND reference_id IN (
      SELECT id FROM bets WHERE match_id IN (${Object.keys(idMapping).join(',')})
    )
  `).all();
  
  console.log(`Found ${transactions.length} transactions that need updating`);
  
  // Create temporary table for matches
  db.prepare(`
    CREATE TABLE matches_temp (
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
  `).run();
  
  // Insert matches with new IDs
  const insertStmt = db.prepare(`
    INSERT INTO matches_temp (
      id, team1, team2, status, winner, match_type, 
      player1_id, player2_id, game_type, event_title, 
      event_description, participant_id, created_at, 
      updated_at, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  currentMatches.forEach((match, index) => {
    const newId = index + 1;
    insertStmt.run(
      newId,
      match.team1,
      match.team2,
      match.status,
      match.winner,
      match.match_type,
      match.player1_id,
      match.player2_id,
      match.game_type,
      match.event_title,
      match.event_description,
      match.participant_id,
      match.created_at,
      match.updated_at,
      match.started_at
    );
    console.log(`Inserted match with new ID: ${newId} (was ${match.id})`);
  });
  
  // Update bets table references
  if (bets.length > 0) {
    const updateBetsStmt = db.prepare(`
      UPDATE bets 
      SET match_id = ? 
      WHERE match_id = ?
    `);
    
    for (const oldId in idMapping) {
      const newId = idMapping[oldId];
      const result = updateBetsStmt.run(newId, oldId);
      console.log(`Updated ${result.changes} bets from match_id ${oldId} to ${newId}`);
    }
  }
  
  // Swap tables
  db.prepare('DROP TABLE matches').run();
  db.prepare('ALTER TABLE matches_temp RENAME TO matches').run();
  
  // Verify the new order
  const newMatches = db.prepare(`
    SELECT id, team1, team2, status, match_type, winner
    FROM matches 
    ORDER BY id
  `).all();
  
  console.log('New matches with resequenced IDs:');
  console.table(newMatches);
  
  // Reset SQLite sequence
  db.prepare(`UPDATE sqlite_sequence SET seq = ? WHERE name = 'matches'`).run(newMatches.length);
  
  // Commit changes
  db.prepare('COMMIT').run();
  console.log('Database resequencing completed successfully!');
  
} catch (error) {
  // Rollback on error
  db.prepare('ROLLBACK').run();
  console.error('Error during database resequencing:', error);
} finally {
  // Close the database connection
  db.close();
} 