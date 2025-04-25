const matchRepository = require('./database/repositories/MatchRepository');
const betRepository = require('./database/repositories/BetRepository');
const transactionRepository = require('./database/repositories/TransactionRepository');

/**
 * Manages betting matches and bet placements
 */
class MatchManager {
  /**
   * @param {import('./BalanceManager')} balanceManager - Balance manager instance
   */
  constructor(balanceManager) {
    this.balanceManager = balanceManager;
  }

  /**
   * Get the current match data
   * @returns {Object} Current match data with bets
   */
  getCurrentMatch() {
    const match = matchRepository.getActiveMatch();
    
    // If no active match, return the latest match regardless of status
    if (!match) {
      const latestMatch = matchRepository.getLatestMatch();
      return latestMatch || { status: 'none' };
    }
    
    // Add bets to match data
    match.bets = betRepository.findByMatchId(match.id);
    return match;
  }

  /**
   * Create a new betting match
   * @param {string} team1 - First team name
   * @param {string} team2 - Second team name
   * @returns {Object} Created match data
   */
  createMatch(team1, team2) {
    const match = matchRepository.create({
      team1,
      team2,
      status: 'pending'
    });
    
    return match;
  }

  /**
   * Place a bet on a team
   * @param {string} userId - Discord user ID
   * @param {string} username - Discord username
   * @param {string} team - Team name to bet on
   * @param {number} amount - Bet amount
   * @returns {Object} Result with success status and message
   */
  placeBet(userId, username, team, amount) {
    const match = matchRepository.getActiveMatch();
    
    // Validate match status
    if (!match || match.status !== 'pending') {
      return { success: false, message: 'No active match to bet on!' };
    }
    
    // Validate team name
    if (![match.team1, match.team2].includes(team)) {
      return { success: false, message: 'Invalid team name!' };
    }
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return { success: false, message: 'Invalid bet amount!' };
    }
    
    // Check if user has already bet on this match
    if (betRepository.userHasBet(userId, match.id)) {
      return { success: false, message: 'You already placed a bet.' };
    }
    
    // Check user balance
    const userBalance = this.balanceManager.getBalance(userId);
    if (userBalance < amount) {
      return { success: false, message: 'Not enough balance!' };
    }
    
    // Create bet record
    const bet = betRepository.create({
      userId,
      matchId: match.id,
      team,
      amount
    });
    
    // Deduct balance (this is just the initial deduction, outcome will be recorded when match ends)
    this.balanceManager.adjustBalance(
      userId, 
      username, 
      -amount,  // Always deduct the bet amount initially
      'bet', 
      bet.id
    );
    
    // Record the initial bet transaction (neutral, outcome will be determined later)
    transactionRepository.create({
      userId,
      amount: -amount, // Initial deduction
      type: 'bet',
      referenceId: bet.id
    });
    
    return { success: true, message: `Bet of $${amount} on ${team} accepted.` };
  }

  /**
   * Cancel the current match and refund bets
   * @returns {Object} Result with success status and message
   */
  cancelMatch() {
    const match = matchRepository.getActiveMatch();
    
    // Validate match
    if (!match) {
      return { success: false, message: 'No match to cancel.' };
    }
    
    // Get all bets for this match
    const bets = betRepository.findByMatchId(match.id);
    
    // Mark all bets as refunded
    betRepository.markAsRefunded(match.id);
    
    // Refund each bet
    bets.forEach(bet => {
      // Return money to user's balance
      this.balanceManager.adjustBalance(
        bet.user_id,
        bet.user_name || 'Unknown User', 
        bet.amount, 
        'refund', 
        bet.id
      );
      
      // Record the refund transaction
      transactionRepository.createRefundTransaction(bet.user_id, bet.amount, bet.id);
    });
    
    // Update match status
    matchRepository.updateStatus(match.id, 'canceled');
    
    return { success: true, message: 'Match canceled. Bets refunded.' };
  }

  /**
   * Finish a match with the winning team and pay out bets
   * @param {string} winner - Name of the winning team
   * @returns {Object} Result with success status and message
   */
  finishMatch(winner) {
    const match = matchRepository.getActiveMatch();
    
    // Validate match
    if (!match) {
      return { success: false, message: 'No active match to finish.' };
    }
    
    // Validate winner team
    if (![match.team1, match.team2].includes(winner)) {
      return { success: false, message: 'Invalid winner team.' };
    }
    
    // Update all bet results for this match
    betRepository.updateMatchResults(match.id, winner);
    
    // Get winning bets and pay them out
    const winningBets = betRepository.getWinningBets(match.id, winner);
    
    // Process payouts for winners
    winningBets.forEach(bet => {
      const payout = bet.amount * 2; // Fixed 2x payout
      
      // Create payout transaction and update balance
      this.balanceManager.adjustBalance(
        bet.user_id,
        bet.user_name || 'Unknown User',
        payout,
        'payout',
        bet.id
      );
      
      // Record the payout transaction
      transactionRepository.createPayoutTransaction(bet.user_id, payout, bet.id);
    });
    
    // Update match with winner
    matchRepository.setWinner(match.id, winner);
    
    return { success: true, message: `Match finished. ${winner} won! Bets paid out.` };
  }
  
  /**
   * Get match history
   * @param {number} limit - Maximum number of matches to return
   * @returns {Array} Match history
   */
  getMatchHistory(limit = 5) {
    return matchRepository.getHistory(limit);
  }
  
  /**
   * Get bets for a specific match
   * @param {number} matchId - Match ID
   * @returns {Array} Bets for the match
   */
  getMatchBets(matchId) {
    return betRepository.findByMatchId(matchId);
  }
  
  /**
   * Get a user's betting history
   * @param {string} userId - Discord user ID
   * @returns {Array} User's betting history
   */
  getUserBets(userId) {
    return betRepository.findByUserId(userId);
  }
}

module.exports = MatchManager; 