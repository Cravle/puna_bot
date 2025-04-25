/**
 * Manages user balances and economy features
 */
class BalanceManager {
  /**
   * @param {import('./DataManager')} dataManager - Data manager instance
   */
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.START_BALANCE = 1000;
  }

  /**
   * Get a user's balance
   * @param {string} userId - Discord user ID
   * @returns {number} User's current balance
   */
  getBalance(userId) {
    const balances = this.dataManager.loadJson(this.dataManager.balancePath);
    return balances[userId] ?? this.START_BALANCE;
  }

  /**
   * Set a user's balance to a specific amount
   * @param {string} userId - Discord user ID
   * @param {number} amount - New balance amount
   */
  setBalance(userId, amount) {
    const balances = this.dataManager.loadJson(this.dataManager.balancePath);
    balances[userId] = amount;
    this.dataManager.saveJson(this.dataManager.balancePath, balances);
  }

  /**
   * Adjust a user's balance by adding or subtracting an amount
   * @param {string} userId - Discord user ID
   * @param {number} amount - Amount to adjust (positive or negative)
   * @returns {number} New balance after adjustment
   */
  adjustBalance(userId, amount) {
    const currentBalance = this.getBalance(userId);
    this.setBalance(userId, currentBalance + amount);
    return currentBalance + amount;
  }

  /**
   * Get sorted leaderboard of balances
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array} Array of [userId, balance] pairs
   */
  getLeaderboard(limit = 5) {
    const balances = this.dataManager.loadJson(this.dataManager.balancePath);
    return Object.entries(balances)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  /**
   * Initialize balances for new guild members
   * @param {Collection} members - Discord.js collection of guild members
   * @returns {number} Number of members who received initial balance
   */
  initializeAllMembers(members) {
    const balances = this.dataManager.loadJson(this.dataManager.balancePath);
    let added = 0;
    
    members.forEach(member => {
      if (!member.user.bot && balances[member.id] === undefined) {
        balances[member.id] = this.START_BALANCE;
        added++;
      }
    });
    
    this.dataManager.saveJson(this.dataManager.balancePath, balances);
    return added;
  }
}

module.exports = BalanceManager; 