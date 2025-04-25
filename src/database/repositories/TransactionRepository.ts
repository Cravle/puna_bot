import db from '../Database.js';
import { Transaction, TransactionType } from '../../types/index.js';

/**
 * Repository for handling Transaction-related database operations
 */
class TransactionRepository {
  /**
   * Create a new transaction
   * 
   * @param {Partial<Transaction>} transaction - Transaction data
   * @returns {Transaction} The created transaction
   */
  create(transaction: {
    userId: string;
    amount: number;
    type: TransactionType;
    referenceId?: number;
  }): Transaction {
    const stmt = db.getConnection().prepare(`
      INSERT INTO transactions (user_id, amount, type, reference_id)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `);
    
    return stmt.get(
      transaction.userId,
      transaction.amount,
      transaction.type,
      transaction.referenceId || null,
    ) as Transaction;
  }
  
  /**
   * Get a transaction by ID
   * 
   * @param {number} transactionId - Transaction ID
   * @returns {Transaction|null} The transaction object or null if not found
   */
  findById(transactionId: number): Transaction | null {
    const stmt = db.getConnection().prepare('SELECT * FROM transactions WHERE id = ?');
    return stmt.get(transactionId) as Transaction | null;
  }
  
  /**
   * Get all transactions for a specific user
   * 
   * @param {string} userId - Discord user ID
   * @param {number} limit - Maximum number of transactions to return
   * @returns {Transaction[]} Array of transactions
   */
  findByUserId(userId: string, limit = 50): Transaction[] {
    const stmt = db.getConnection().prepare(`
      SELECT *
      FROM transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    return stmt.all(userId, limit) as Transaction[];
  }
  
  /**
   * Get all transactions of a specific type
   * 
   * @param {TransactionType} type - Transaction type
   * @param {number} limit - Maximum number of transactions to return
   * @returns {Transaction[]} Array of transactions
   */
  findByType(type: TransactionType, limit = 50): Transaction[] {
    const stmt = db.getConnection().prepare(`
      SELECT t.*, u.name as user_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.type = ?
      ORDER BY t.created_at DESC
      LIMIT ?
    `);
    
    return stmt.all(type, limit) as Transaction[];
  }
  
  /**
   * Get transactions related to a specific reference (e.g., a bet or match)
   * 
   * @param {number} referenceId - Reference ID
   * @returns {Transaction[]} Array of transactions
   */
  findByReferenceId(referenceId: number): Transaction[] {
    const stmt = db.getConnection().prepare(`
      SELECT t.*, u.name as user_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.reference_id = ?
      ORDER BY t.created_at DESC
    `);
    
    return stmt.all(referenceId) as Transaction[];
  }

  /**
   * Get a user's transaction history with enriched information
   * 
   * @param {string} userId - Discord user ID
   * @param {number} limit - Maximum number of transactions to fetch
   * @returns {Transaction[]} User's transaction history
   */
  getUserHistory(userId: string, limit = 10): Transaction[] {
    const stmt = db.getConnection().prepare(`
      SELECT 
        t.*,
        CASE 
          WHEN t.type = 'bet' OR t.type = 'payout' OR t.type = 'refund' 
          THEN (
            SELECT m.team1 || ' vs ' || m.team2
            FROM bets b
            JOIN matches m ON b.match_id = m.id
            WHERE b.id = t.reference_id
            LIMIT 1
          )
          ELSE NULL
        END as match_info
      FROM transactions t
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
      LIMIT ?
    `);
    
    return stmt.all(userId, limit) as Transaction[];
  }
  
  /**
   * Create an initialization transaction for a new user
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - Initial balance amount
   * @returns {Transaction} The created transaction
   */
  createInitialTransaction(userId: string, amount: number): Transaction {
    return this.create({
      userId,
      amount,
      type: 'init',
    });
  }
  
  /**
   * Create a bet transaction
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - Bet amount (negative since it's a deduction)
   * @param {number} betId - Bet ID for reference
   * @returns {Transaction} The created transaction
   */
  createBetTransaction(userId: string, amount: number, betId: number): Transaction {
    return this.create({
      userId,
      amount: -Math.abs(amount), // Ensure it's negative (money is deducted)
      type: 'bet',
      referenceId: betId,
    });
  }
  
  /**
   * Create a payout transaction for a winning bet
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - Payout amount (positive value)
   * @param {number} betId - Bet ID for reference
   * @returns {Transaction} The created transaction
   */
  createPayoutTransaction(userId: string, amount: number, betId: number): Transaction {
    return this.create({
      userId,
      amount: Math.abs(amount), // Ensure it's positive
      type: 'payout',
      referenceId: betId,
    });
  }
  
  /**
   * Create a refund transaction
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - Refund amount (positive value)
   * @param {number} betId - Bet ID for reference
   * @returns {Transaction} The created transaction
   */
  createRefundTransaction(userId: string, amount: number, betId: number): Transaction {
    return this.create({
      userId,
      amount: Math.abs(amount), // Ensure it's positive
      type: 'refund',
      referenceId: betId,
    });
  }
}

// Export singleton instance
export default new TransactionRepository(); 