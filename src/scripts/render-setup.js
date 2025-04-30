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

// Ensure the Puppeteer cache directory exists with proper permissions
const renderCachePath = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';
console.log(`Ensuring cache directory exists: ${renderCachePath}`);

try {
  // Create directory with all parent directories if needed
  execSync(`mkdir -p ${renderCachePath}`, { stdio: 'inherit' });
  // Set permissions to ensure we can write to it
  execSync(`chmod -R 777 ${renderCachePath}`, { stdio: 'inherit' });
  console.log('✓ Cache directory created/confirmed with proper permissions');
  
  // Show directory structure
  console.log('Cache directory structure:');
  execSync(`ls -la ${path.dirname(renderCachePath)}`, { stdio: 'inherit' });
} catch (error) {
  console.error('Error setting up cache directory:', error);
}

// Try multiple approaches for Chrome installation
console.log('Installing Chrome headless shell (Attempt 1)...');
try {
  // Method 1: Using puppeteer's built-in installer
  execSync('npx puppeteer browsers install chrome-headless-shell', { 
    stdio: 'inherit',
    env: { 
      ...process.env,
      PUPPETEER_CACHE_DIR: renderCachePath 
    }
  });
  console.log('✓ Chrome headless shell installed via puppeteer browsers install');
} catch (error) {
  console.error('Error with first installation method:', error);
  
  // Method 2: Try apt-get to install chromium
  console.log('Installing Chromium via apt-get (Attempt 2)...');
  try {
    execSync('apt-get update && apt-get install -y chromium-browser', { stdio: 'inherit' });
    console.log('✓ Chromium installed via apt-get');
    
    // Update environment variable to use system Chromium
    process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
    console.log(`Set PUPPETEER_EXECUTABLE_PATH=${process.env.PUPPETEER_EXECUTABLE_PATH}`);
  } catch (aptError) {
    console.error('Error installing via apt-get:', aptError);
    
    // Method 3: Direct download of Chrome browser
    console.log('Attempting direct Chrome download (Attempt 3)...');
    try {
      const chromeDir = `${renderCachePath}/chrome`;
      execSync(`mkdir -p ${chromeDir}`, { stdio: 'inherit' });
      
      // Download and extract Chrome
      execSync('wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/chrome.deb', { stdio: 'inherit' });
      execSync('dpkg -x /tmp/chrome.deb /tmp/chrome', { stdio: 'inherit' });
      execSync('cp -r /tmp/chrome/opt/google/chrome/* ' + chromeDir, { stdio: 'inherit' });
      
      // Set executable
      execSync(`chmod +x ${chromeDir}/chrome`, { stdio: 'inherit' });
      
      // Set environment variable
      process.env.PUPPETEER_EXECUTABLE_PATH = `${chromeDir}/chrome`;
      console.log(`Set PUPPETEER_EXECUTABLE_PATH=${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    } catch (downloadError) {
      console.error('Error with direct Chrome download:', downloadError);
    }
  }
}

// Check installation
console.log('Checking installed browsers...');
try {
  // List puppeteer browsers
  try {
    const browsers = execSync('npx puppeteer browsers list', { encoding: 'utf8' });
    console.log("Puppeteer browsers list:");
    console.log(browsers);
  } catch (e) {
    console.log('Could not list puppeteer browsers:', e);
  }
  
  // Check if Chrome is installed anywhere in the system
  try {
    console.log('Searching for Chrome executables on system:');
    const findChromeResults = execSync('find / -name "chrome" -o -name "chrome-headless-shell" -o -name "chromium-browser" 2>/dev/null', { encoding: 'utf8' });
    const chromeLocations = findChromeResults.trim().split('\n').filter(Boolean);
    
    if (chromeLocations.length > 0) {
      console.log('Found Chrome/Chromium executables:');
      chromeLocations.forEach(location => {
        console.log(`- ${location}`);
        // Try to output version
        try {
          const version = execSync(`${location} --version`, { encoding: 'utf8' });
          console.log(`  Version: ${version.trim()}`);
        } catch (e) {
          console.log(`  Could not get version: ${e.message}`);
        }
      });
      
      // Suggest the first found path as PUPPETEER_EXECUTABLE_PATH
      console.log(`\nSuggested environment variable: PUPPETEER_EXECUTABLE_PATH=${chromeLocations[0]}`);
    } else {
      console.log('No Chrome executables found on system');
    }
  } catch (e) {
    console.log('Error while searching for Chrome:', e);
  }
  
  // Check what's in the cache directory now
  console.log(`\nContents of puppeteer cache directory (${renderCachePath}):`);
  try {
    execSync(`find ${renderCachePath} -type f | sort`, { stdio: 'inherit' });
  } catch (e) {
    console.log('Could not list cache directory contents:', e);
  }
  
} catch (error) {
  console.error('Error during browser check:', error);
}

console.log('✅ Render.com setup complete!');
console.log('If Chrome is still not found, manually set PUPPETEER_EXECUTABLE_PATH to one of the paths listed above.'); 