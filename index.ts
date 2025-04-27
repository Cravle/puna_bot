// Main entry point for the Discord Betting Bot
import { BetBot } from './src/BetBot.js';
import { Logger } from './src/utils/Logger.js';
import { Aternos } from './src/aternos/Aternos.js';
import dotenv from 'dotenv';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

dotenv.config();

// Function to ensure Chrome is installed at startup
async function ensureChromeInstalled() {
  try {
    Logger.info('Startup', 'Checking if Chrome is installed...');

    // Check if we have chrome-path.txt
    if (fs.existsSync('./chrome-path.txt')) {
      const chromePath = fs.readFileSync('./chrome-path.txt', 'utf8').trim();
      if (fs.existsSync(chromePath)) {
        Logger.info('Startup', `Found existing Chrome at: ${chromePath}`);
        process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
        return true;
      } else {
        Logger.warn('Startup', `Chrome path in chrome-path.txt doesn't exist: ${chromePath}`);
      }
    }

    // Try to install Chrome using our script
    try {
      Logger.info('Startup', 'Running Chrome installation script...');

      // Run the fix-chrome.js script
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      const scriptPath = path.join(__dirname, 'src', 'scripts', 'fix-chrome.js');

      if (fs.existsSync(scriptPath)) {
        Logger.info('Startup', `Running Chrome installation script: ${scriptPath}`);
        execSync(`node ${scriptPath}`, { stdio: 'inherit' });

        // Check if installation was successful
        if (fs.existsSync('./chrome-path.txt')) {
          const chromePath = fs.readFileSync('./chrome-path.txt', 'utf8').trim();
          if (fs.existsSync(chromePath)) {
            Logger.info('Startup', `Chrome installed successfully at: ${chromePath}`);
            process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
            return true;
          }
        }
      } else {
        Logger.error('Startup', `Chrome installation script not found at: ${scriptPath}`);
      }
    } catch (installError) {
      Logger.error('Startup', `Failed to install Chrome: ${installError}`);
    }

    Logger.warn(
      'Startup',
      'Chrome could not be installed or found. Aternos commands may not work.'
    );
    return false;
  } catch (error) {
    Logger.error('Startup', `Error ensuring Chrome is installed: ${error}`);
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
    // First ensure Chrome is installed
    await ensureChromeInstalled();

    // Then start the bot
    const bot = new BetBot();
    bot.start();
  } catch (error) {
    Logger.error('Startup', `Error during bot startup: ${error}`);
  }
})();
