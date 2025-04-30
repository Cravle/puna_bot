// Main entry point for the Discord Betting Bot
import { BetBot } from './src/BetBot.js';
import { Logger } from './src/utils/Logger.js';
import { Aternos } from './src/aternos/Aternos.js';
import dotenv from 'dotenv';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { loadChromePath } from './src/loadChromePath.js';

dotenv.config();

// Simplified Chrome path loader - uses chrome-path.txt created by setup-chrome.sh
function ensureChromeInstalled() {
  try {
    Logger.info('Startup', 'Checking if Chrome is installed...');
    const chromePath = loadChromePath();

    if (chromePath) {
      Logger.info('Startup', `Found Chrome path: ${chromePath}`);
      return true;
    } else {
      Logger.warn('Startup', 'No Chrome path found, Aternos commands may not work');
      return false;
    }
  } catch (error) {
    Logger.error('Startup', `Error loading Chrome path: ${error}`);
    return false;
  }
}

// Validate Aternos config on startup
const aternosUsername = process.env.ATERNOS_USERNAME;
const aternosPassword = process.env.ATERNOS_PASSWORD;
const aternosServerId = process.env.ATERNOS_SERVER_ID;

if (!aternosUsername || !aternosPassword || !aternosServerId) {
  Logger.warn(
    'Aternos',
    'Missing ATERNOS_USERNAME, ATERNOS_PASSWORD, or ATERNOS_SERVER_ID environment variables. Aternos commands will not work.'
  );
  // Don't exit, just disable the command functionally
}

// Initialize and start the bot
(async () => {
  try {
    // Check if Chrome path exists from chrome-path.txt
    const chromeInstalled = ensureChromeInstalled();

    // Start the bot regardless of Chrome status
    const bot = new BetBot();
    bot.start();

    if (!chromeInstalled) {
      Logger.warn(
        'Startup',
        'Chrome installation not found. Aternos commands will not work properly.'
      );
    }
  } catch (error) {
    Logger.error('Startup', `Error during bot startup: ${error}`);
  }
})();
