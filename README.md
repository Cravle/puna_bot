# Discord Betting Bot

A simple Discord bot that allows users to bet on matches using virtual coins.

## Features

- Announce matches between two teams
- Place bets on announced matches
- Check your coin balance
- Persistent balance storage

## Setup

1. Install Node.js (v16 or higher)
2. Clone this repository
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file in the root directory and add your Discord bot token:
   ```
   DISCORD_TOKEN=your_bot_token_here
   ```
5. Start the bot:
   ```bash
   npm start
   ```

## Commands

- `!announce Team1 vs Team2` - Announce a new match
- `!bet [team] [amount]` - Place a bet on a team
- `!balance` - Check your current balance
- `!help` - Show all available commands

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