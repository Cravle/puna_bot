const db = require('../Database');

/**
 * Repository for handling Transaction-related database operations
 */
class TransactionRepository {
  /**
   * Create a new transaction
   * 
   * @param {Object} transaction - Transaction data
   * @param {string} transaction.userId - Discord user ID
   * @param {number} transaction.amount - Transaction amount (positive or negative)
   * @param {string} transaction.type - Transaction type ('init', 'bet', 'payout', 'refund', 'donate')
   * @param {number} [transaction.referenceId] - Reference ID (e.g., bet ID or match ID)
   * @returns {Object} The created transaction
   */
  create(transaction) {
    const stmt = db.getConnection().prepare(`
      INSERT INTO transactions (user_id, amount, type, reference_id)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `);
    
    return stmt.get(
      transaction.userId,
      transaction.amount,
      transaction.type,
      transaction.referenceId || null
    );
  }
  
  /**
   * Get a transaction by ID
   * 
   * @param {number} transactionId - Transaction ID
   * @returns {Object|null} The transaction object or null if not found
   */
  findById(transactionId) {
    const stmt = db.getConnection().prepare('SELECT * FROM transactions WHERE id = ?');
    return stmt.get(transactionId);
  }
  
  /**
   * Get all transactions for a specific user
   * 
   * @param {string} userId - Discord user ID
   * @param {number} [limit=50] - Maximum number of transactions to return
   * @returns {Array} Array of transactions
   */
  findByUserId(userId, limit = 50) {
    const stmt = db.getConnection().prepare(`
      SELECT *
      FROM transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    return stmt.all(userId, limit);
  }
  
  /**
   * Get all transactions of a specific type
   * 
   * @param {string} type - Transaction type
   * @param {number} [limit=50] - Maximum number of transactions to return
   * @returns {Array} Array of transactions
   */
  findByType(type, limit = 50) {
    const stmt = db.getConnection().prepare(`
      SELECT t.*, u.name as user_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.type = ?
      ORDER BY t.created_at DESC
      LIMIT ?
    `);
    
    return stmt.all(type, limit);
  }
  
  /**
   * Get transactions related to a specific reference (e.g., a bet or match)
   * 
   * @param {number} referenceId - Reference ID
   * @returns {Array} Array of transactions
   */
  findByReferenceId(referenceId) {
    const stmt = db.getConnection().prepare(`
      SELECT t.*, u.name as user_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.reference_id = ?
      ORDER BY t.created_at DESC
    `);
    
    return stmt.all(referenceId);
  }
  
  /**
   * Get a user's transaction history
   * 
   * @param {string} userId - Discord user ID
   * @param {number} [limit=10] - Maximum number of transactions to return
   * @returns {Array} Array of user's transactions with details
   */
  getUserHistory(userId, limit = 10) {
    const stmt = db.getConnection().prepare(`
      SELECT 
        t.*,
        CASE
          WHEN t.type = 'bet' OR t.type = 'payout' OR t.type = 'refund' THEN (
            SELECT m.team1 || ' vs ' || m.team2 ||
                  CASE 
                    WHEN b.result = 'win' THEN ' (Won)'
                    WHEN b.result = 'loss' THEN ' (Lost)'
                    WHEN b.result = 'refund' THEN ' (Refunded)'
                    ELSE ''
                  END
            FROM bets b
            JOIN matches m ON b.match_id = m.id
            WHERE b.id = t.reference_id
            LIMIT 1
          )
          ELSE NULL
        END as match_info,
        CASE
          WHEN t.reference_id IS NOT NULL THEN (
            SELECT b.result
            FROM bets b
            WHERE b.id = t.reference_id
            LIMIT 1
          )
          ELSE NULL
        END as bet_result
      FROM transactions t
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
      LIMIT ?
    `);
    
    return stmt.all(userId, limit);
  }
  
  /**
   * Create an initialization transaction for a new user
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - Initial balance amount
   * @returns {Object} The created transaction
   */
  createInitialTransaction(userId, amount) {
    return this.create({
      userId,
      amount,
      type: 'init'
    });
  }
  
  /**
   * Create a bet transaction
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - Bet amount (negative since it's a deduction)
   * @param {number} betId - Bet ID for reference
   * @returns {Object} The created transaction
   */
  createBetTransaction(userId, amount, betId) {
    return this.create({
      userId,
      amount: -Math.abs(amount), // Ensure it's negative (money is deducted)
      type: 'bet',
      referenceId: betId
    });
  }
  
  /**
   * Create a payout transaction for a winning bet
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - Payout amount (positive value)
   * @param {number} betId - Bet ID for reference
   * @returns {Object} The created transaction
   */
  createPayoutTransaction(userId, amount, betId) {
    return this.create({
      userId,
      amount: Math.abs(amount), // Ensure it's positive
      type: 'payout',
      referenceId: betId
    });
  }
  
  /**
   * Create a refund transaction
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - Refund amount (positive value)
   * @param {number} betId - Bet ID for reference
   * @returns {Object} The created transaction
   */
  createRefundTransaction(userId, amount, betId) {
    return this.create({
      userId,
      amount: Math.abs(amount), // Ensure it's positive
      type: 'refund',
      referenceId: betId
    });
  }
}

module.exports = new TransactionRepository(); 