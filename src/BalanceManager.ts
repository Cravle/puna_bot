import userRepository from './database/repositories/UserRepository.js';
import transactionRepository from './database/repositories/TransactionRepository.js';
import { User } from './types/index.js';

/**
 * Manages user balances and economy features
 */
export class BalanceManager {
  private START_BALANCE: number;

  constructor() {
    this.START_BALANCE = 1000;
  }

  /**
   * Get a user's balance
   * @param {string} userId - Discord user ID
   * @returns {number} User's current balance
   */
  getBalance(userId: string): number {
    return userRepository.getBalance(userId);
  }

  /**
   * Set a user's balance to a specific amount
   * @param {string} userId - Discord user ID
   * @param {string} username - Discord username
   * @param {number} amount - New balance amount
   * @returns {User} Updated user
   */
  setBalance(userId: string, username: string, amount: number): User {
    // Create user if doesn't exist
    if (!userRepository.exists(userId)) {
      userRepository.createOrUpdate({ id: userId, name: username, balance: amount });
      // Record transaction for audit
      transactionRepository.createInitialTransaction(userId, amount);
      return { id: userId, name: username, balance: amount };
    }

    // Update existing user
    return userRepository.updateBalance(userId, amount);
  }

  /**
   * Adjust a user's balance by adding or subtracting an amount
   * @param {string} userId - Discord user ID
   * @param {string} username - Discord username
   * @param {number} amount - Amount to adjust (positive or negative)
   * @param {string} type - Transaction type
   * @param {number} referenceId - Reference ID (optional)
   * @returns {number} New balance after adjustment
   */
  adjustBalance(
    userId: string,
    username: string,
    amount: number,
    type: 'init' | 'bet' | 'payout' | 'refund' | 'donate' | 'event_bet' | 'event_payout' = 'donate',
    referenceId?: number,
  ): number {
    // Ensure user exists
    if (!userRepository.exists(userId)) {
      userRepository.createOrUpdate({ id: userId, name: username, balance: this.START_BALANCE });
      transactionRepository.createInitialTransaction(userId, this.START_BALANCE);
    }

    // Record transaction
    transactionRepository.create({
      userId,
      amount,
      type,
      referenceId,
    });

    // Update balance and return updated user
    const updatedUser = userRepository.adjustBalance(userId, amount);
    return updatedUser.balance;
  }

  /**
   * Get sorted leaderboard of balances
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array} Array of user objects with balance info
   */
  getLeaderboard(limit = 5): User[] {
    return userRepository.getLeaderboard(limit);
  }

  /**
   * Initialize balances for new guild members
   * @param {Map<string, any>} members - Discord.js collection of guild members
   * @returns {number} Number of members who received initial balance
   */
  initializeAllMembers(members: Map<string, any>): number {
    let added = 0;

    // Process each member
    members.forEach(member => {
      if (!member.user.bot && !userRepository.exists(member.id)) {
        // Create user
        userRepository.createOrUpdate({
          id: member.id,
          name: member.user.username,
          balance: this.START_BALANCE,
        });

        // Record initial transaction
        transactionRepository.createInitialTransaction(member.id, this.START_BALANCE);

        added++;
      }
    });

    return added;
  }

  /**
   * Get a user's transaction history
   * @param {string} userId - Discord user ID
   * @param {number} limit - Maximum number of transactions to fetch
   * @returns {Array} User's transaction history
   */
  getTransactionHistory(userId: string, limit = 10): any[] {
    return transactionRepository.getUserHistory(userId, limit);
  }
}
