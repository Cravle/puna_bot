// Script to prepare Puppeteer environment on Render.com
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting Render.com setup for Puppeteer...');

// Check if running on Render
const isRender = process.env.RENDER === 'true' || 
                 process.env.IS_RENDER === 'true' || 
                 process.env.RENDER_EXTERNAL_URL || 
                 process.env.RENDER_SERVICE_ID;

if (!isRender) {
  console.log('Not running on Render.com, skipping special setup.');
  process.exit(0);
}

console.log('✓ Detected Render.com environment');

// Ensure the Puppeteer cache directory exists
const renderCachePath = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';
console.log(`Ensuring cache directory exists: ${renderCachePath}`);

try {
  fs.mkdirSync(renderCachePath, { recursive: true });
  console.log('✓ Cache directory created/confirmed');
} catch (error) {
  console.error('Error creating cache directory:', error);
}

// Install Chrome headless shell
console.log('Installing Chrome headless shell...');
try {
  execSync('npx puppeteer browsers install chrome-headless-shell', { stdio: 'inherit' });
  console.log('✓ Chrome headless shell installed');
} catch (error) {
  console.error('Error installing Chrome:', error);
}

// Check installation
console.log('Checking installed browsers...');
try {
  const browsers = execSync('npx puppeteer browsers list', { encoding: 'utf8' });
  console.log(browsers);
  
  // Look for the Chrome executable path
  if (browsers.includes('chrome-headless-shell')) {
    // Find the path
    try {
      const output = execSync('find /opt/render/.cache -name "chrome-headless-shell" -type f', { encoding: 'utf8' });
      const chromePaths = output.trim().split('\n').filter(Boolean);
      
      if (chromePaths.length > 0) {
        console.log('Found Chrome executable paths:');
        chromePaths.forEach(p => console.log(`- ${p}`));
        console.log(`\nConsider setting PUPPETEER_EXECUTABLE_PATH to one of these paths if needed`);
      }
    } catch (e) {
      console.log('Could not find Chrome executable path:', e);
    }
  }
} catch (error) {
  console.error('Error checking browsers:', error);
}

console.log('✅ Render.com setup complete!'); 