import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import puppeteer, { PuppeteerNode } from 'puppeteer';
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
    this.browser = await puppeteerExtra.launch({ headless: 'shell', args: ['--incognito'] });

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

  async startServer(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    console.log('Attempting to start server...');

    try {
      // Wait for the start button to be potentially available
      await this.page.waitForSelector('#start', { visible: true, timeout: 10000 });
      const startButton = await this.page.$('#start');

      if (startButton) {
        console.log('Start button found, clicking...');
        await startButton.click();
        console.log('Clicked start button. Waiting for server confirmation...');
        await this.waitForServerToStart(); // Wait for confirmation like 'Online' status
      } else {
        console.log('Start button not immediately found on this page.');
        // Optionally add logic here if the button isn't on the expected page
        // e.g., navigate back or throw error
        throw new Error('Start button not found on the current page.');
      }
    } catch (error) {
      console.error('Error clicking start button or during server start process:', error);
      // Consider if navigating back is appropriate here
      // await this.goToServerPage(YOUR_SERVER_ID); // Replace YOUR_SERVER_ID
      throw error; // Re-throw
    }
  }

  private async intervalCheckServerStatus(): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');

    this.counter++;
    console.log(`Checking server status (Attempt ${this.counter})...`);

    try {
      // Specifically look for the countdown timer element which appears when the server is running
      const countdownElement = await this.page.$('.end-countdown');

      if (countdownElement) {
        // Server is running, find the timer text within the countdown element
        const timerTextElement = await countdownElement.$('.server-end-countdown');
        if (timerTextElement) {
          const timeLeft = await timerTextElement.evaluate(el => el.textContent);
          console.log(`Server is running. Time left: ${timeLeft?.trim()}`);
        } else {
          // Should not happen if .end-countdown exists, but good to log
          console.log('Server is running (countdown element found, but timer text missing).');
        }
        return true; // Server started (or already running)
      }

      // Optional: Check for other statuses like loading, offline etc. if needed
      // const loadingIndicator = await this.page.$('.statuslabel-label.loading');
      // if (loadingIndicator) console.log('Server is still loading...');
    } catch (error) {
      console.warn('Error checking server status element:', error);
      // Don't stop the interval on temporary check errors, unless it's fatal
    }

    if (this.counter > 60) {
      // Increased attempts (e.g., 60 * 10s = 10 minutes)
      console.log('Server did not reach running/countdown state within the expected time.');
      return true; // Stop waiting, treat as finished (failed)
    }

    return false; // Server not running yet, continue polling
  }

  private async waitForServerToStart(): Promise<void> {
    console.log('Waiting for server to confirm online status...');
    this.counter = 0;

    return new Promise((resolve, reject) => {
      this.intervalFunc = setInterval(async () => {
        try {
          const isStarted = await this.intervalCheckServerStatus();
          if (isStarted) {
            if (this.intervalFunc) clearInterval(this.intervalFunc);
            this.intervalFunc = null; // Clear interval ID
            if (this.counter > 60) {
              // Check if it stopped due to timeout
              reject(new Error('Server start timed out.'));
            } else {
              console.log('Server status confirmed as online/starting.');
              resolve();
            }
          }
        } catch (error) {
          if (this.intervalFunc) clearInterval(this.intervalFunc);
          this.intervalFunc = null;
          console.error('Error during server status check interval:', error);
          reject(error);
        }
      }, INTERVAL);

      // Safety timeout for the whole waiting process
      const overallTimeout = setTimeout(() => {
        if (this.intervalFunc) {
          clearInterval(this.intervalFunc);
          this.intervalFunc = null;
          console.error('Overall timeout reached while waiting for server to start.');
          reject(new Error('Overall timeout reached while waiting for server to start.'));
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
