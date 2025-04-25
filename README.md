# Discord Betting Bot

A Discord bot for managing bets on team matches.

## Features

- User balance management
- Create matches between teams
- Place bets on teams
- View leaderboard of top users by balance
- Cancel matches and refund bets
- Finish matches and pay out winners

## Project Structure

```
.
├── data/                  # Data storage directory
│   ├── balances.json      # User balance data
│   └── match.json         # Current match data
├── src/                   # Source code
│   ├── DataManager.js     # Handles file operations and data persistence
│   ├── BalanceManager.js  # Manages user balances
│   ├── MatchManager.js    # Handles bet matches and bet operations
│   └── BetBot.js          # Main Discord bot class
├── index.js               # Entry point
├── .env                   # Environment variables (Discord token)
└── README.md              # This file
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
4. Start the bot:
   ```
   node index.js
   ```

## Commands

- `!balance` - Check your current balance
- `!init` - Initialize balances for all server members (admin only)
- `!match create Team1 Team2` - Create a match between two teams
- `!match cancel` - Cancel the current match and refund all bets
- `!match result TeamName` - Set the result of the match and pay out winners
- `!bet TeamName Amount` - Place a bet on a team
- `!leaderboard` - View the top 5 users by balance

## Dependencies

- discord.js
- dotenv

## How to Get a Bot Token

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token and add it to your `.env` file
5. Invite the bot to your server using the OAuth2 URL generator

## Notes

- Each user starts with 1000 coins
- Balances are stored in `balances.json`
- Only one match can be active at a time 