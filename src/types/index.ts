// Types for Discord Betting Bot

// User entity
export interface User {
  id: string;
  name: string;
  balance: number;
  created_at?: string;
}

// Match types
export enum MatchType {
  TEAM = 'team',
  ONE_VS_ONE = '1v1',
  EVENT = 'event',
}

export enum GameType {
  DOTA = 'dota',
  CS2 = 'cs2',
  VALORANT = 'valorant',
  LOL = 'lol',
  OTHER = 'other',
}

// Match entity
export type MatchStatus = 'pending' | 'started' | 'done' | 'canceled' | 'none';

export interface Match {
  id: number;
  status: MatchStatus;
  match_type: MatchType;
  team1: string;
  team2: string;
  player1_id?: string;
  player2_id?: string;
  game_type?: GameType;
  event_title?: string;
  event_description?: string;
  participant_id?: string;
  winner?: string;
  created_at?: string;
  started_at?: string;
  updated_at?: string;
  bets?: Bet[];
}

// Event entity
export type EventStatus = 'pending' | 'started' | 'done' | 'canceled';

export interface Event {
  id: number;
  title: string;
  description?: string;
  participant_id?: string;
  participant_name?: string;
  status: EventStatus;
  success?: boolean;
  created_at?: string;
  updated_at?: string;
  bets?: EventBet[];
  // Extended properties for statistics
  yesBets?: EventBet[];
  noBets?: EventBet[];
  yesTotal?: number;
  noTotal?: number;
  totalAmount?: number;
}

// Bet entity
export type BetResult = 'win' | 'loss' | 'refund' | 'pending';

export interface Bet {
  id: number;
  user_id: string;
  match_id: number;
  team: string;
  amount: number;
  result: BetResult;
  created_at?: string;
  user_name?: string;
}

// Event bet entity
export type EventBetStatus = 'pending' | 'paid' | 'lost';

export interface EventBet {
  id: number;
  user_id: string;
  event_id: number;
  outcome: boolean;
  amount: number;
  status: EventBetStatus;
  created_at?: string;
  updated_at?: string;
  user_name?: string;
}

// Transaction entity
export type TransactionType =
  | 'init'
  | 'bet'
  | 'payout'
  | 'refund'
  | 'donate'
  | 'event_bet'
  | 'event_payout';

export interface Transaction {
  id: number;
  user_id: string;
  amount: number;
  type: TransactionType;
  reference_id?: number;
  created_at?: string;
  user_name?: string;
  match_info?: string;
}

// Result types
export interface OperationResult {
  success: boolean;
  message: string;
  data?: any;
}

// Discord.js types
export interface DiscordMember {
  id: string;
  user: {
    id: string;
    username: string;
    bot: boolean;
  };
}

export interface DiscordMessage {
  content: string;
  author: {
    id: string;
    username: string;
  };
  reply: (text: string) => Promise<void>;
  channel: {
    send: (text: string) => Promise<void>;
  };
  member: {
    permissions: {
      has: (permission: string) => boolean;
    };
  };
  guild: {
    members: {
      fetch: () => Promise<Map<string, DiscordMember>>;
    };
  };
}
