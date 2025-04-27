// Main entry point for the Discord Betting Bot
import { BetBot } from './src/BetBot.js';
import { Logger } from './src/utils/Logger.js';
import { Aternos } from './src/aternos/Aternos.js';
import dotenv from 'dotenv';

dotenv.config();

// Validate Aternos config on startup
const aternosUsername = process.env.ATERNOS_USERNAME;
const aternosPassword = process.env.ATERNOS_PASSWORD;
const aternosServerId = process.env.ATERNOS_SERVER_ID;

if (!aternosUsername || !aternosPassword || !aternosServerId) {
  Logger.warn(
    'Aternos',
    'Missing ATERNOS_USERNAME, ATERNOS_PASSWORD, or ATERNOS_SERVER_ID environment variables. Aternos commands will not work.',
  );
}

// Initialize and start the bot
(async () => {
  try {
    Logger.info('Startup', 'Starting Discord Betting Bot...');

    // Start the bot
    const bot = new BetBot();
    bot.start();
  } catch (error) {
    Logger.error('Startup', `Error during bot startup: ${error}`);
  }
})();
