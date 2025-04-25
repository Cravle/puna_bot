import db from '../Database.js';
import { User } from '../../types/index.js';

/**
 * Repository for handling User-related database operations
 */
class UserRepository {
  /**
   * Create a new user or update if exists
   * 
   * @param {User} user - User data
   * @returns {User} The created/updated user
   */
  createOrUpdate(user: User): User {
    const stmt = db.getConnection().prepare(`
      INSERT INTO users (id, name, balance)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name
      RETURNING *
    `);
    
    return stmt.get(user.id, user.name, user.balance || 1000) as User;
  }
  
  /**
   * Get a user by their Discord ID
   * 
   * @param {string} userId - Discord user ID
   * @returns {User|null} The user object or null if not found
   */
  findById(userId: string): User | null {
    const stmt = db.getConnection().prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(userId) as User | null;
  }
  
  /**
   * Check if a user exists
   * 
   * @param {string} userId - Discord user ID
   * @returns {boolean} True if the user exists, false otherwise
   */
  exists(userId: string): boolean {
    const stmt = db.getConnection().prepare('SELECT 1 FROM users WHERE id = ? LIMIT 1');
    return !!stmt.get(userId);
  }
  
  /**
   * Get user balance
   * 
   * @param {string} userId - Discord user ID
   * @returns {number} User balance or default balance if user doesn't exist
   */
  getBalance(userId: string): number {
    const stmt = db.getConnection().prepare('SELECT balance FROM users WHERE id = ?');
    const result = stmt.get(userId) as { balance: number } | undefined;
    return result ? result.balance : 1000;
  }
  
  /**
   * Update user balance
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - New balance amount
   * @returns {User} Updated user
   */
  updateBalance(userId: string, amount: number): User {
    const stmt = db.getConnection().prepare(`
      UPDATE users
      SET balance = ?
      WHERE id = ?
      RETURNING *
    `);
    
    return stmt.get(amount, userId) as User;
  }
  
  /**
   * Increment or decrement user balance by given amount
   * 
   * @param {string} userId - Discord user ID
   * @param {number} amount - Amount to adjust (positive or negative)
   * @returns {User} Updated user with new balance
   */
  adjustBalance(userId: string, amount: number): User {
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
    
    return stmt.get(amount, userId) as User;
  }
  
  /**
   * Get top users by balance
   * 
   * @param {number} limit - Maximum number of users to return
   * @returns {User[]} Array of users sorted by balance
   */
  getLeaderboard(limit: number = 5): User[] {
    const stmt = db.getConnection().prepare(`
      SELECT id, name, balance
      FROM users
      ORDER BY balance DESC
      LIMIT ?
    `);
    
    return stmt.all(limit) as User[];
  }
}

// Export as singleton
export default new UserRepository(); 