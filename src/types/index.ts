// Types for Discord Betting Bot

// User entity
export interface User {
  id: string;
  name: string;
  balance: number;
  created_at?: string;
}

// Match entity
export type MatchStatus = 'pending' | 'done' | 'canceled' | 'none';

export interface Match {
  id: number;
  status: MatchStatus;
  team1: string;
  team2: string;
  winner?: string;
  created_at?: string;
  updated_at?: string;
  bets?: Bet[];
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

// Transaction entity
export type TransactionType = 'init' | 'bet' | 'payout' | 'refund' | 'donate';

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