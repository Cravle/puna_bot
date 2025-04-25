const db = require('../Database');

/**
 * Repository for handling User-related database operations
 */
class UserRepository {
  /**
   * Create a new user or update if exists
   * 
   * @param {Object} user - User data
   * @param {string} user.id - Discord user ID
   * @param {string} user.name - Discord username
   * @returns {Object} The created/updated user
   */
  createOrUpdate(user) {
    const stmt = db.getConnection().prepare(`
      INSERT INTO users (id, name, balance)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name
      RETURNING *
    `);
    
    return stmt.get(user.id, user.name, user.balance || 1000);
  }
  
  /**
   * Get a user by their Discord ID
   * 
   * @param {string} userId - Discord user ID
   * @returns {Object|null} The user object or null if not found
   */
  findById(userId) {
    const stmt = db.getConnection().prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(userId);
  }
  
  /**
   * Check if a user exists
   * 
   * @param {string} userId - Discord user ID
   * @returns {boolean} True if the user exists, false otherwise
   */
  exists(userId) {
    const stmt = db.getConnection().prepare('SELECT 1 FROM users WHERE id = ? LIMIT 1');
    return !!stmt.get(userId);
  }
  
  /**
   * Get user balance
   * 
   * @param {string} userId - Discord user ID
   * @returns {number} User balance or default balance if user doesn't exist
   */
  getBalance(userId) {
    const stmt = db.getConnection().prepare('SELECT balance FROM users WHERE id = ?');
    const result = stmt.get(userId);
    return result ? result.balance : 1000;
  }
  
  /**
   * Update user balance
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - New balance amount
   * @returns {Object} Updated user
   */
  updateBalance(userId, amount) {
    const stmt = db.getConnection().prepare(`
      UPDATE users
      SET balance = ?
      WHERE id = ?
      RETURNING *
    `);
    
    return stmt.get(amount, userId);
  }
  
  /**
   * Increment or decrement user balance by given amount
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - Amount to adjust (positive or negative)
   * @returns {Object} Updated user with new balance
   */
  adjustBalance(userId, amount) {
    // Create the user first if they don't exist
    if (!this.exists(userId)) {
      this.createOrUpdate({ id: userId, name: 'Unknown User', balance: 1000 });
    }
    
    const stmt = db.getConnection().prepare(`
      UPDATE users
      SET balance = balance + ?
      WHERE id = ?
      RETURNING *
    `);
    
    return stmt.get(amount, userId);
  }
  
  /**
   * Get top users by balance
   * 
   * @param {number} limit - Maximum number of users to return
   * @returns {Array} Array of users sorted by balance
   */
  getLeaderboard(limit = 5) {
    const stmt = db.getConnection().prepare(`
      SELECT id, name, balance
      FROM users
      ORDER BY balance DESC
      LIMIT ?
    `);
    
    return stmt.all(limit);
  }
}

module.exports = new UserRepository(); 