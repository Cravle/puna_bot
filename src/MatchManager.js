/**
 * Manages betting matches and bet placements
 */
class MatchManager {
  /**
   * @param {import('./DataManager')} dataManager - Data manager instance
   * @param {import('./BalanceManager')} balanceManager - Balance manager instance
   */
  constructor(dataManager, balanceManager) {
    this.dataManager = dataManager;
    this.balanceManager = balanceManager;
  }

  /**
   * Get the current match data
   * @returns {Object} Current match data
   */
  getCurrentMatch() {
    return this.dataManager.loadJson(this.dataManager.matchPath);
  }

  /**
   * Create a new betting match
   * @param {string} team1 - First team name
   * @param {string} team2 - Second team name
   * @returns {Object} Created match data
   */
  createMatch(team1, team2) {
    const match = {
      status: 'pending',
      team1,
      team2,
      bets: []
    };
    this.dataManager.saveJson(this.dataManager.matchPath, match);
    return match;
  }

  /**
   * Place a bet on a team
   * @param {string} userId - Discord user ID
   * @param {string} team - Team name to bet on
   * @param {number} amount - Bet amount
   * @returns {Object} Result with success status and message
   */
  placeBet(userId, team, amount) {
    const match = this.getCurrentMatch();
    if (match.status !== 'pending') {
      return { success: false, message: 'No active match to bet on!' };
    }
    
    if (![match.team1, match.team2].includes(team)) {
      return { success: false, message: 'Invalid team name!' };
    }
    
    if (isNaN(amount) || amount <= 0) {
      return { success: false, message: 'Invalid bet amount!' };
    }
    
    const userBalance = this.balanceManager.getBalance(userId);
    if (userBalance < amount) {
      return { success: false, message: 'Not enough balance!' };
    }
    
    if (match.bets.find(b => b.userId === userId)) {
      return { success: false, message: 'You already placed a bet.' };
    }
    
    match.bets.push({ userId, team, amount });
    this.balanceManager.adjustBalance(userId, -amount);
    
    this.dataManager.saveJson(this.dataManager.matchPath, match);
    return { success: true, message: `Bet of $${amount} on ${team} accepted.` };
  }

  /**
   * Cancel the current match and refund bets
   * @returns {Object} Result with success status and message
   */
  cancelMatch() {
    const match = this.getCurrentMatch();
    if (match.status !== 'pending') {
      return { success: false, message: 'No match to cancel.' };
    }
    
    match.bets.forEach(bet => {
      this.balanceManager.adjustBalance(bet.userId, bet.amount);
    });
    
    match.status = 'canceled';
    this.dataManager.saveJson(this.dataManager.matchPath, match);
    return { success: true, message: 'Match canceled. Bets refunded.' };
  }

  /**
   * Finish a match with the winning team and pay out bets
   * @param {string} winner - Name of the winning team
   * @returns {Object} Result with success status and message
   */
  finishMatch(winner) {
    const match = this.getCurrentMatch();
    if (match.status !== 'pending') {
      return { success: false, message: 'No active match to finish.' };
    }
    
    if (![match.team1, match.team2].includes(winner)) {
      return { success: false, message: 'Invalid winner team.' };
    }
    
    const winners = match.bets.filter(bet => bet.team === winner);
    winners.forEach(bet => {
      const payout = bet.amount * 2; // Fixed 2x payout
      this.balanceManager.adjustBalance(bet.userId, payout);
    });
    
    match.status = 'done';
    match.winner = winner;
    this.dataManager.saveJson(this.dataManager.matchPath, match);
    
    return { success: true, message: `Match finished. ${winner} won! Bets paid out.` };
  }
}

module.exports = MatchManager; 