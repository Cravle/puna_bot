import matchRepository from './database/repositories/MatchRepository.js';
import betRepository from './database/repositories/BetRepository.js';
import transactionRepository from './database/repositories/TransactionRepository.js';
import { BalanceManager } from './BalanceManager.js';
import { Match, Bet, OperationResult, MatchType } from './types/index.js';
import { Logger } from './utils/Logger.js';

/**
 * Manages betting matches and bet placements
 */
export class MatchManager {
  private balanceManager: BalanceManager;
  private matchTimers: Map<number, NodeJS.Timeout> = new Map();

  /**
   * @param {BalanceManager} balanceManager - Balance manager instance
   */
  constructor(balanceManager: BalanceManager) {
    this.balanceManager = balanceManager;
    this.initializeTimers();
  }

  /**
   * Initialize timers for any pending matches at startup
   */
  private initializeTimers(): void {
    const pendingMatch = matchRepository.getPendingMatch();
    if (pendingMatch) {
      this.scheduleMatchStart(pendingMatch.id);
    }
  }

  /**
   * Schedule a timer to automatically start a match after 5 minutes
   * @param {number} matchId - Match ID
   */
  private scheduleMatchStart(matchId: number): void {
    // Clear any existing timer for this match
    if (this.matchTimers.has(matchId)) {
      clearTimeout(this.matchTimers.get(matchId));
      this.matchTimers.delete(matchId);
    }

    // Get remaining time until match should start
    const timeRemaining = matchRepository.getTimeUntilStart(matchId);

    // If time's already up, start the match immediately
    if (timeRemaining <= 0) {
      this.startMatchInternal(matchId);
      return;
    }

    // Otherwise, set timer
    Logger.info('Match', `Match #${matchId} will automatically start in ${timeRemaining} seconds`);

    const timer = setTimeout(() => {
      this.startMatchInternal(matchId);
      this.matchTimers.delete(matchId);
    }, timeRemaining * 1000);

    this.matchTimers.set(matchId, timer);
  }

  /**
   * Get the current match (pending or started)
   * @returns {Match|null} Current match or null if none exists
   */
  getCurrentMatch(): Match | null {
    return matchRepository.getActiveMatch();
  }

  /**
   * Create a new 1v1 match between two users
   * @param {string} user1Id - First user ID
   * @param {string} user1Name - First user name
   * @param {string} user2Id - Second user ID
   * @param {string} user2Name - Second user name
   * @returns {Match} Created match data
   */
  createUserMatch(user1Id: string, user1Name: string, user2Id: string, user2Name: string): Match {
    const match = matchRepository.create({
      match_type: MatchType.ONE_VS_ONE,
      team1: user1Name,
      team2: user2Name,
      player1_id: user1Id,
      player2_id: user2Id,
      status: 'pending',
    });

    // Schedule auto-start timer
    this.scheduleMatchStart(match.id);

    return match;
  }

  /**
   * Create a new team match
   * @param {string} team1 - First team name
   * @param {string} team2 - Second team name
   * @returns {Match} Created match data
   */
  createTeamMatch(team1: string, team2: string): Match {
    const match = matchRepository.create({
      match_type: MatchType.TEAM,
      team1,
      team2,
      status: 'pending',
    });

    // Schedule auto-start timer
    this.scheduleMatchStart(match.id);

    return match;
  }

  /**
   * Get a match by ID
   * @param {number} matchId - Match ID
   * @returns {Match|null} Match data or null if not found
   */
  getMatch(matchId: number): Match | null {
    return matchRepository.findById(matchId);
  }

  /**
   * Get time remaining for betting on a specific match
   * @param {number} matchId - Match ID
   * @returns {number} Seconds remaining, or 0 if match already started or not found
   */
  getBettingTimeRemaining(matchId: number): number {
    const match = matchRepository.findById(matchId);
    if (!match || match.status !== 'pending') return 0;

    return matchRepository.getTimeUntilStart(match.id);
  }

  /**
   * Cancel a specific match
   * @param {number} matchId - Match ID to cancel
   * @returns {OperationResult} Result with success status and message
   */
  cancelMatch(matchId: number): OperationResult {
    // Clear any existing timer
    if (this.matchTimers.has(matchId)) {
      clearTimeout(this.matchTimers.get(matchId));
      this.matchTimers.delete(matchId);
    }

    // Verify match exists and isn't already completed
    const match = matchRepository.findById(matchId);
    if (!match) {
      return { success: false, message: 'Match not found.' };
    }

    if (match.status === 'done') {
      return { success: false, message: 'Cannot cancel a completed match.' };
    }

    // Get all bets for this match
    const bets = betRepository.findByMatchId(matchId);

    // Refund all bets
    for (const bet of bets) {
      // Refund the bet amount to the user
      this.balanceManager.adjustBalance(
        bet.user_id,
        bet.user_name || 'Unknown User',
        bet.amount,
        'refund',
        bet.id,
      );

      // Record the refund transaction
      transactionRepository.create({
        userId: bet.user_id,
        amount: bet.amount,
        type: 'refund',
        referenceId: bet.id,
      });

      // Update bet record to 'refund' status
      betRepository.updateResult(bet.id, 'refund');
    }

    // Set match status to canceled
    matchRepository.updateStatus(matchId, 'canceled');

    Logger.success('Match', `Match #${matchId} has been canceled. All bets have been refunded.`);
    return {
      success: true,
      message: `Match #${matchId} canceled! All bets have been refunded.`,
      data: { refundedBets: bets.length },
    };
  }

  /**
   * Place a bet on a specific match
   * @param {string} userId - Discord user ID
   * @param {string} username - Discord username
   * @param {number} matchId - Match ID to bet on
   * @param {string} choice - Team name or user ID to bet on
   * @param {number} amount - Bet amount
   * @returns {OperationResult} Result with success status and message
   */
  placeBetOnMatch(
    userId: string,
    username: string,
    matchId: number,
    choice: string,
    amount: number,
  ): OperationResult {
    const match = matchRepository.findById(matchId);

    // Validate match status
    if (!match) {
      return { success: false, message: `Match #${matchId} not found.` };
    }

    // Verify match hasn't started yet
    if (match.status !== 'pending') {
      return { success: false, message: 'Betting is closed! The match has already started.' };
    }

    // Calculate remaining time
    const timeRemaining = matchRepository.getTimeUntilStart(matchId);
    if (timeRemaining <= 0) {
      // Auto-start the match if time is up
      this.startMatchInternal(matchId);
      return { success: false, message: 'Betting time has expired! The match has now started.' };
    }

    // Validate choice based on match type
    if (match.match_type === MatchType.ONE_VS_ONE) {
      // For 1v1, choice should be a user ID that matches one of the players
      if (choice !== match.player1_id && choice !== match.player2_id) {
        return { success: false, message: 'Invalid player selection!' };
      }
    } else if (match.match_type === MatchType.TEAM) {
      // For team matches, choice should be a team name
      if (choice !== match.team1 && choice !== match.team2) {
        return { success: false, message: 'Invalid team name!' };
      }
    }

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return { success: false, message: 'Invalid bet amount!' };
    }

    // Check if user has already bet on this match
    if (betRepository.userHasBet(userId, matchId)) {
      return { success: false, message: 'You already placed a bet on this match.' };
    }

    // Check user balance
    const userBalance = this.balanceManager.getBalance(userId);
    if (userBalance < amount) {
      return { success: false, message: 'Not enough balance!' };
    }

    // Create bet record
    const bet = betRepository.create({
      userId,
      matchId,
      team: choice,
      amount,
    });

    // Deduct balance
    this.balanceManager.adjustBalance(userId, username, -amount, 'bet', bet.id);

    // Format remaining time for message
    const minutesRemaining = Math.floor(timeRemaining / 60);
    const secondsRemaining = timeRemaining % 60;
    const timeRemainingStr =
      minutesRemaining > 0 ? `${minutesRemaining}m ${secondsRemaining}s` : `${secondsRemaining}s`;

    return {
      success: true,
      message: `Bet placed successfully! Betting closes in ${timeRemainingStr}.`,
      data: { bet, match },
    };
  }

  /**
   * Place a bet on a match (legacy method for compatibility)
   * @param {string} userId - Discord user ID
   * @param {string} username - Discord username
   * @param {number} matchId - Match ID to bet on
   * @param {string} choice - Team name or user ID to bet on
   * @param {number} amount - Bet amount
   * @returns {OperationResult} Result with success status and message
   */
  placeBet(
    userId: string,
    username: string,
    matchId: number,
    choice: string,
    amount: number,
  ): OperationResult {
    return this.placeBetOnMatch(userId, username, matchId, choice, amount);
  }

  /**
   * Finish a match with the specified winner
   * @param {number} matchId - Match ID
   * @param {string} winnerId - Winner ID
   * @returns {OperationResult} Result with success status and message
   */
  finishMatch(matchId: number, winnerId: string): OperationResult {
    const match = matchRepository.findById(matchId);

    // Validate match
    if (!match) {
      return { success: false, message: 'Match not found.' };
    }

    if (match.match_type === MatchType.ONE_VS_ONE) {
      return this.finishUserMatch(matchId, winnerId);
    } else if (match.match_type === MatchType.TEAM) {
      return this.finishTeamMatch(matchId, winnerId);
    } else {
      return { success: false, message: 'Invalid match type.' };
    }
  }

  /**
   * Finish a 1v1 match with a specific winner
   * @param {number} matchId - Match ID
   * @param {string} winnerId - Winner user ID
   * @returns {OperationResult} Result with success status and message
   */
  finishUserMatch(matchId: number, winnerId: string): OperationResult {
    const match = matchRepository.findById(matchId);

    // Validate match
    if (!match) {
      return { success: false, message: 'Match not found.' };
    }

    // Make sure this is a 1v1 match
    if (match.match_type !== MatchType.ONE_VS_ONE) {
      return { success: false, message: 'This is not a 1v1 match.' };
    }

    // Validate winner ID
    if (winnerId !== match.player1_id && winnerId !== match.player2_id) {
      return { success: false, message: 'Invalid winner ID. Must be one of the participants.' };
    }

    // Don't allow setting result for a canceled match
    if (match.status === 'canceled') {
      return { success: false, message: 'Cannot set result for a canceled match.' };
    }

    // Don't allow changing result of a finished match
    if (match.status === 'done') {
      return { success: false, message: 'Match result has already been set.' };
    }

    // Set match result
    const updatedMatch = matchRepository.setWinner(matchId, winnerId);

    // Validate update was successful
    if (!updatedMatch) {
      return { success: false, message: 'Failed to update match result.' };
    }

    // Get all bets for this match
    const bets = betRepository.findByMatchId(matchId);

    // Get winning and losing bets
    const winningBets = bets.filter((bet: Bet) => bet.team === winnerId);
    const losingBets = bets.filter((bet: Bet) => bet.team !== winnerId);

    // Process winning bets
    for (const bet of winningBets) {
      const payout = bet.amount * 2; // 2x payout

      // Add winnings to user balance
      this.balanceManager.adjustBalance(
        bet.user_id,
        bet.user_name || 'Unknown User',
        payout,
        'payout',
        bet.id,
      );

      // Update bet record to 'win' status
      betRepository.updateResult(bet.id, 'win');
    }

    // Update losing bets
    for (const bet of losingBets) {
      betRepository.updateResult(bet.id, 'loss');
    }

    // Get the winner's username for the log message
    const winnerUsername = winnerId === match.player1_id ? match.team1 : match.team2;

    Logger.success(
      'Match',
      `Match #${matchId} result set: ${winnerUsername} wins! ${winningBets.length} winning bets paid out.`,
    );

    return {
      success: true,
      message: 'Match result set and payouts processed.',
      data: {
        match: updatedMatch,
        winningBets: winningBets.length,
        losingBets: losingBets.length,
      },
    };
  }

  /**
   * Finish a team match with a specific winner
   * @param {number} matchId - Match ID
   * @param {string} winningTeam - Winning team name
   * @returns {OperationResult} Result with success status and message
   */
  finishTeamMatch(matchId: number, winningTeam: string): OperationResult {
    const match = matchRepository.findById(matchId);

    // Validate match
    if (!match) {
      return { success: false, message: 'Match not found.' };
    }

    // Make sure this is a team match
    if (match.match_type !== MatchType.TEAM) {
      return { success: false, message: 'This is not a team match.' };
    }

    // Validate winner
    if (winningTeam !== match.team1 && winningTeam !== match.team2) {
      return {
        success: false,
        message: 'Invalid winning team. Must be one of the teams in the match.',
      };
    }

    // Don't allow setting result for a canceled match
    if (match.status === 'canceled') {
      return { success: false, message: 'Cannot set result for a canceled match.' };
    }

    // Don't allow changing result of a finished match
    if (match.status === 'done') {
      return { success: false, message: 'Match result has already been set.' };
    }

    // Set match result
    const updatedMatch = matchRepository.setWinner(matchId, winningTeam);

    // Validate update was successful
    if (!updatedMatch) {
      return { success: false, message: 'Failed to update match result.' };
    }

    // Get all bets for this match
    const bets = betRepository.findByMatchId(matchId);

    // Get winning and losing bets
    const winningBets = bets.filter((bet: Bet) => bet.team === winningTeam);
    const losingBets = bets.filter((bet: Bet) => bet.team !== winningTeam);

    // Process winning bets
    for (const bet of winningBets) {
      const payout = bet.amount * 2; // 2x payout

      // Add winnings to user balance
      this.balanceManager.adjustBalance(
        bet.user_id,
        bet.user_name || 'Unknown User',
        payout,
        'payout',
        bet.id,
      );

      // Update bet record to 'win' status
      betRepository.updateResult(bet.id, 'win');
    }

    // Update losing bets
    for (const bet of losingBets) {
      betRepository.updateResult(bet.id, 'loss');
    }

    Logger.success(
      'Match',
      `Match #${matchId} result set: ${winningTeam} wins! ${winningBets.length} winning bets paid out.`,
    );

    return {
      success: true,
      message: 'Match result set and payouts processed.',
      data: {
        match: updatedMatch,
        winningBets: winningBets.length,
        losingBets: losingBets.length,
      },
    };
  }

  /**
   * Get match history
   * @param {number} limit - Maximum number of matches to return
   * @returns {Array} Match history
   */
  getMatchHistory(limit = 5): Match[] {
    return matchRepository.getHistory(limit);
  }

  /**
   * Get completed match history (only matches with "done" status)
   * @param {number} limit - Maximum number of matches to return
   * @returns {Array} Completed match history
   */
  getCompletedMatchHistory(limit = 5): Match[] {
    return matchRepository.getCompletedHistory(limit);
  }

  /**
   * Get bets for a specific match
   * @param {number} matchId - Match ID
   * @returns {Array} Bets for the match
   */
  getMatchBets(matchId: number): Bet[] {
    return betRepository.findByMatchId(matchId);
  }

  /**
   * Get a user's betting history
   * @param {string} userId - Discord user ID
   * @returns {Array} User's betting history
   */
  getUserBets(userId: string): Bet[] {
    return betRepository.findByUserId(userId);
  }

  /**
   * Generate a rich match announcement with betting information
   * @param {number} matchId - Match ID
   * @returns {string} Formatted match announcement
   */
  generateMatchAnnouncement(matchId: number): string {
    const match = matchRepository.findById(matchId);
    if (!match) return 'Match not found';

    const bets = betRepository.findByMatchId(matchId);

    // Determine what to filter on based on match type
    let team1Id = match.team1;
    let team2Id = match.team2;

    // For 1v1 matches, we need to filter by player IDs, not usernames
    if (match.match_type === MatchType.ONE_VS_ONE) {
      team1Id = match.player1_id || match.team1;
      team2Id = match.player2_id || match.team2;
    }

    const team1Bets = bets.filter(b => b.team === team1Id);
    const team2Bets = bets.filter(b => b.team === team2Id);

    const team1Total = team1Bets.reduce((sum, b) => sum + b.amount, 0);
    const team2Total = team2Bets.reduce((sum, b) => sum + b.amount, 0);
    const totalAmount = team1Total + team2Total;

    // Calculate percentages and odds
    const team1Percent = totalAmount > 0 ? ((team1Total / totalAmount) * 100).toFixed(1) : '50.0';
    const team2Percent = totalAmount > 0 ? ((team2Total / totalAmount) * 100).toFixed(1) : '50.0';

    // Sort bettors by amount
    const team1TopBettors = [...team1Bets].sort((a, b) => b.amount - a.amount).slice(0, 3);
    const team2TopBettors = [...team2Bets].sort((a, b) => b.amount - a.amount).slice(0, 3);

    const team1BettorsText =
      team1TopBettors.length > 0
        ? team1TopBettors.map(b => `<@${b.user_id}>: ${b.amount} PunaCoins`).join('\n• ')
        : 'No bets placed';

    const team2BettorsText =
      team2TopBettors.length > 0
        ? team2TopBettors.map(b => `<@${b.user_id}>: ${b.amount} PunaCoins`).join('\n• ')
        : 'No bets placed';

    // Create a visually enhanced announcement
    return `
🎮 **MATCH HAS STARTED!** 🎮
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Match #${match.id}**
**${match.team1}** ⚔️ **${match.team2}**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **BETTING SUMMARY**

💰 **Total Amount**: ${totalAmount} PunaCoins
📈 **Odds**: ${team1Percent}% : ${team2Percent}%
👥 **Participants**: ${bets.length} bettors (${team1Bets.length} vs ${team2Bets.length})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔵 **${match.team1}** (${team1Bets.length} bets, ${team1Total} PunaCoins)
• ${team1BettorsText}

🔴 **${match.team2}** (${team2Bets.length} bets, ${team2Total} PunaCoins)
• ${team2BettorsText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏰ **BETTING IS NOW CLOSED!**
The match result will be announced soon.
`;
  }

  /**
   * Force start a match
   * @param {number} matchId - Match ID to start
   * @returns {OperationResult} Result with success status and message
   */
  startMatch(matchId: number): OperationResult {
    return this.startMatchInternal(matchId);
  }

  /**
   * Internal method to start a match
   * @param {number} matchId - Match ID
   * @returns {OperationResult} Result with success status and message
   */
  private startMatchInternal(matchId: number): OperationResult {
    // Clear any existing timer for this match
    if (this.matchTimers.has(matchId)) {
      clearTimeout(this.matchTimers.get(matchId));
      this.matchTimers.delete(matchId);
    }

    // Get match data
    const match = matchRepository.findById(matchId);
    if (!match) {
      return { success: false, message: 'Match not found.' };
    }

    if (match.status !== 'pending') {
      return { success: false, message: 'Match has already started or is completed.' };
    }

    // Start the match (close betting)
    const startedMatch = matchRepository.startMatch(matchId);
    if (!startedMatch) {
      return { success: false, message: 'Failed to start match.' };
    }

    Logger.success('Match', `Match #${matchId} has started! Betting is now closed.`);

    // Generate bet statistics for announcement
    const bets = this.getMatchBets(matchId);

    // Determine what to filter on based on match type
    let team1Id = match.team1;
    let team2Id = match.team2;

    // For 1v1 matches, we need to filter by player IDs, not usernames
    if (match.match_type === MatchType.ONE_VS_ONE) {
      team1Id = match.player1_id || match.team1;
      team2Id = match.player2_id || match.team2;
    }

    const team1Bets = bets.filter(b => b.team === team1Id);
    const team2Bets = bets.filter(b => b.team === team2Id);
    const team1Total = team1Bets.reduce((sum, bet) => sum + bet.amount, 0);
    const team2Total = team2Bets.reduce((sum, bet) => sum + bet.amount, 0);
    const totalBets = bets.length;
    const totalAmount = team1Total + team2Total;

    // Return success status with match data
    return {
      success: true,
      message: `Match #${matchId} started! Betting is now closed.`,
      data: {
        match: startedMatch,
        bets: {
          total: totalBets,
          totalAmount,
          team1: {
            count: team1Bets.length,
            amount: team1Total,
          },
          team2: {
            count: team2Bets.length,
            amount: team2Total,
          },
        },
      },
    };
  }
}
