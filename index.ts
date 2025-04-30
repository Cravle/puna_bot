// Main entry point for the Discord Betting Bot
import { BetBot } from './src/BetBot.js';
import { Logger } from './src/utils/Logger.js';
// Add Aternos import
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

    // Create Chrome directories
    const renderCachePath = '/opt/render/.cache/puppeteer';

    try {
      if (!fs.existsSync(renderCachePath)) {
        fs.mkdirSync(renderCachePath, { recursive: true });
        execSync(`chmod -R 777 ${renderCachePath}`);
        Logger.info('Startup', `Created cache directory: ${renderCachePath}`);
      }
    } catch (e) {
      Logger.error('Startup', `Failed to create cache directory: ${e}`);
    }

    // Check if we already have chrome-path.txt and it points to a real file
    let chromePath = '';
    let chromeExists = false;

    try {
      if (fs.existsSync('./chrome-path.txt')) {
        chromePath = fs.readFileSync('./chrome-path.txt', 'utf8').trim();
        if (fs.existsSync(chromePath)) {
          Logger.info('Startup', `Found valid Chrome at: ${chromePath}`);
          chromeExists = true;
        } else {
          Logger.warn('Startup', `Chrome path in chrome-path.txt doesn't exist: ${chromePath}`);
        }
      }
    } catch (e) {
      Logger.error('Startup', `Error checking chrome-path.txt: ${e}`);
    }

    // If Chrome doesn't exist yet, install it
    if (!chromeExists) {
      Logger.info('Startup', 'Installing Chrome...');

      try {
        // Install Chrome using Puppeteer's browser installer
        execSync('npx puppeteer browsers install chrome-headless-shell', { stdio: 'inherit' });
        Logger.info('Startup', 'Chrome installed successfully!');

        // Find the installed Chrome
        try {
          const chromeInstallDir = '/opt/render/.cache/puppeteer/chrome-headless-shell';
          if (fs.existsSync(chromeInstallDir)) {
            // Recursively find chrome-headless-shell executable
            const findCmd = `find ${chromeInstallDir} -name "chrome-headless-shell" -type f | head -1`;
            const foundChromePath = execSync(findCmd, { encoding: 'utf8' }).trim();

            if (foundChromePath && fs.existsSync(foundChromePath)) {
              chromePath = foundChromePath;
              fs.writeFileSync('./chrome-path.txt', chromePath);
              Logger.info('Startup', `Chrome path saved: ${chromePath}`);
              chromeExists = true;
            }
          }
        } catch (findError) {
          Logger.error('Startup', `Failed to find Chrome after installation: ${findError}`);
        }
      } catch (installError) {
        Logger.error('Startup', `Failed to install Chrome: ${installError}`);
      }
    }

    if (chromeExists) {
      // Make sure Chrome is executable
      try {
        execSync(`chmod +x "${chromePath}"`);
        Logger.info('Startup', 'Chrome is ready to use!');
        return true;
      } catch (e) {
        Logger.error('Startup', `Failed to make Chrome executable: ${e}`);
      }
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
