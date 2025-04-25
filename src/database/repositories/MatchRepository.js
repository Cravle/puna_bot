const db = require('../Database');

/**
 * Repository for handling Match-related database operations
 */
class MatchRepository {
  /**
   * Create a new match
   * 
   * @param {Object} match - Match data
   * @param {string} match.team1 - First team name
   * @param {string} match.team2 - Second team name
   * @param {string} match.status - Match status (default: 'pending')
   * @returns {Object} The created match
   */
  create(match) {
    const stmt = db.getConnection().prepare(`
      INSERT INTO matches (team1, team2, status)
      VALUES (?, ?, ?)
      RETURNING *
    `);
    
    return stmt.get(match.team1, match.team2, match.status || 'pending');
  }
  
  /**
   * Get a match by ID
   * 
   * @param {number} matchId - Match ID
   * @returns {Object|null} The match object or null if not found
   */
  findById(matchId) {
    const stmt = db.getConnection().prepare('SELECT * FROM matches WHERE id = ?');
    return stmt.get(matchId);
  }
  
  /**
   * Get the latest active match
   * 
   * @returns {Object|null} The latest active match or null if none exists
   */
  getActiveMatch() {
    const stmt = db.getConnection().prepare(`
      SELECT * FROM matches 
      WHERE status = 'pending' 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    return stmt.get();
  }
  
  /**
   * Get the latest match regardless of status
   * 
   * @returns {Object|null} The latest match or null if none exists
   */
  getLatestMatch() {
    const stmt = db.getConnection().prepare(`
      SELECT * FROM matches 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    return stmt.get();
  }
  
  /**
   * Update match status
   * 
   * @param {number} matchId - Match ID
   * @param {string} status - New status ('pending', 'done', 'canceled')
   * @returns {Object} Updated match
   */
  updateStatus(matchId, status) {
    const stmt = db.getConnection().prepare(`
      UPDATE matches
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `);
    
    return stmt.get(status, matchId);
  }
  
  /**
   * Update match winner
   * 
   * @param {number} matchId - Match ID
   * @param {string} winner - Winning team name
   * @returns {Object} Updated match
   */
  setWinner(matchId, winner) {
    const stmt = db.getConnection().prepare(`
      UPDATE matches
      SET winner = ?, status = 'done', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `);
    
    return stmt.get(winner, matchId);
  }
  
  /**
   * Delete a match by ID
   * 
   * @param {number} matchId - Match ID
   * @returns {boolean} True if the match was deleted, false otherwise
   */
  delete(matchId) {
    const stmt = db.getConnection().prepare('DELETE FROM matches WHERE id = ?');
    const result = stmt.run(matchId);
    return result.changes > 0;
  }
  
  /**
   * Get match history (most recent matches)
   * 
   * @param {number} limit - Maximum number of matches to return
   * @returns {Array} Array of matches sorted by creation date
   */
  getHistory(limit = 10) {
    const stmt = db.getConnection().prepare(`
      SELECT * 
      FROM matches 
      WHERE status != 'none'
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit);
  }
}

module.exports = new MatchRepository(); 