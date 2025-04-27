import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import puppeteer, { PuppeteerNode, LaunchOptions } from 'puppeteer';
import { Browser, Page, CDPSession } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieRepository from '../database/repositories/CookieRepository.js'; // Import the new repository

// Create a stealth puppeteer instance by wrapping the base puppeteer
const puppeteerExtra = addExtra(puppeteer as unknown as PuppeteerNode);
puppeteerExtra.use(StealthPlugin());

// Define an interface for the cookie structure (shared or imported)
// Ensure this matches the one in CookieRepository.ts if not imported
interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

const TIMEOUT = 1000 * 60 * 1; // 1 minute
const INTERVAL = 10_000; // 10 seconds

// Remove file-based cookie constants and functions
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const cookiesPath = path.join(__dirname, 'cookies.json');
// function loadCookies(): Cookie[] { ... }

// Add a type for server status
export interface AternosStatus {
  status: 'online' | 'offline' | 'starting' | 'loading' | 'error' | 'unknown';
  timeLeft?: string | null; // Time string like '5:06' if online
}

export class Aternos {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdpSession: CDPSession | null = null; // For screencast
  private screencastFrames: Buffer[] = []; // Store frame data
  private intervalFunc: NodeJS.Timeout | null = null;
  private counter = 0;
  // Remove the local cookies array, we load/save directly via repository
  // private cookies: Cookie[] = [];

  async init(): Promise<void> {
    try {
      // Check for running on Render.com or similar platform
      const isRenderPlatform =
        process.env.RENDER === 'true' ||
        process.env.IS_RENDER === 'true' ||
        process.env.RENDER_EXTERNAL_URL ||
        process.env.RENDER_SERVICE_ID;

      // Launch options with appropriate arguments for different environments
      const launchOptions: LaunchOptions = {
        headless: 'shell' as 'shell',
        args: [
          '--incognito',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
        ],
      };

      // Set specific cache and browser paths for Render
      if (isRenderPlatform) {
        console.log('Detected Render.com platform, using Render-specific configuration...');

        // First check if we have a chrome-path.txt file (created by fix-chrome.js)
        try {
          const fs = await import('fs');
          const pathModule = await import('path');
          const chromePath = pathModule.resolve('./chrome-path.txt');

          if (fs.existsSync(chromePath)) {
            const executablePath = fs.readFileSync(chromePath, 'utf8').trim();
            if (executablePath && fs.existsSync(executablePath)) {
              console.log(`Using Chrome executable from chrome-path.txt: ${executablePath}`);
              launchOptions.executablePath = executablePath;
            } else {
              console.log(`Chrome path found in chrome-path.txt (${executablePath}) is invalid.`);
            }
          } else {
            console.log('No chrome-path.txt file found, checking environment variable.');
          }
        } catch (e) {
          console.log('Error reading chrome-path.txt:', e);
        }

        // If no valid path from file, check environment variable
        if (!launchOptions.executablePath && process.env.PUPPETEER_EXECUTABLE_PATH) {
          // Check if it's just our placeholder value from the docs
          if (process.env.PUPPETEER_EXECUTABLE_PATH === '/the/path/from/logs') {
            console.log(
              'Detected placeholder path from documentation. Ignoring and using automatic discovery instead.'
            );
          } else {
            console.log(
              `Using Chrome executable from PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH}`
            );

            // Verify the path exists before trying to use it
            try {
              const fs = await import('fs');
              if (fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
                launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
              } else {
                console.log(
                  `WARNING: The specified Chrome path doesn't exist: ${process.env.PUPPETEER_EXECUTABLE_PATH}`
                );
                console.log('Will fall back to automatic discovery');
              }
            } catch (e) {
              console.log('Error checking Chrome executable path:', e);
            }
          }
        }

        // If no valid executable path was set, search for Chrome
        if (!launchOptions.executablePath) {
          // Search for Chrome/Chromium in common locations
          try {
            const { execSync } = await import('child_process');
            console.log('Searching for Chrome/Chromium executable...');

            // Try multiple potential locations
            const potentialPaths = [
              // Standard Puppeteer cache locations
              '/opt/render/.cache/puppeteer/chrome-headless-shell/chrome-headless-shell-linux-*/chrome-headless-shell',
              // System installed Chrome/Chromium
              '/usr/bin/chromium-browser',
              '/usr/bin/chromium',
              '/usr/bin/google-chrome',
              // Manual install locations
              '/opt/render/.cache/puppeteer/chrome/chrome',
            ];

            for (const pattern of potentialPaths) {
              try {
                // Use find with wildcard patterns
                const findCmd = `find ${
                  pattern.includes('*')
                    ? pattern.substring(0, pattern.lastIndexOf('/'))
                    : path.dirname(pattern)
                } -name "${path.basename(pattern)}" 2>/dev/null | head -1`;

                console.log(`Searching with: ${findCmd}`);
                const foundPath = execSync(findCmd, { encoding: 'utf8' }).trim();

                if (foundPath) {
                  console.log(`Found Chrome executable at: ${foundPath}`);
                  launchOptions.executablePath = foundPath;
                  break;
                }
              } catch (e) {
                // Continue to next pattern
              }
            }

            if (!launchOptions.executablePath) {
              console.log('No Chrome executable found in standard locations');
              console.log('Will attempt to launch without specifying executable path');
            }
          } catch (e) {
            console.log('Error searching for Chrome:', e);
          }
        }

        // On Render, set specific cache location
        const renderCachePath = '/opt/render/.cache/puppeteer';
        console.log(`Using Puppeteer cache path: ${renderCachePath}`);

        // Try to list what's in the cache directory
        try {
          const { execSync } = await import('child_process');
          console.log('Checking cache directory contents:');
          const lsOutput = execSync(
            `ls -la ${renderCachePath} 2>/dev/null || echo "Directory not found or empty"`,
            { encoding: 'utf8' }
          );
          console.log(lsOutput);
        } catch (e) {
          console.log('Could not list cache directory:', e);
        }
      }

      console.log('Launching browser with options:', JSON.stringify(launchOptions));
      this.browser = await puppeteerExtra.launch(launchOptions);

      const context = this.browser.defaultBrowserContext();
      this.page = await context.newPage();

      // Load cookies from DB using the repository
      const dbCookies = cookieRepository.getCookies();
      if (dbCookies) {
        await this.setCookies(dbCookies); // Pass loaded cookies to setCookies
      } else {
        console.log('No cookies found in DB to set.');
      }

      await this.page.setJavaScriptEnabled(true);
      await this.page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9',
      });

      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      await this.page.goto('https://aternos.org/servers/', { waitUntil: 'networkidle2' });
    } catch (error) {
      console.error('Browser initialization failed:', error);

      // Provide helpful error messages based on error type
      if (error instanceof Error) {
        if (
          error.message.includes('Could not find Chrome') ||
          error.message.includes('Failed to launch browser') ||
          error.message.includes('Browser was not found')
        ) {
          console.error('\n=== CHROME BROWSER NOT FOUND ===');
          console.error('To fix this error, try:');
          console.error('1. Make sure the prebuild script ran successfully');
          console.error(
            `2. Check your PUPPETEER_EXECUTABLE_PATH environment variable: ${
              process.env.PUPPETEER_EXECUTABLE_PATH || '(not set)'
            }`
          );
          console.error('3. Check if Chrome is installed and the path is correct');
          console.error('==========================================\n');
        }
      }

      throw error;
    }
  }

  async login(username: string, password: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      // Check if already on the server page by looking for a specific element
      await this.page.waitForSelector('.servers-container', { timeout: 5000 });
      console.log('Already logged in or on servers page.');
      return; // Already logged in or past login page
    } catch (e) {
      // Not on server page, likely needs login
      console.log('Login page detected, attempting login...');
      try {
        // Increased timeout and wait for the element to be visible
        await this.page.waitForSelector('.username', { visible: true, timeout: 60000 }); // Increased to 60 seconds
        await this.page.type('.username', username);

        await this.page.waitForSelector('.password', { visible: true, timeout: 60000 }); // Increased to 60 seconds
        await this.page.type('.password', password);

        await this.page.keyboard.press('Enter');
        await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log('Login successful, saving cookies.');
        await this.saveCookies(); // Save cookies after successful login
      } catch (loginError) {
        console.error('Error during login attempt:', loginError);
        // Take screenshot on error
        const screenshotPath = path.join(__dirname, 'login_error_screenshot.png');
        if (this.page) {
          try {
            await this.page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Screenshot saved to ${screenshotPath}`);
          } catch (screenshotError) {
            console.error('Failed to take screenshot:', screenshotError);
          }
        }
        throw loginError; // Re-throw the login error after attempting screenshot
      }
    }
  }

  async goToServerPage(serverId: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    try {
      const serverSelector = `[data-id="${serverId}"]`;
      const serverElement = await this.page.waitForSelector(serverSelector, {
        visible: true,
        timeout: 15000,
      });
      console.log('Found server element, clicking...');
      if (serverElement) {
        await serverElement.click();
        await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log('Navigated to server page.');
      } else {
        throw new Error(`Server element with selector ${serverSelector} not found`);
      }
    } catch (error) {
      console.error('Error navigating to server page:', error);
      throw error; // Re-throw error after logging
    }
  }

  /**
   * Starts capturing screencast frames.
   * @param {string} outputDir - Directory to save frame PNGs.
   * @param {number} everyNthFrame - Capture every Nth frame (e.g., 1 for all, 5 for less frequent).
   */
  async startRecording(outputDir = './screencast_frames', everyNthFrame = 5): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    if (this.cdpSession) {
      console.warn('Recording already in progress.');
      return;
    }
    console.log(`Starting screencast recording, saving frames to ${outputDir}`);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      this.cdpSession = await this.page.target().createCDPSession();
      await this.cdpSession.send('Page.enable');

      this.screencastFrames = []; // Clear any previous frames

      this.cdpSession.on('Page.screencastFrame', async event => {
        // event.data is base64 encoded image data
        this.screencastFrames.push(Buffer.from(event.data, 'base64'));
        // We need to acknowledge the frame to receive the next one
        try {
          await this.cdpSession?.send('Page.screencastFrameAck', { sessionId: event.sessionId });
        } catch (e) {
          // Can ignore errors here if session closes before ack
          // console.warn('Error sending screencastFrameAck:', e);
        }
      });

      // Start the screencast
      await this.cdpSession.send('Page.startScreencast', {
        format: 'png', // jpeg is also an option
        quality: 85, // 0-100 for jpeg
        everyNthFrame: everyNthFrame, // Capture every Nth frame
      });
      console.log('Screencast started.');
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.cdpSession = null; // Reset session on error
    }
  }

  /**
   * Stops capturing screencast frames and saves them to the specified directory.
   * @param {string} outputDir - Directory where frames were intended to be saved.
   */
  async stopRecording(outputDir = './screencast_frames'): Promise<void> {
    if (!this.cdpSession) {
      console.warn('Recording not active.');
      return;
    }
    console.log('Stopping screencast recording...');

    try {
      await this.cdpSession.send('Page.stopScreencast');
      this.cdpSession.removeAllListeners('Page.screencastFrame'); // Clean up listener
      await this.cdpSession.detach();
      console.log('Screencast stopped.');

      // Save captured frames
      if (this.screencastFrames.length > 0) {
        console.log(`Saving ${this.screencastFrames.length} frames to ${outputDir}...`);
        this.screencastFrames.forEach((frameData, index) => {
          const framePath = path.join(outputDir, `frame_${String(index + 1).padStart(4, '0')}.png`);
          try {
            fs.writeFileSync(framePath, frameData);
          } catch (writeError) {
            console.error(`Failed to write frame ${index + 1}:`, writeError);
          }
        });
        console.log('Frames saved.');
      } else {
        console.log('No frames captured to save.');
      }
    } catch (error) {
      console.error('Error stopping recording or saving frames:', error);
    } finally {
      this.cdpSession = null;
      this.screencastFrames = []; // Clear frames regardless of saving success
    }
  }

  /**
   * Checks the current status of the server page without taking actions.
   * Assumes the page is already navigated to the correct server page.
   * @returns {Promise<AternosStatus>}
   */
  async checkServerStatus(): Promise<AternosStatus> {
    if (!this.page) throw new Error('Page not initialized');
    console.log('Checking current server status...');
    try {
      // Check for countdown timer (indicates online)
      const countdownElement = await this.page.$('.end-countdown');
      if (countdownElement) {
        const timerTextElement = await countdownElement.$('.server-end-countdown');
        const timeLeft = timerTextElement
          ? await timerTextElement.evaluate(el => el.textContent)
          : null;
        console.log(`Status check: Online, Time left: ${timeLeft?.trim()}`);
        return { status: 'online', timeLeft: timeLeft?.trim() };
      }

      // Check for other specific status elements (adjust selectors as needed)
      const startingIndicator = await this.page.$('.statuslabel-label.starting');
      if (startingIndicator) {
        console.log('Status check: Starting');
        return { status: 'starting' };
      }

      const loadingIndicator = await this.page.$('.statuslabel-label.loading');
      if (loadingIndicator) {
        console.log('Status check: Loading');
        return { status: 'loading' };
      }

      const offlineIndicator = await this.page.$('.statuslabel-label.offline');
      if (offlineIndicator) {
        // Check if the #start button exists, implies offline and ready to start
        const startButton = await this.page.$('#start');
        if (startButton) {
          console.log('Status check: Offline (ready to start)');
          return { status: 'offline' };
        }
        console.log('Status check: Offline (cannot start)');
        return { status: 'offline' }; // Or a different status if needed
      }

      // If none of the specific statuses are found
      console.log('Status check: Unknown');
      return { status: 'unknown' };
    } catch (error) {
      console.error('Error during server status check:', error);
      return { status: 'error' };
    }
  }

  // Modify startServer to return status on completion
  async startServer(): Promise<AternosStatus> {
    if (!this.page) throw new Error('Page not initialized');
    console.log('Attempting to start server...');
    let finalStatus: AternosStatus = { status: 'unknown' };

    try {
      // First, check if it's already running
      const initialStatus = await this.checkServerStatus();
      if (
        initialStatus.status === 'online' ||
        initialStatus.status === 'starting' ||
        initialStatus.status === 'loading'
      ) {
        console.log(`Server is already ${initialStatus.status}. No action needed.`);
        return initialStatus;
      }

      // Ensure we are on the server page where the start button might be
      // Optional: add navigation logic here if checkServerStatus doesn't guarantee page context

      // Wait for the start button to be potentially available
      await this.page.waitForSelector('#start', { visible: true, timeout: 15000 }); // Increased timeout slightly
      const startButton = await this.page.$('#start');

      if (startButton) {
        console.log('Start button found, clicking...');
        await startButton.click();
        console.log('Clicked start button. Waiting for server confirmation...');
        finalStatus = await this.waitForServerToStart(); // Wait for confirmation
      } else {
        console.log('Start button not immediately found on this page.');
        throw new Error('Start button not found on the current page.');
      }
    } catch (error) {
      console.error('Error clicking start button or during server start process:', error);
      finalStatus = { status: 'error' };
      throw error; // Re-throw after setting status
    }
    return finalStatus;
  }

  // Modify intervalCheckServerStatus to return status object
  private async intervalCheckServerStatus(): Promise<AternosStatus> {
    // Return type changed
    if (!this.page) throw new Error('Page not initialized');

    this.counter++;
    console.log(`Checking server status (Attempt ${this.counter})...`);

    try {
      const currentStatus = await this.checkServerStatus(); // Reuse the check logic

      if (currentStatus.status === 'online') {
        return currentStatus; // Return the status object with time
      }
      // We could add checks for other statuses like 'starting' if needed here
      // else if (currentStatus.status === 'starting') { ... }
    } catch (error) {
      console.warn('Error checking server status element:', error);
    }

    if (this.counter > 60) {
      console.log('Server did not reach running/countdown state within the expected time.');
      return { status: 'error' }; // Indicate timeout as error
    }

    // Return unknown status to continue polling
    return { status: 'unknown' };
  }

  // Modify waitForServerToStart to return status object
  private async waitForServerToStart(): Promise<AternosStatus> {
    // Return type changed
    console.log('Waiting for server to confirm online status...');
    this.counter = 0;

    return new Promise((resolve, reject) => {
      const cleanupAndResolve = (status: AternosStatus) => {
        if (this.intervalFunc) clearInterval(this.intervalFunc);
        this.intervalFunc = null;
        resolve(status);
      };
      const cleanupAndReject = (err: Error) => {
        if (this.intervalFunc) clearInterval(this.intervalFunc);
        this.intervalFunc = null;
        reject(err);
      };

      this.intervalFunc = setInterval(async () => {
        try {
          const currentStatus = await this.intervalCheckServerStatus();
          // Resolve if online, or if an error status (like timeout) is returned by the check
          if (currentStatus.status === 'online' || currentStatus.status === 'error') {
            console.log(`waitForServerToStart resolving with status: ${currentStatus.status}`);
            cleanupAndResolve(currentStatus);
          }
        } catch (error) {
          console.error('Error during server status check interval:', error);
          cleanupAndReject(error instanceof Error ? error : new Error(String(error)));
        }
      }, INTERVAL);

      // Safety timeout for the whole waiting process
      const overallTimeout = setTimeout(() => {
        if (this.intervalFunc) {
          // Check if interval is still running
          console.error('Overall timeout reached while waiting for server to start.');
          cleanupAndReject(new Error('Overall timeout reached while waiting for server to start.'));
        }
      }, TIMEOUT * 10); // e.g., 10 minutes total wait time
    });
  }

  async saveCookies(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    try {
      const currentCookies = await this.page.cookies();
      // Use the repository to save cookies
      cookieRepository.saveCookies(currentCookies as Cookie[]); // Cast if necessary
      // console.log('Cookies saved successfully.'); // Repository logs this now
    } catch (error) {
      console.error('Error saving cookies via repository:', error);
    }
  }

  // Modify setCookies to accept cookies as parameter
  async setCookies(cookiesToSet: Cookie[]): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    if (cookiesToSet.length > 0) {
      try {
        // Set the cookies passed from the init method (loaded from DB)
        await this.page.setCookie(...cookiesToSet);
        console.log(`Set ${cookiesToSet.length} cookies from DB.`);
      } catch (error) {
        console.error('Error setting cookies:', error);
      }
    } else {
      // This case is handled in init now
      // console.log('No cookies provided to set.');
    }
  }

  async close(): Promise<void> {
    // Ensure recording is stopped before closing the browser
    if (this.cdpSession) {
      await this.stopRecording();
    }
    if (this.intervalFunc) {
      clearInterval(this.intervalFunc);
    }
    if (this.browser) {
      await this.browser.close();
      console.log('Browser closed.');
    }
  }
}
