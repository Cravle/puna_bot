import db from '../Database.js';
import { Event, EventBet, User } from '../../types/index.js';

/**
 * Repository for handling Event-related database operations
 */
class EventRepository {
  /**
   * Create a new event
   *
   * @param {Partial<Event>} event - Event data
   * @returns {Event} The created event
   */
  create(event: Partial<Event>): Event {
    const stmt = db.getConnection().prepare(`
      INSERT INTO events (
        title, description, participant_id, status
      )
      VALUES (?, ?, ?, ?)
      RETURNING *
    `);

    return stmt.get(
      event.title,
      event.description || null,
      event.participant_id || null,
      event.status || 'pending',
    ) as Event;
  }

  /**
   * Get an event by ID
   *
   * @param {number} eventId - Event ID
   * @returns {Event|null} The event object or null if not found
   */
  findById(eventId: number): Event | null {
    const stmt = db.getConnection().prepare('SELECT * FROM events WHERE id = ?');
    const event = stmt.get(eventId) as Event | null;

    if (event) {
      // Get bets for this event
      const betStmt = db.getConnection().prepare(`
        SELECT eb.*, u.name as user_name 
        FROM event_bets eb
        JOIN users u ON eb.user_id = u.id
        WHERE eb.event_id = ?
      `);

      event.bets = betStmt.all(event.id) as EventBet[];
    }

    return event;
  }

  /**
   * Get the latest active event
   *
   * @returns {Event|null} The latest active event or null if none exists
   */
  getActiveEvent(): Event | null {
    const stmt = db
      .getConnection()
      .prepare(
        "SELECT * FROM events WHERE status IN ('pending', 'started') ORDER BY id DESC LIMIT 1",
      );
    const event = stmt.get() as Event | null;

    if (event) {
      // Get bets for this event
      const betStmt = db.getConnection().prepare(`
        SELECT eb.*, u.name as user_name 
        FROM event_bets eb
        JOIN users u ON eb.user_id = u.id
        WHERE eb.event_id = ?
      `);

      event.bets = betStmt.all(event.id) as EventBet[];
    }

    return event;
  }

  /**
   * Get the latest event regardless of status
   *
   * @returns {Event|null} The latest event or null if none exists
   */
  getLatestEvent(): Event | null {
    const stmt = db.getConnection().prepare(`
      SELECT * FROM events 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    return stmt.get() as Event | null;
  }

  /**
   * Update event status
   *
   * @param {number} eventId - Event ID
   * @param {string} status - New event status
   * @returns {Event|null} Updated event or null if event doesn't exist
   */
  updateStatus(eventId: number, status: string): Event | null {
    const stmt = db.getConnection().prepare(`
      UPDATE events
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `);

    return stmt.get(status, eventId) as Event | null;
  }

  /**
   * Set the result of an event
   *
   * @param {number} eventId - Event ID
   * @param {boolean} success - Whether the event was successful
   * @returns {Event|null} Updated event or null if event doesn't exist
   */
  setResult(eventId: number, success: boolean): Event | null {
    const stmt = db.getConnection().prepare(`
      UPDATE events
      SET success = ?, status = 'done', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `);

    return stmt.get(success, eventId) as Event | null;
  }

  /**
   * Get recent events history
   *
   * @param {number} limit - Maximum number of events to return
   * @returns {Event[]} Array of recent events
   */
  getHistory(limit = 10): Event[] {
    const stmt = db.getConnection().prepare(`
      SELECT e.*, u.name as participant_name
      FROM events e
      LEFT JOIN users u ON e.participant_id = u.id
      ORDER BY e.created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Event[];
  }

  /**
   * Place a bet on an event
   *
   * @param {string} userId - User ID
   * @param {number} eventId - Event ID
   * @param {boolean} outcome - Predicted outcome (true/false)
   * @param {number} amount - Bet amount
   * @returns {EventBet} The created bet
   */
  placeBet(userId: string, eventId: number, outcome: boolean, amount: number): EventBet {
    const stmt = db.getConnection().prepare(`
      INSERT INTO event_bets (
        user_id, event_id, outcome, amount
      )
      VALUES (?, ?, ?, ?)
      RETURNING *
    `);

    return stmt.get(userId, eventId, outcome, amount) as EventBet;
  }

  /**
   * Get all bets for an event
   *
   * @param {number} eventId - Event ID
   * @returns {EventBet[]} Array of bets for the event
   */
  getEventBets(eventId: number): EventBet[] {
    const stmt = db.getConnection().prepare(`
      SELECT eb.*, u.name as user_name 
      FROM event_bets eb
      JOIN users u ON eb.user_id = u.id
      WHERE eb.event_id = ?
    `);

    return stmt.all(eventId) as EventBet[];
  }

  /**
   * Check if a user has already bet on an event
   *
   * @param {string} userId - User ID
   * @param {number} eventId - Event ID
   * @returns {boolean} Whether the user has already bet on the event
   */
  userHasBet(userId: string, eventId: number): boolean {
    const stmt = db.getConnection().prepare(`
      SELECT COUNT(*) as count 
      FROM event_bets 
      WHERE user_id = ? AND event_id = ?
    `);

    const result = stmt.get(userId, eventId) as { count: number };
    return result.count > 0;
  }

  /**
   * Mark bets as paid for an event
   *
   * @param {number} eventId - Event ID
   * @param {boolean} success - The event outcome
   * @returns {number} Number of bets updated
   */
  markBetsAsPaid(eventId: number, success: boolean): number {
    const stmt = db.getConnection().prepare(`
      UPDATE event_bets
      SET status = 'paid', updated_at = CURRENT_TIMESTAMP
      WHERE event_id = ? AND outcome = ?
    `);

    const result = stmt.run(eventId, success);
    return result.changes;
  }

  /**
   * Mark bets as lost for an event
   *
   * @param {number} eventId - Event ID
   * @param {boolean} success - The event outcome
   * @returns {number} Number of bets updated
   */
  markBetsAsLost(eventId: number, success: boolean): number {
    const stmt = db.getConnection().prepare(`
      UPDATE event_bets
      SET status = 'lost', updated_at = CURRENT_TIMESTAMP
      WHERE event_id = ? AND outcome != ?
    `);

    const result = stmt.run(eventId, success);
    return result.changes;
  }

  /**
   * Get events filtered by status
   *
   * @param {string[]} statuses - Array of statuses to filter by
   * @param {number} limit - Maximum number of events to return
   * @returns {Event[]} Array of filtered events
   */
  getEventsByStatus(statuses: string[], limit = 10): Event[] {
    // Create a placeholder list for the SQL query
    const placeholders = statuses.map(() => '?').join(',');

    const stmt = db.getConnection().prepare(`
      SELECT e.*, u.name as participant_name
      FROM events e
      LEFT JOIN users u ON e.participant_id = u.id
      WHERE e.status IN (${placeholders})
      ORDER BY e.created_at DESC
      LIMIT ?
    `);

    // Create parameters array with statuses and limit
    const params = [...statuses, limit];

    return stmt.all(...params) as Event[];
  }
}

// Create a singleton instance
const instance = new EventRepository();

export default instance;
