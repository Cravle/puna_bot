// Simple helper to load Chrome path from chrome-path.txt
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export function loadChromePath(): string | null {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.resolve(__dirname, '..');
    const chromePathFile = path.join(projectRoot, 'chrome-path.txt');

    if (fs.existsSync(chromePathFile)) {
      const chromePath = fs.readFileSync(chromePathFile, 'utf8').trim();

      if (chromePath && fs.existsSync(chromePath)) {
        console.log(`Found Chrome at: ${chromePath}`);
        // Set environment variable
        process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
        return chromePath;
      }
    }

    return null;
  } catch (error) {
    console.error('Error loading Chrome path:', error);
    return null;
  }
}
