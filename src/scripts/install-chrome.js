// This script is used to install Chrome for Puppeteer in production environments
import { execSync } from 'child_process';

console.log('Installing Chrome for Puppeteer...');

try {
  // Install Chrome headless shell using Puppeteer's built-in functionality
  execSync('npx puppeteer browsers install chrome-headless-shell', { stdio: 'inherit' });
  console.log('✅ Chrome headless shell installed successfully!');
} catch (error) {
  console.error('❌ Failed to install Chrome headless shell:', error);
  process.exit(1);
}

// Get Puppeteer's installed Chrome info
try {
  const browserInfo = execSync('npx puppeteer browsers list', { encoding: 'utf8' });
  console.log('Installed browsers:');
  console.log(browserInfo);
} catch (error) {
  console.error('Could not list installed browsers:', error);
}

console.log('Installation complete!'); 