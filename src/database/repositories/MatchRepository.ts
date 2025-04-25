import db from '../Database.js';
import { Match, MatchStatus } from '../../types/index.js';

/**
 * Repository for handling Match-related database operations
 */
class MatchRepository {
  /**
   * Create a new match
   * 
   * @param {Partial<Match>} match - Match data
   * @returns {Match} The created match
   */
  create(match: Partial<Match>): Match {
    const stmt = db.getConnection().prepare(`
      INSERT INTO matches (team1, team2, status)
      VALUES (?, ?, ?)
      RETURNING *
    `);
    
    return stmt.get(
      match.team1, 
      match.team2, 
      match.status || 'pending'
    ) as Match;
  }
  
  /**
   * Get a match by ID
   * 
   * @param {number} matchId - Match ID
   * @returns {Match|null} The match object or null if not found
   */
  findById(matchId: number): Match | null {
    const stmt = db.getConnection().prepare('SELECT * FROM matches WHERE id = ?');
    return stmt.get(matchId) as Match | null;
  }
  
  /**
   * Get the latest active match
   * 
   * @returns {Match|null} The latest active match or null if none exists
   */
  getActiveMatch(): Match | null {
    const stmt = db.getConnection().prepare(`
      SELECT * FROM matches 
      WHERE status = 'pending' 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    return stmt.get() as Match | null;
  }
  
  /**
   * Get the latest match regardless of status
   * 
   * @returns {Match|null} The latest match or null if none exists
   */
  getLatestMatch(): Match | null {
    const stmt = db.getConnection().prepare(`
      SELECT * FROM matches 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    return stmt.get() as Match | null;
  }
  
  /**
   * Update match status
   * 
   * @param {number} matchId - Match ID
   * @param {MatchStatus} status - New match status
   * @returns {Match|null} Updated match or null if match doesn't exist
   */
  updateStatus(matchId: number, status: MatchStatus): Match | null {
    const stmt = db.getConnection().prepare(`
      UPDATE matches
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `);
    
    return stmt.get(status, matchId) as Match | null;
  }
  
  /**
   * Set the winner of a match
   * 
   * @param {number} matchId - Match ID
   * @param {string} winner - Name of the winning team
   * @returns {Match|null} Updated match or null if match doesn't exist
   */
  setWinner(matchId: number, winner: string): Match | null {
    const stmt = db.getConnection().prepare(`
      UPDATE matches
      SET winner = ?, status = 'done', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `);
    
    return stmt.get(winner, matchId) as Match | null;
  }
  
  /**
   * Delete a match by ID
   * 
   * @param {number} matchId - Match ID
   * @returns {boolean} True if the match was deleted, false otherwise
   */
  delete(matchId: number): boolean {
    const stmt = db.getConnection().prepare('DELETE FROM matches WHERE id = ?');
    const result = stmt.run(matchId);
    return result.changes > 0;
  }
  
  /**
   * Get match history (most recent matches)
   * 
   * @param {number} limit - Maximum number of matches to return
   * @returns {Match[]} Array of matches sorted by creation date
   */
  getHistory(limit: number = 10): Match[] {
    const stmt = db.getConnection().prepare(`
      SELECT * 
      FROM matches 
      WHERE status != 'none'
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit) as Match[];
  }
}

// Export singleton instance
export default new MatchRepository(); 