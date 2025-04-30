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

    // Install Chrome using Puppeteer's browser installer
    try {
      Logger.info('Startup', 'Installing Chrome headless shell...');
      execSync('npm explore puppeteer -- npm run postinstall', { stdio: 'inherit' });
      execSync('npx puppeteer browsers install chrome-headless-shell', { stdio: 'inherit' });
      Logger.info('Startup', 'Chrome installed successfully!');

      // Find the Chrome path
      const chromeInstallDir = '/opt/render/.cache/puppeteer/chrome-headless-shell';
      if (fs.existsSync(chromeInstallDir)) {
        // Use find to locate the chrome-headless-shell binary
        const findCmd = `find ${chromeInstallDir} -name "chrome-headless-shell" -type f | head -1`;
        const chromePath = execSync(findCmd, { encoding: 'utf8' }).trim();

        if (chromePath && fs.existsSync(chromePath)) {
          // Make it executable
          execSync(`chmod +x "${chromePath}"`);

          // Save the path to environment variable
          process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;

          // Also save to file for persistence
          fs.writeFileSync('./chrome-path.txt', chromePath);
          Logger.info('Startup', `Chrome path saved: ${chromePath}`);
          return true;
        }
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
