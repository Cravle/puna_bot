const db = require('../Database');

/**
 * Repository for handling Bet-related database operations
 */
class BetRepository {
  /**
   * Create a new bet
   * 
   * @param {Object} bet - Bet data
   * @param {string} bet.userId - Discord user ID
   * @param {number} bet.matchId - Match ID
   * @param {string} bet.team - Team name
   * @param {number} bet.amount - Bet amount
   * @returns {Object} The created bet
   */
  create(bet) {
    const stmt = db.getConnection().prepare(`
      INSERT INTO bets (user_id, match_id, team, amount)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `);
    
    return stmt.get(bet.userId, bet.matchId, bet.team, bet.amount);
  }
  
  /**
   * Get a bet by ID
   * 
   * @param {number} betId - Bet ID
   * @returns {Object|null} The bet object or null if not found
   */
  findById(betId) {
    const stmt = db.getConnection().prepare('SELECT * FROM bets WHERE id = ?');
    return stmt.get(betId);
  }
  
  /**
   * Get all bets for a specific match
   * 
   * @param {number} matchId - Match ID
   * @returns {Array} Array of bets for the match
   */
  findByMatchId(matchId) {
    const stmt = db.getConnection().prepare(`
      SELECT b.*, u.name as user_name
      FROM bets b
      JOIN users u ON b.user_id = u.id
      WHERE b.match_id = ?
    `);
    
    return stmt.all(matchId);
  }
  
  /**
   * Get all bets placed by a specific user
   * 
   * @param {string} userId - Discord user ID
   * @returns {Array} Array of bets placed by the user
   */
  findByUserId(userId) {
    const stmt = db.getConnection().prepare(`
      SELECT b.*, m.team1, m.team2, m.status, m.winner
      FROM bets b
      JOIN matches m ON b.match_id = m.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `);
    
    return stmt.all(userId);
  }
  
  /**
   * Check if a user has already placed a bet on a match
   * 
   * @param {string} userId - Discord user ID
   * @param {number} matchId - Match ID
   * @returns {boolean} True if the user has already bet on the match
   */
  userHasBet(userId, matchId) {
    const stmt = db.getConnection().prepare(`
      SELECT 1
      FROM bets
      WHERE user_id = ? AND match_id = ?
      LIMIT 1
    `);
    
    return !!stmt.get(userId, matchId);
  }
  
  /**
   * Get all bets on a specific team in a match
   * 
   * @param {number} matchId - Match ID
   * @param {string} team - Team name
   * @returns {Array} Array of bets for the team
   */
  findByMatchAndTeam(matchId, team) {
    const stmt = db.getConnection().prepare(`
      SELECT b.*, u.name as user_name
      FROM bets b
      JOIN users u ON b.user_id = u.id
      WHERE b.match_id = ? AND b.team = ?
    `);
    
    return stmt.all(matchId, team);
  }
  
  /**
   * Delete all bets for a specific match
   * 
   * @param {number} matchId - Match ID
   * @returns {boolean} True if bets were deleted
   */
  deleteByMatchId(matchId) {
    const stmt = db.getConnection().prepare('DELETE FROM bets WHERE match_id = ?');
    const result = stmt.run(matchId);
    return result.changes > 0;
  }
  
  /**
   * Get total amount bet on a specific team in a match
   * 
   * @param {number} matchId - Match ID
   * @param {string} team - Team name
   * @returns {number} Total amount bet on the team
   */
  getTotalBetOnTeam(matchId, team) {
    const stmt = db.getConnection().prepare(`
      SELECT SUM(amount) as total
      FROM bets
      WHERE match_id = ? AND team = ?
    `);
    
    const result = stmt.get(matchId, team);
    return result.total || 0;
  }
  
  /**
   * Update bet result
   * 
   * @param {number} betId - Bet ID
   * @param {string} result - Bet result ('win', 'loss', 'refund', 'pending')
   * @returns {Object|null} Updated bet or null if bet doesn't exist
   */
  updateResult(betId, result) {
    const validResults = ['win', 'loss', 'refund', 'pending'];
    if (!validResults.includes(result)) {
      throw new Error(`Invalid bet result: ${result}. Must be one of: ${validResults.join(', ')}`);
    }
    
    const stmt = db.getConnection().prepare(`
      UPDATE bets
      SET result = ?
      WHERE id = ?
      RETURNING *
    `);
    
    return stmt.get(result, betId);
  }
  
  /**
   * Update all bet results for a match
   * 
   * @param {number} matchId - Match ID
   * @param {string} winningTeam - Name of the winning team
   * @returns {number} Number of bets updated
   */
  updateMatchResults(matchId, winningTeam) {
    // Mark winning bets
    const winStmt = db.getConnection().prepare(`
      UPDATE bets
      SET result = 'win'
      WHERE match_id = ? AND team = ?
    `);
    
    // Mark losing bets
    const lossStmt = db.getConnection().prepare(`
      UPDATE bets
      SET result = 'loss'
      WHERE match_id = ? AND team != ?
    `);
    
    const winResult = winStmt.run(matchId, winningTeam);
    const lossResult = lossStmt.run(matchId, winningTeam);
    
    return winResult.changes + lossResult.changes;
  }
  
  /**
   * Mark all bets for a match as refunded
   * 
   * @param {number} matchId - Match ID
   * @returns {number} Number of bets updated
   */
  markAsRefunded(matchId) {
    const stmt = db.getConnection().prepare(`
      UPDATE bets
      SET result = 'refund'
      WHERE match_id = ?
    `);
    
    const result = stmt.run(matchId);
    return result.changes;
  }

  /**
   * Get winning bets for a match
   * 
   * @param {number} matchId - Match ID
   * @param {string} winningTeam - Winning team name
   * @returns {Array} Array of winning bets
   */
  getWinningBets(matchId, winningTeam) {
    const stmt = db.getConnection().prepare(`
      SELECT b.*, u.name as user_name
      FROM bets b
      JOIN users u ON b.user_id = u.id
      WHERE b.match_id = ? AND b.team = ?
    `);
    
    return stmt.all(matchId, winningTeam);
  }
  
  /**
   * Get losing bets for a match
   * 
   * @param {number} matchId - Match ID
   * @param {string} winningTeam - Winning team name
   * @returns {Array} Array of losing bets
   */
  getLosingBets(matchId, winningTeam) {
    const stmt = db.getConnection().prepare(`
      SELECT b.*, u.name as user_name
      FROM bets b
      JOIN users u ON b.user_id = u.id
      WHERE b.match_id = ? AND b.team != ?
    `);
    
    return stmt.all(matchId, winningTeam);
  }
}

module.exports = new BetRepository(); 