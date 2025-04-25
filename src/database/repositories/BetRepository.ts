import db from '../Database.js';
import { Bet, BetResult } from '../../types/index.js';

/**
 * Repository for handling Bet-related database operations
 */
class BetRepository {
  /**
   * Create a new bet
   * 
   * @param {Partial<Bet>} bet - Bet data
   * @returns {Bet} The created bet
   */
  create(bet: {
    userId: string;
    matchId: number;
    team: string;
    amount: number;
  }): Bet {
    const stmt = db.getConnection().prepare(`
      INSERT INTO bets (user_id, match_id, team, amount)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `);
    
    return stmt.get(bet.userId, bet.matchId, bet.team, bet.amount) as Bet;
  }
  
  /**
   * Get a bet by ID
   * 
   * @param {number} betId - Bet ID
   * @returns {Bet|null} The bet object or null if not found
   */
  findById(betId: number): Bet | null {
    const stmt = db.getConnection().prepare('SELECT * FROM bets WHERE id = ?');
    return stmt.get(betId) as Bet | null;
  }
  
  /**
   * Get all bets for a specific match
   * 
   * @param {number} matchId - Match ID
   * @returns {Bet[]} Array of bets for the match
   */
  findByMatchId(matchId: number): Bet[] {
    const stmt = db.getConnection().prepare(`
      SELECT b.*, u.name as user_name
      FROM bets b
      JOIN users u ON b.user_id = u.id
      WHERE b.match_id = ?
    `);
    
    return stmt.all(matchId) as Bet[];
  }
  
  /**
   * Get all bets placed by a specific user
   * 
   * @param {string} userId - Discord user ID
   * @returns {Bet[]} Array of bets placed by the user
   */
  findByUserId(userId: string): Bet[] {
    const stmt = db.getConnection().prepare(`
      SELECT b.*, m.team1, m.team2, m.status, m.winner
      FROM bets b
      JOIN matches m ON b.match_id = m.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `);
    
    return stmt.all(userId) as Bet[];
  }
  
  /**
   * Check if a user has already bet on a match
   * 
   * @param {string} userId - Discord user ID
   * @param {number} matchId - Match ID
   * @returns {boolean} True if the user has already bet on the match
   */
  userHasBet(userId: string, matchId: number): boolean {
    const stmt = db.getConnection().prepare(`
      SELECT 1 FROM bets
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
   * @returns {Bet[]} Array of bets for the team
   */
  findByMatchAndTeam(matchId: number, team: string): Bet[] {
    const stmt = db.getConnection().prepare(`
      SELECT b.*, u.name as user_name
      FROM bets b
      JOIN users u ON b.user_id = u.id
      WHERE b.match_id = ? AND b.team = ?
    `);
    
    return stmt.all(matchId, team) as Bet[];
  }
  
  /**
   * Delete all bets for a specific match
   * 
   * @param {number} matchId - Match ID
   * @returns {boolean} True if bets were deleted
   */
  deleteByMatchId(matchId: number): boolean {
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
  getTotalBetOnTeam(matchId: number, team: string): number {
    const stmt = db.getConnection().prepare(`
      SELECT SUM(amount) as total
      FROM bets
      WHERE match_id = ? AND team = ?
    `);
    
    const result = stmt.get(matchId, team) as { total: number } | { total: null };
    return result.total || 0;
  }
  
  /**
   * Update bet result
   * 
   * @param {number} betId - Bet ID
   * @param {BetResult} result - Bet result ('win', 'loss', 'refund', 'pending')
   * @returns {Bet|null} Updated bet or null if bet doesn't exist
   */
  updateResult(betId: number, result: BetResult): Bet | null {
    const validResults: BetResult[] = ['win', 'loss', 'refund', 'pending'];
    if (!validResults.includes(result)) {
      throw new Error(`Invalid bet result: ${result}. Must be one of: ${validResults.join(', ')}`);
    }
    
    const stmt = db.getConnection().prepare(`
      UPDATE bets
      SET result = ?
      WHERE id = ?
      RETURNING *
    `);
    
    return stmt.get(result, betId) as Bet | null;
  }
  
  /**
   * Mark all bets for a match as refunded
   * 
   * @param {number} matchId - Match ID
   * @returns {number} Number of bets updated
   */
  markAsRefunded(matchId: number): number {
    const stmt = db.getConnection().prepare(`
      UPDATE bets
      SET result = 'refund'
      WHERE match_id = ?
    `);
    
    const result = stmt.run(matchId);
    return result.changes;
  }
  
  /**
   * Update all bet results for a match based on the winner
   * 
   * @param {number} matchId - Match ID
   * @param {string} winningTeam - Winning team name
   * @returns {number} Number of bets updated
   */
  updateMatchResults(matchId: number, winningTeam: string): number {
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
   * Get winning bets for a match
   * 
   * @param {number} matchId - Match ID
   * @param {string} winningTeam - Winning team name
   * @returns {Bet[]} Array of winning bets
   */
  getWinningBets(matchId: number, winningTeam: string): Bet[] {
    const stmt = db.getConnection().prepare(`
      SELECT b.*, u.name as user_name
      FROM bets b
      JOIN users u ON b.user_id = u.id
      WHERE b.match_id = ? AND b.team = ?
    `);
    
    return stmt.all(matchId, winningTeam) as Bet[];
  }
  
  /**
   * Get losing bets for a match
   * 
   * @param {number} matchId - Match ID
   * @param {string} winningTeam - Winning team name
   * @returns {Bet[]} Array of losing bets
   */
  getLosingBets(matchId: number, winningTeam: string): Bet[] {
    const stmt = db.getConnection().prepare(`
      SELECT b.*, u.name as user_name
      FROM bets b
      JOIN users u ON b.user_id = u.id
      WHERE b.match_id = ? AND b.team != ?
    `);
    
    return stmt.all(matchId, winningTeam) as Bet[];
  }
}

// Export singleton instance
export default new BetRepository(); 