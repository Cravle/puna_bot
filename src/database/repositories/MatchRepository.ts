import db from '../Database.js';
import { Match, MatchStatus, Bet, MatchType, GameType } from '../../types/index.js';

/**
 * Repository for handling Match-related database operations
 */
class MatchRepository {
  /**
   * Create a new match
   *
   * @param {Partial<Match>} match - Match data
   * @returns {Match} The created match
   */
  create(match: Partial<Match>): Match {
    const stmt = db.getConnection().prepare(`
      INSERT INTO matches (
        team1, team2, status, match_type, 
        player1_id, player2_id, game_type, 
        event_title, event_description, participant_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    return stmt.get(
      match.team1,
      match.team2,
      match.status || 'pending',
      match.match_type || MatchType.TEAM,
      match.player1_id || null,
      match.player2_id || null,
      match.game_type || null,
      match.event_title || null,
      match.event_description || null,
      match.participant_id || null,
    ) as Match;
  }

  /**
   * Create a new 1v1 match
   *
   * @param {string} player1Id - ID of first player
   * @param {string} player2Id - ID of second player
   * @param {string} gameType - Type of game (e.g., 'dota2', 'cs2')
   * @returns {Match} The created match
   */
  create1v1Match(player1Id: string, player2Id: string, gameType: string): Match {
    let gameTypeEnum: GameType;

    // Convert string gameType to GameType enum
    switch (gameType) {
    case 'dota2':
      gameTypeEnum = GameType.DOTA;
      break;
    case 'cs2':
      gameTypeEnum = GameType.CS2;
      break;
    case 'valorant':
      gameTypeEnum = GameType.VALORANT;
      break;
    case 'lol':
      gameTypeEnum = GameType.LOL;
      break;
    default:
      gameTypeEnum = GameType.OTHER;
    }

    return this.create({
      team1: 'Player 1',
      team2: 'Player 2',
      match_type: MatchType.ONE_VS_ONE,
      player1_id: player1Id,
      player2_id: player2Id,
      game_type: gameTypeEnum,
    });
  }

  /**
   * Create a new team match
   *
   * @param {string} team1 - Name of team 1
   * @param {string} team2 - Name of team 2
   * @returns {Match} The created match
   */
  createTeamMatch(team1: string, team2: string): Match {
    return this.create({
      team1,
      team2,
      match_type: MatchType.TEAM,
    });
  }

  /**
   * Create a new event bet
   *
   * @param {string} eventTitle - Title of the event
   * @param {string} eventDescription - Description of the event
   * @param {string} participantId - ID of the participant (optional)
   * @returns {Match} The created match
   */
  createEventBet(eventTitle: string, eventDescription: string, participantId?: string): Match {
    return this.create({
      team1: 'Yes',
      team2: 'No',
      match_type: MatchType.EVENT,
      event_title: eventTitle,
      event_description: eventDescription,
      participant_id: participantId,
    });
  }

  /**
   * Get a match by ID
   *
   * @param {number} matchId - Match ID
   * @returns {Match|null} The match object or null if not found
   */
  findById(matchId: number): Match | null {
    const stmt = db.getConnection().prepare('SELECT * FROM matches WHERE id = ?');
    return stmt.get(matchId) as Match | null;
  }

  /**
   * Get the latest active match
   *
   * @returns {Match|null} The latest active match or null if none exists
   */
  getActiveMatch(): Match | null {
    const stmt = db
      .getConnection()
      .prepare(
        "SELECT * FROM matches WHERE status IN ('pending', 'started') ORDER BY id DESC LIMIT 1",
      );
    const match = stmt.get() as Match | null;

    if (match) {
      // Get bets for this match
      const betStmt = db.getConnection().prepare(`
        SELECT b.*, m.team1, m.team2, m.winner, m.status 
        FROM bets b
        JOIN matches m ON b.match_id = m.id
        WHERE b.match_id = ?
      `);

      match.bets = betStmt.all(match.id) as Bet[];
    }

    return match;
  }

  /**
   * Get the latest match regardless of status
   *
   * @returns {Match|null} The latest match or null if none exists
   */
  getLatestMatch(): Match | null {
    const stmt = db.getConnection().prepare(`
      SELECT * FROM matches 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    return stmt.get() as Match | null;
  }

  /**
   * Update match status
   *
   * @param {number} matchId - Match ID
   * @param {MatchStatus} status - New match status
   * @returns {Match|null} Updated match or null if match doesn't exist
   */
  updateStatus(matchId: number, status: MatchStatus): Match | null {
    const stmt = db.getConnection().prepare(`
      UPDATE matches
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `);

    return stmt.get(status, matchId) as Match | null;
  }

  /**
   * Set the winner of a match
   *
   * @param {number} matchId - Match ID
   * @param {string} winner - Name of the winning team
   * @returns {Match|null} Updated match or null if match doesn't exist
   */
  setWinner(matchId: number, winner: string): Match | null {
    const stmt = db.getConnection().prepare(`
      UPDATE matches
      SET winner = ?, status = 'done', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `);

    return stmt.get(winner, matchId) as Match | null;
  }

  /**
   * Delete a match by ID
   *
   * @param {number} matchId - Match ID
   * @returns {boolean} True if the match was deleted, false otherwise
   */
  delete(matchId: number): boolean {
    const stmt = db.getConnection().prepare('DELETE FROM matches WHERE id = ?');
    const result = stmt.run(matchId);
    return result.changes > 0;
  }

  /**
   * Get match history (most recent matches)
   *
   * @param {number} limit - Maximum number of matches to return
   * @returns {Match[]} Array of matches sorted by creation date
   */
  getHistory(limit = 10): Match[] {
    const stmt = db.getConnection().prepare(`
      SELECT * 
      FROM matches 
      WHERE status != 'none'
      ORDER BY created_at DESC 
      LIMIT ?
    `);

    return stmt.all(limit) as Match[];
  }

  /**
   * Start a match, changing status from pending to started
   *
   * @param {number} matchId - Match ID
   * @returns {Match|null} Updated match or null if not found
   */
  startMatch(matchId: number): Match | null {
    // First check if the match is pending
    const match = this.findById(matchId);

    // If match doesn't exist or isn't pending, return null
    if (!match || match.status !== 'pending') {
      return null;
    }

    // Update the match status to 'started'
    const stmt = db.getConnection().prepare(`
      UPDATE matches
      SET status = 'started', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? 
      RETURNING *
    `);

    return stmt.get(matchId) as Match | null;
  }

  /**
   * Get the current pending match (match that is created but not started)
   *
   * @returns {Match|null} Pending match or null if none exists
   */
  getPendingMatch(): Match | null {
    const stmt = db
      .getConnection()
      .prepare("SELECT * FROM matches WHERE status = 'pending' ORDER BY id DESC LIMIT 1");
    return stmt.get() as Match | null;
  }

  /**
   * Check if a match is started (betting closed)
   *
   * @param {number} matchId - Match ID
   * @returns {boolean} True if match is started or finished
   */
  isMatchStarted(matchId: number): boolean {
    const stmt = db.getConnection().prepare('SELECT status FROM matches WHERE id = ?');
    const result = stmt.get(matchId) as Match | null;

    return result ? result.status === 'started' || result.status === 'done' : false;
  }

  /**
   * Get time remaining until match auto-starts (in seconds)
   *
   * @param {number} matchId - Match ID
   * @returns {number} Seconds until auto-start, or 0 if already started
   */
  getTimeUntilStart(matchId: number): number {
    const stmt = db.getConnection().prepare(`
      SELECT CAST(strftime('%s', DATETIME(created_at, '+5 minutes')) - strftime('%s', 'now') AS INTEGER) AS secondsRemaining
      FROM matches 
      WHERE id = ? AND status = 'pending'
    `);

    const result = stmt.get(matchId) as { secondsRemaining: number } | null;
    return result ? Math.max(0, result.secondsRemaining) : 0;
  }

  /**
   * Get active matches by type
   *
   * @param {MatchType} matchType - Type of match to retrieve
   * @returns {Match|null} The latest active match of the given type
   */
  getActiveMatchByType(matchType: MatchType): Match | null {
    const stmt = db
      .getConnection()
      .prepare(
        "SELECT * FROM matches WHERE status IN ('pending', 'started') AND match_type = ? ORDER BY id DESC LIMIT 1",
      );
    const match = stmt.get(matchType) as Match | null;

    if (match) {
      // Get bets for this match
      const betStmt = db.getConnection().prepare(`
        SELECT b.*, m.team1, m.team2, m.winner, m.status 
        FROM bets b
        JOIN matches m ON b.match_id = m.id
        WHERE b.match_id = ?
      `);

      match.bets = betStmt.all(match.id) as Bet[];
    }

    return match;
  }
}

// Export a singleton instance
const matchRepository = new MatchRepository();
export default matchRepository;
