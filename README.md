# Discord Betting Bot

A Discord bot for managing bets on team matches with SQLite database storage.

## Features

- User balance management
- Create matches between teams
- Place bets on teams
- View leaderboard of top users by balance
- Cancel matches and refund bets
- Finish matches and pay out winners
- Transaction history tracking
- User bet history
- SQLite database for reliable data storage

## Project Structure

```
.
├── data/                    # Data storage directory
│   └── betting.db           # SQLite database file
├── src/                     # Source code
│   ├── database/            # Database related code
│   │   ├── Database.js      # SQLite connection manager
│   │   └── repositories/    # Repository classes
│   │       ├── UserRepository.js       # User data operations
│   │       ├── MatchRepository.js      # Match data operations
│   │       ├── BetRepository.js        # Bet data operations
│   │       └── TransactionRepository.js # Transaction data operations
│   ├── migrations/          # Database migrations
│   │   └── migrateJsonToSqlite.js # Migration from JSON to SQLite
│   ├── BalanceManager.js    # Balance management logic
│   ├── MatchManager.js      # Match and betting logic
│   └── BetBot.js            # Main Discord bot class
├── index.js                 # Entry point
├── .env                     # Environment variables (Discord token)
└── README.md                # This file
```

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with your Discord bot token:
   ```
   DISCORD_TOKEN=your_token_here
   ```
4. If you have existing JSON data and want to migrate it to SQLite:
   ```
   npm run migrate
   ```
5. Synchronize user information with Discord (recommended):
   ```
   npm run sync-users
   ```
6. Start the bot:
   ```
   npm start
   ```

## Scripts

- `npm start` - Start the bot
- `npm run dev` - Start the bot with hot reloading using nodemon
- `npm run migrate` - Migrate from JSON to SQLite database
- `npm run update-users` - Update names of existing users from Discord
- `npm run sync-users` - Sync all Discord users (add new ones and update existing)

## Commands

### Basic Commands
- `!balance` - Check your current balance
- `!bet <team> <amount>` - Place a bet on a team
- `!leaderboard` - View the top 5 users by balance
- `!help` - Show all available commands

### Match Commands
- `!match` - Show the current active match
- `!match create <team1> <team2>` - Create a match between two teams
- `!match cancel` - Cancel the current match and refund all bets
- `!match result <winner>` - Set the result of the match and pay out winners
- `!match list` - Show recent match history
- `!match info <id>` - Show details about a specific match

### User History
- `!history bets` - View your betting history
- `!history transactions` - View your transaction history

### Admin Commands
- `!init` - Initialize balances for all server members (admin only)

## Database Structure

The bot uses SQLite with the following tables:

### users
- `id` (TEXT PRIMARY KEY) - Discord user ID
- `name` (TEXT) - Discord username
- `balance` (INTEGER) - User's current balance
- `created_at` (TIMESTAMP) - When user was created

### matches
- `id` (INTEGER PRIMARY KEY) - Match ID
- `status` (TEXT) - Match status (pending/done/canceled/none)
- `team1` (TEXT) - First team name
- `team2` (TEXT) - Second team name
- `winner` (TEXT) - Winning team name (if match is done)
- `created_at` (TIMESTAMP) - When match was created
- `updated_at` (TIMESTAMP) - When match was last updated

### bets
- `id` (INTEGER PRIMARY KEY) - Bet ID
- `user_id` (TEXT) - Discord user ID
- `match_id` (INTEGER) - Match ID
- `team` (TEXT) - Team name bet on
- `amount` (INTEGER) - Bet amount
- `result` (TEXT) - Bet result (win/loss/refund/pending)
- `created_at` (TIMESTAMP) - When bet was placed

### transactions
- `id` (INTEGER PRIMARY KEY) - Transaction ID
- `user_id` (TEXT) - Discord user ID
- `amount` (INTEGER) - Transaction amount
- `type` (TEXT) - Transaction type (init/bet/payout/refund/donate)
- `reference_id` (INTEGER) - Reference to another record (e.g. bet ID)
- `created_at` (TIMESTAMP) - When transaction occurred

## Dependencies

- discord.js - Discord API integration
- dotenv - Environment variable management
- better-sqlite3 - SQLite database client

## How to Get a Bot Token

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token and add it to your `.env` file
5. Invite the bot to your server using the OAuth2 URL generator

## Notes

- Each user starts with 1000 coins
- Only one match can be active at a time