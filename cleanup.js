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
  
  // Log matches that will be deleted
  const matchesToDelete = db.prepare(`
    SELECT id, team1, team2, status, match_type 
    FROM matches 
    WHERE status IN ('canceled', 'started')
  `).all();
  
  console.log('Matches to be deleted:');
  console.table(matchesToDelete);
  
  // Check for associated bets
  const bets = db.prepare(`
    SELECT id, match_id, user_id, amount 
    FROM bets 
    WHERE match_id IN (SELECT id FROM matches WHERE status IN ('canceled', 'started'))
  `).all();
  
  console.log(`Found ${bets.length} bets associated with matches to delete`);
  if (bets.length > 0) {
    console.table(bets);
  }
  
  // Delete bets first (due to foreign key constraints)
  const deleteResult1 = db.prepare(`
    DELETE FROM bets 
    WHERE match_id IN (SELECT id FROM matches WHERE status IN ('canceled', 'started'))
  `).run();
  
  console.log(`Deleted ${deleteResult1.changes} bets`);
  
  // Delete transactions associated with these bets
  const deleteResult2 = db.prepare(`
    DELETE FROM transactions 
    WHERE type = 'bet' AND reference_id IN (
      SELECT id FROM bets 
      WHERE match_id IN (SELECT id FROM matches WHERE status IN ('canceled', 'started'))
    )
  `).run();
  
  console.log(`Deleted ${deleteResult2.changes} transactions`);
  
  // Delete matches
  const deleteResult3 = db.prepare(`
    DELETE FROM matches 
    WHERE status IN ('canceled', 'started')
  `).run();
  
  console.log(`Deleted ${deleteResult3.changes} matches`);
  
  // Show remaining matches
  const remainingMatches = db.prepare(`
    SELECT id, team1, team2, status, match_type 
    FROM matches 
    ORDER BY id
  `).all();
  
  console.log('Remaining matches:');
  console.table(remainingMatches);
  
  // Commit changes
  db.prepare('COMMIT').run();
  console.log('Database cleanup completed successfully!');
  
} catch (error) {
  // Rollback on error
  db.prepare('ROLLBACK').run();
  console.error('Error during database cleanup:', error);
} finally {
  // Close the database connection
  db.close();
} 