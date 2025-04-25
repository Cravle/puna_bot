/**
 * Logger utility for pretty console output
 */
export class Logger {
  private static getTimestamp(): string {
    const now = new Date();
    return `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  }

  /**
   * Log an informational message
   * @param component Component name (e.g., 'Bot', 'Database')
   * @param message The message to log
   */
  static info(component: string, message: string): void {
    console.log(`[${this.getTimestamp()}] 💬 \x1b[36m[${component}]\x1b[0m ${message}`);
  }

  /**
   * Log a success message
   * @param component Component name
   * @param message The message to log
   */
  static success(component: string, message: string): void {
    console.log(`[${this.getTimestamp()}] ✅ \x1b[32m[${component}]\x1b[0m ${message}`);
  }

  /**
   * Log a warning message
   * @param component Component name
   * @param message The message to log
   */
  static warn(component: string, message: string): void {
    console.log(`[${this.getTimestamp()}] ⚠️ \x1b[33m[${component}]\x1b[0m ${message}`);
  }

  /**
   * Log an error message
   * @param component Component name
   * @param message The error message
   * @param error Optional error object
   */
  static error(component: string, message: string, error?: any): void {
    console.error(`[${this.getTimestamp()}] ❌ \x1b[31m[${component}]\x1b[0m ${message}`);
    if (error) {
      console.error(`\x1b[31m${error.stack || error}\x1b[0m`);
    }
  }

  /**
   * Log a debug message (only in development)
   * @param component Component name
   * @param message The debug message
   */
  static debug(component: string, message: string): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${this.getTimestamp()}] 🔍 \x1b[35m[${component}]\x1b[0m ${message}`);
    }
  }

  /**
   * Log a command received from a user
   * @param userId User ID
   * @param username Username
   * @param command Full command text
   */
  static command(userId: string, username: string, command: string): void {
    console.log(`[${this.getTimestamp()}] 🤖 \x1b[34m[Command]\x1b[0m ${username} (${userId}): ${command}`);
  }

  /**
   * Log a bet placed by a user
   * @param userId User ID
   * @param username Username
   * @param matchId Match ID
   * @param team Team name
   * @param amount Bet amount
   */
  static bet(userId: string, username: string, matchId: number, team: string, amount: number): void {
    console.log(
      `[${this.getTimestamp()}] 🎲 \x1b[33m[Bet]\x1b[0m ${username} (${userId}) bet ${amount} PunaCoins on ${team} in match #${matchId}`
    );
  }

  /**
   * Log a match result
   * @param matchId Match ID
   * @param team1 First team
   * @param team2 Second team
   * @param winner Winning team
   * @param totalBets Total number of bets
   * @param totalAmount Total amount bet
   */
  static matchResult(
    matchId: number, 
    team1: string, 
    team2: string, 
    winner: string, 
    totalBets: number, 
    totalAmount: number
  ): void {
    console.log(
      `[${this.getTimestamp()}] 🏆 \x1b[32m[Match Result]\x1b[0m Match #${matchId} ${team1} vs ${team2} - Winner: ${winner} (${totalBets} bets, ${totalAmount} PunaCoins total)`
    );
  }
} 