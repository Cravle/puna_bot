// Script to auto-fix Chrome installation issues on Render
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Chrome Auto-Fix Script');

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

// Check if PUPPETEER_EXECUTABLE_PATH is set to placeholder
if (process.env.PUPPETEER_EXECUTABLE_PATH === '/the/path/from/logs') {
  console.log('⚠️ Found placeholder path in environment variable. Clearing it.');
  delete process.env.PUPPETEER_EXECUTABLE_PATH;
}

// Ensure the Puppeteer cache directory exists with proper permissions
const renderCachePath = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';
console.log(`Ensuring cache directory exists: ${renderCachePath}`);

// Create directory with all parent directories if needed
execSync(`mkdir -p ${renderCachePath}`, { stdio: 'inherit' });
execSync(`chmod -R 777 ${renderCachePath}`, { stdio: 'inherit' });
console.log('✓ Cache directory created/confirmed with proper permissions');

// Install Chrome directly
console.log('📥 Installing Chrome directly...');

// Create Chrome directory
const chromeDir = `${renderCachePath}/chrome`;
execSync(`mkdir -p ${chromeDir}`, { stdio: 'inherit' });

try {
  // Download and extract Chrome browser directly
  console.log('Downloading Chrome...');
  execSync('apt-get update && apt-get install -y wget dpkg', { stdio: 'inherit' });
  execSync('wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/chrome.deb', { stdio: 'inherit' });
  
  console.log('Extracting Chrome...');
  execSync('dpkg -x /tmp/chrome.deb /tmp/chrome', { stdio: 'inherit' });
  execSync('cp -r /tmp/chrome/opt/google/chrome/* ' + chromeDir, { stdio: 'inherit' });
  
  // Set executable
  execSync(`chmod +x ${chromeDir}/chrome`, { stdio: 'inherit' });
  
  console.log(`✅ Chrome installed at: ${chromeDir}/chrome`);
  console.log(`\n=== IMPORTANT ===`);
  console.log(`Set your environment variable to:`);
  console.log(`PUPPETEER_EXECUTABLE_PATH=${chromeDir}/chrome`);
  console.log(`===============\n`);
} catch (error) {
  console.error('❌ Error installing Chrome:', error);
  
  // Fallback to Puppeteer's built-in installer
  try {
    console.log('Falling back to puppeteer browsers install...');
    execSync('npx puppeteer browsers install chrome-headless-shell', { stdio: 'inherit' });
    
    // Find the installed browser
    console.log('Finding installed Chrome...');
    const findCmd = `find ${renderCachePath} -name "chrome-headless-shell" -type f | head -1`;
    const foundPath = execSync(findCmd, { encoding: 'utf8' }).trim();
    
    if (foundPath) {
      console.log(`✅ Found Chrome at: ${foundPath}`);
      console.log(`\n=== IMPORTANT ===`);
      console.log(`Set your environment variable to:`);
      console.log(`PUPPETEER_EXECUTABLE_PATH=${foundPath}`);
      console.log(`===============\n`);
    } else {
      console.log('❌ Could not find Chrome executable after installation');
    }
  } catch (fallbackError) {
    console.error('❌ Fallback installation also failed:', fallbackError);
  }
}

// Check installed browsers
console.log('\nInstalled browsers:');
try {
  const browsers = execSync('npx puppeteer browsers list', { encoding: 'utf8' });
  console.log(browsers);
} catch (e) {
  console.log('Could not list browsers:', e);
}

console.log('\nChrome paths found:');
try {
  const findCmd = 'find /opt/render -name "chrome" -o -name "chrome-headless-shell" -type f | grep -v "node_modules" | head -5';
  const foundPaths = execSync(findCmd, { encoding: 'utf8' }).trim();
  
  if (foundPaths) {
    console.log(foundPaths);
    console.log('\nUse one of these paths for your PUPPETEER_EXECUTABLE_PATH environment variable');
  } else {
    console.log('No Chrome executables found');
  }
} catch (e) {
  console.log('Error searching for Chrome:', e);
}

console.log('\n✅ Chrome fix script complete'); 