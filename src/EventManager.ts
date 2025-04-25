import { Event, EventBet, OperationResult, EventStatus } from './types/index.js';
import { BalanceManager } from './BalanceManager.js';
import { Logger } from './utils/Logger.js';
import eventRepository from './database/repositories/EventRepository.js';
import transactionRepository from './database/repositories/TransactionRepository.js';

/**
 * Manager for event-related operations
 */
export class EventManager {
  private balanceManager: BalanceManager;
  private eventTimers: Map<number, NodeJS.Timeout> = new Map();
  private BETTING_WINDOW_SECONDS = 300; // 5 minutes

  constructor(balanceManager: BalanceManager) {
    this.balanceManager = balanceManager;
    this.initializeTimers();
  }

  /**
   * Initialize timers for pending events
   */
  private initializeTimers(): void {
    const pendingEvent = eventRepository.getActiveEvent();
    if (pendingEvent) {
      const timeRemaining = this.getBettingTimeRemaining();
      if (timeRemaining > 0) {
        this.scheduleEventStart(pendingEvent.id, timeRemaining);
      } else {
        // Auto-start if time is up
        this.startEvent(pendingEvent.id);
      }
    }
  }

  /**
   * Schedule an event to automatically start after the betting window
   * @param {number} eventId - Event ID
   * @param {number} timeRemaining - Time remaining in seconds
   */
  private scheduleEventStart(eventId: number, timeRemaining?: number): void {
    // Clear any existing timer for this event
    if (this.eventTimers.has(eventId)) {
      clearTimeout(this.eventTimers.get(eventId));
      this.eventTimers.delete(eventId);
    }

    // Set a timer to automatically start the event
    const timeout = setTimeout(() => {
      this.startEvent(eventId);
      this.eventTimers.delete(eventId);
    }, (timeRemaining || this.BETTING_WINDOW_SECONDS) * 1000);

    this.eventTimers.set(eventId, timeout);
    Logger.info(
      'Event',
      `Event #${eventId} scheduled to start in ${
        timeRemaining || this.BETTING_WINDOW_SECONDS
      } seconds`,
    );
  }

  /**
   * Create a new event
   * @param {string} title - Event title
   * @param {string} description - Event description
   * @param {string} participantId - Discord user ID of the participant
   * @returns {Event} Created event data
   */
  createEvent(title: string, description: string, participantId?: string): Event {
    const event = eventRepository.create({
      title,
      description,
      participant_id: participantId,
      status: 'pending',
    });

    // Schedule auto-start timer
    this.scheduleEventStart(event.id);

    return event;
  }

  /**
   * Get the current active event
   * @returns {Event|null} Active event or null if none
   */
  getCurrentEvent(): Event | null {
    return eventRepository.getActiveEvent();
  }

  /**
   * Get time remaining for betting on current event
   * @returns {number} Seconds remaining, or 0 if no active event or already started
   */
  getBettingTimeRemaining(eventId?: number): number {
    let event: Event | null;

    if (eventId) {
      // Get specific event if ID is provided
      event = eventRepository.findById(eventId);
    } else {
      // Otherwise get the latest active event
      event = eventRepository.getActiveEvent();
    }

    if (!event || event.status !== 'pending') return 0;

    // If created_at is more than 5 minutes ago, betting window has closed
    const createdAt = new Date(event.created_at as string).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - createdAt) / 1000);

    // Make sure we don't return negative time
    return Math.max(0, this.BETTING_WINDOW_SECONDS - elapsed);
  }

  /**
   * Start an event to close betting
   * @param {number} eventId - Event ID to start
   * @returns {OperationResult} Result with success status and message
   */
  startEvent(eventId: number): OperationResult {
    // Clear any existing timer
    if (this.eventTimers.has(eventId)) {
      clearTimeout(this.eventTimers.get(eventId));
      this.eventTimers.delete(eventId);
    }

    // Get event data
    const event = eventRepository.findById(eventId);
    if (!event) {
      return { success: false, message: 'Event not found.' };
    }

    if (event.status !== 'pending') {
      return { success: false, message: 'Event has already started or is completed.' };
    }

    // Start the event (close betting)
    const startedEvent = eventRepository.updateStatus(eventId, 'started');
    if (!startedEvent) {
      return { success: false, message: 'Failed to start event.' };
    }

    // Generate bet statistics for announcement
    const bets = this.getEventBets(eventId);
    const yesBets = bets.filter(b => b.outcome === true);
    const noBets = bets.filter(b => b.outcome === false);
    const yesTotal = yesBets.reduce((sum, bet) => sum + bet.amount, 0);
    const noTotal = noBets.reduce((sum, bet) => sum + bet.amount, 0);
    const totalBets = bets.length;
    const totalAmount = yesTotal + noTotal;

    Logger.success('Event', `Event #${eventId} has started! Betting is now closed.`);

    // Return success status with event data
    return {
      success: true,
      message: `Event #${eventId} started! Betting is now closed.`,
      data: {
        event: startedEvent,
        bets: {
          total: totalBets,
          totalAmount,
          yes: {
            count: yesBets.length,
            amount: yesTotal,
          },
          no: {
            count: noBets.length,
            amount: noTotal,
          },
        },
      },
    };
  }

  /**
   * Place a bet on an event outcome
   * @param {string} userId - Discord user ID
   * @param {string} username - Discord username
   * @param {number} eventId - Event ID
   * @param {boolean} outcome - Predicted outcome (true/false)
   * @param {number} amount - Bet amount
   * @returns {OperationResult} Result with success status and message
   */
  placeBet(
    userId: string,
    username: string,
    eventId: number,
    outcome: boolean,
    amount: number,
  ): OperationResult {
    // Get the event
    const event = eventRepository.findById(eventId);

    // Validate event
    if (!event) {
      return { success: false, message: `Event #${eventId} not found.` };
    }

    // Verify event is still accepting bets
    if (event.status !== 'pending') {
      return { success: false, message: 'Betting is closed! The event has already started.' };
    }

    // Calculate remaining time for this specific event
    const timeRemaining = this.getBettingTimeRemaining(eventId);
    if (timeRemaining <= 0) {
      // Auto-start the event if time is up
      this.startEvent(event.id);
      return { success: false, message: 'Betting time has expired! The event has now started.' };
    }

    // Check if user has already bet on this event
    if (eventRepository.userHasBet(userId, event.id)) {
      return { success: false, message: 'You already placed a bet on this event.' };
    }

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return { success: false, message: 'Invalid bet amount!' };
    }

    // Check user balance
    const userBalance = this.balanceManager.getBalance(userId);
    if (userBalance < amount) {
      return { success: false, message: 'Not enough balance!' };
    }

    // Create bet record
    const bet = eventRepository.placeBet(userId, event.id, outcome, amount);

    // Deduct balance
    this.balanceManager.adjustBalance(userId, username, -amount, 'event_bet', bet.id);

    // Record the transaction
    transactionRepository.create({
      userId,
      amount: -amount,
      type: 'event_bet',
      referenceId: bet.id,
    });

    // Format remaining time for message
    const minutesRemaining = Math.floor(timeRemaining / 60);
    const secondsRemaining = timeRemaining % 60;
    const timeRemainingStr =
      minutesRemaining > 0 ? `${minutesRemaining}m ${secondsRemaining}s` : `${secondsRemaining}s`;

    return {
      success: true,
      message: `Bet of ${amount} PunaCoins on ${
        outcome ? 'Yes' : 'No'
      } accepted. Betting closes in ${timeRemainingStr}.`,
      data: bet,
    };
  }

  /**
   * Set the result of an event and pay out bets
   * @param {number} eventId - Event ID
   * @param {boolean} success - Whether the event was successful
   * @returns {OperationResult} Result with success status and message
   */
  setEventResult(eventId: number, success: boolean): OperationResult {
    // Get the event
    const event = eventRepository.findById(eventId);
    if (!event) {
      return { success: false, message: `Event #${eventId} not found.` };
    }

    // Check event status
    if (event.status === 'done') {
      return { success: false, message: 'Event result has already been set.' };
    }

    // Set event result
    const updatedEvent = eventRepository.setResult(eventId, success);
    if (!updatedEvent) {
      return { success: false, message: 'Failed to set event result.' };
    }

    // Get all bets for this event
    const bets = eventRepository.getEventBets(eventId);

    // Process winning bets
    const winningBets = bets.filter(bet => bet.outcome === success);
    winningBets.forEach(bet => {
      const payout = bet.amount * 2; // 2x payout for now, could be dynamic based on odds

      // Add winnings to user balance
      this.balanceManager.adjustBalance(
        bet.user_id,
        bet.user_name || 'Unknown User',
        payout,
        'event_payout',
        bet.id,
      );

      // Record the payout transaction
      transactionRepository.create({
        userId: bet.user_id,
        amount: payout,
        type: 'event_payout',
        referenceId: bet.id,
      });
    });

    // Mark bets as paid/lost
    eventRepository.markBetsAsPaid(eventId, success);
    eventRepository.markBetsAsLost(eventId, success);

    return {
      success: true,
      message: `Event result set to ${success ? 'Success' : 'Failed'}. Payouts processed.`,
      data: {
        event: updatedEvent,
        winningBets,
        totalPaid: winningBets.length,
      },
    };
  }

  /**
   * Get all bets for an event
   * @param {number} eventId - Event ID
   * @returns {EventBet[]} Array of bets for the event
   */
  getEventBets(eventId: number): EventBet[] {
    return eventRepository.getEventBets(eventId);
  }

  /**
   * Get recent events history
   * @param {number} limit - Maximum number of events to return
   * @returns {Event[]} Array of recent events
   */
  getEventHistory(limit = 5): Event[] {
    return eventRepository.getHistory(limit);
  }

  /**
   * Cancel an event and refund all bets
   * @param {number} eventId - Event ID to cancel
   * @returns {OperationResult} Result with success status and message
   */
  cancelEvent(eventId: number): OperationResult {
    // Get the event
    const event = eventRepository.findById(eventId);

    // Validate event exists
    if (!event) {
      return { success: false, message: `Event #${eventId} not found.` };
    }

    // Check if event can be canceled
    if (event.status === 'done') {
      return { success: false, message: 'Cannot cancel an event that has been completed.' };
    }

    // Get all bets for this event
    const bets = eventRepository.getEventBets(eventId);

    // Refund each bet
    bets.forEach(bet => {
      // Return money to user's balance
      this.balanceManager.adjustBalance(
        bet.user_id,
        bet.user_name || 'Unknown User',
        bet.amount, // Refund the full amount
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
    });

    // Clear any existing timer
    if (this.eventTimers.has(eventId)) {
      clearTimeout(this.eventTimers.get(eventId));
      this.eventTimers.delete(eventId);
    }

    // Update event status
    eventRepository.updateStatus(eventId, 'canceled');

    return {
      success: true,
      message: `Event #${eventId} canceled. All bets have been refunded.`,
      data: { eventId, refundedBets: bets.length },
    };
  }

  /**
   * Get events with optional filtering
   * @param {string} filter - Filter by status ('all', 'active', 'completed')
   * @param {number} limit - Maximum number of events to return
   * @returns {Event[]} Array of events
   */
  getEvents(filter = 'all', limit = 10): Event[] {
    let events: Event[];

    switch (filter) {
    case 'active':
      // Get pending and started events
      events = eventRepository.getEventsByStatus(['pending', 'started'], limit);
      break;
    case 'completed':
      // Get done events
      events = eventRepository.getEventsByStatus(['done'], limit);
      break;
    default:
      // Get all events
      events = eventRepository.getHistory(limit);
    }

    return events;
  }

  /**
   * Get detailed information about a specific event
   * @param {number} eventId - Event ID
   * @returns {Event|null} Event with detailed information or null if not found
   */
  getEventInfo(eventId: number): Event | null {
    const event = eventRepository.findById(eventId);
    if (!event) return null;

    // Get bets for this event
    const bets = eventRepository.getEventBets(eventId);
    event.bets = bets;

    // Calculate statistics
    const yesBets = bets.filter(bet => bet.outcome === true);
    const noBets = bets.filter(bet => bet.outcome === false);
    const yesTotal = yesBets.reduce((sum, bet) => sum + bet.amount, 0);
    const noTotal = noBets.reduce((sum, bet) => sum + bet.amount, 0);

    // Add aggregated stats to event object
    const eventWithStats: Event = {
      ...event,
      yesBets,
      noBets,
      yesTotal,
      noTotal,
      totalAmount: yesTotal + noTotal,
    };

    return eventWithStats;
  }
}
