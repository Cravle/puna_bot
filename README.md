# Cow Village Bot

A Discord bot for managing betting matches, events, and virtual currency.

## Features

- 💰 Virtual currency system (PunaCoins)
- 🎯 Match betting (1v1 and team matches)
- 🎭 Event betting (Yes/No outcomes)
- 📊 Leaderboards and statistics
- 💾 Persistent data with SQLite

## Command Overview

### Balance & Economy

- `/balance` - Check your PunaCoin balance
- `/leaderboard` - See the richest users
- `/init <user> [balance]` - Initialize a user (Admin only)

### Match Management (Admin Only)

- `/match create <type> [options]` - Create a new match
- `/match start <match_id>` - Start a match immediately
- `/match cancel <match_id>` - Cancel a match and refund bets
- `/match result <match_id> [winner/team]` - Set the result of a match

### Event Management (Admin Only)

- `/event create <name> [participant]` - Create a Yes/No event
- `/event start <event_id>` - Start an event
- `/event cancel <event_id>` - Cancel an event and refund bets
- `/event result <event_id> <outcome>` - Set event outcome (Yes/No)

### Betting

- `/bet <id> <option> <amount>` - Place a bet
  - For matches: bet on username or team name
  - For events: bet "Yes" or "No"

### History & Statistics

- `/history` - View your personal betting history
- `/matches [filter]` - View match history or active matches
  - Filters: all, active, completed, 1v1, team

## Detailed Usage

### Match Types

1. **1v1 Matches**

   - Two users compete against each other
   - Required parameters: `participant1` and `participant2`
   - Example: `/match create 1v1 "Chess Tournament" @User1 @User2`

2. **Team Matches**
   - Two teams compete against each other
   - Required parameters: `team1` and `team2`
   - Example: `/match create team "Football Finals" "Team Red" "Team Blue"`

### Events

- Yes/No prediction events
- Optional: can be associated with a specific participant
- Example: `/event create "Will it rain tomorrow?" @WeatherForecast`

### Betting Process

1. Admin creates a match or event
2. Users place bets during the 5-minute betting window
3. Match or event starts automatically (or admin can start it immediately)
4. Admin sets the result when the match or event is complete
5. Winnings are automatically distributed (2x payout)

## Admin Commands

Certain commands require Administrator permissions:

- Creating, starting, canceling, and setting results for matches and events
- Initializing users with starting balances

## Installation

1. Clone the repository
2. Install dependencies with `npm install`
3. Configure environment variables in `.env`:
   ```
   DISCORD_TOKEN=your_token_here
   CLIENT_ID=your_client_id_here
   ```
4. Build the project with `npm run build`
5. Run the bot with `npm start`

## Development

- Written in TypeScript
- Uses Discord.js for bot functionality
- Uses SQLite for persistent storage

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

Made with 💖 by Cravle

## Project Structure

```
.
├── data/                    # Data storage directory
│   └── betting.db           # SQLite database file
├── src/                     # Source code
│   ├── database/            # Database related code
│   │   ├── Database.ts      # SQLite connection manager
│   │   └── repositories/    # Repository classes
│   │       ├── UserRepository.ts       # User data operations
│   │       ├── MatchRepository.ts      # Match data operations
│   │       ├── BetRepository.ts        # Bet data operations
│   │       └── TransactionRepository.ts # Transaction data operations
│   ├── migrations/          # Database migrations
│   │   └── migrateJsonToSqlite.ts # Migration from JSON to SQLite
│   ├── scripts/             # Utility scripts
│   │   ├── syncAllUsers.ts  # Sync all users from Discord
│   │   └── updateUserNames.ts # Update existing user names
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts         # Shared types across the project
│   ├── BalanceManager.ts    # Balance management logic
│   ├── MatchManager.ts      # Match and betting logic
│   └── BetBot.ts            # Main Discord bot class
├── dist/                    # Compiled JavaScript files (generated)
├── index.ts                 # Entry point
├── tsconfig.json            # TypeScript configuration
├── .env                     # Environment variables (Discord token, Client ID)
└── README.md                # This file
```

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with your Discord bot token and client ID:
   ```
   DISCORD_TOKEN=your_token_here
   CLIENT_ID=your_client_id_here
   ```
4. Build the TypeScript code:
   ```
   npm run build
   ```
5. If you have existing JSON data and want to migrate it to SQLite:
   ```
   npm run migrate
   ```
6. Synchronize user information with Discord (recommended):
   ```
   npm run sync-users
   ```
7. Start the bot:
   ```
   npm start
   ```

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start the bot using compiled JavaScript
- `npm run dev` - Start the bot in development mode with hot reloading
- `npm run migrate` - Migrate from JSON to SQLite database
- `npm run update-users` - Update names of existing users from Discord
- `npm run sync-users` - Sync all Discord users (add new ones and update existing)

## Commands

### User Commands

- `/balance` - Check your PunaCoin balance
- `/leaderboard` - Show current PunaCoin leaderboard
- `/bet` - Place a bet on a match or event
- `/history` - View your personal betting history
- `/matches` - Show detailed match history with filtering options

### Admin Commands

- `/init` - Initialize a user with starting balance
- `/match create` - Create a new match (supports 1v1, team, and event types)
- `/match start` - Start a match immediately
- `/match cancel` - Cancel a match and refund all bets
- `/match result` - Set the result of a match and pay out winners
- `/help` - Show help information

## Match Types

The bot supports three types of matches:

### 1v1 Matches

Matches between two Discord users. Users bet on which player will win.

### Team Matches

Matches between two teams (can be anything like game teams, sports teams, etc). Users bet on which team will win.

### Events

Single events with yes/no outcomes. Users bet on whether the event will be successful or not.

## Bot Permissions

When adding the bot to your server, ensure it has the following permissions:

- Read/Send Messages
- Use Slash Commands
- Read Message History
- Embed Links
- Mention Everyone (optional, for announcements)

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

## How to Get Bot Token and Client ID

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token and add it to your `.env` file as `DISCORD_TOKEN`
5. From the "General Information" section, copy the "Application ID" and add it to your `.env` file as `CLIENT_ID`
6. Invite the bot to your server using the OAuth2 URL generator with the `applications.commands` scope

## Notes

- Each user starts with 1000 coins
- Only one match can be active at a time
- Slash commands may take up to an hour to appear after the bot starts due to Discord's global command registration
