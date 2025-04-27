// Script to install and configure Chrome for Puppeteer on Render.com
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Create simple logger
const Logger = {
  info: (tag, message) => console.log(`[INFO] [${tag}] ${message}`),
  error: (tag, message) => console.error(`[ERROR] [${tag}] ${message}`),
  warn: (tag, message) => console.warn(`[WARNING] [${tag}] ${message}`),
  success: (tag, message) => console.log(`[SUCCESS] [${tag}] ${message}`)
};

// Get project root directory path (CommonJS provides __dirname automatically)
const projectRoot = path.resolve(__dirname, '../../');

async function installChrome() {
  try {
    Logger.info('Chrome', 'Starting Chrome installation for Puppeteer...');
    
    // Create cache directory
    const cacheDir = '/opt/render/.cache/puppeteer';
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        Logger.info('Chrome', `Created cache directory: ${cacheDir}`);
      }
    } catch (e) {
      Logger.error('Chrome', `Could not create cache directory: ${e}`);
    }
    
    // Try using Puppeteer's chrome-headless-shell installer
    try {
      Logger.info('Chrome', 'Installing chrome-headless-shell via Puppeteer...');
      execSync('npx puppeteer browsers install chrome-headless-shell', { 
        stdio: 'inherit',
        cwd: projectRoot
      });
      Logger.success('Chrome', 'Successfully installed chrome-headless-shell');
    } catch (e) {
      Logger.error('Chrome', `Error installing chrome-headless-shell: ${e}`);
      return false;
    }
    
    // Find the installed Chrome path
    let chromePath = '';
    try {
      const chromeInstallDir = '/opt/render/.cache/puppeteer/chrome-headless-shell';
      if (fs.existsSync(chromeInstallDir)) {
        const findCmd = `find ${chromeInstallDir} -name "chrome-headless-shell" -type f | head -1`;
        chromePath = execSync(findCmd, { encoding: 'utf8' }).trim();
        
        if (chromePath && fs.existsSync(chromePath)) {
          // Try to make it executable (might fail on read-only filesystem)
          try {
            execSync(`chmod +x "${chromePath}"`);
          } catch (e) {
            Logger.warn('Chrome', `Could not make Chrome executable, but this might be OK: ${e}`);
          }
          
          // Save path to file
          const chromePathFile = path.join(projectRoot, 'chrome-path.txt');
          fs.writeFileSync(chromePathFile, chromePath);
          Logger.success('Chrome', `Found Chrome at: ${chromePath}`);
          
          // Set environment variable
          process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
          return true;
        }
      }
      Logger.error('Chrome', 'Could not find chrome-headless-shell after installation');
    } catch (e) {
      Logger.error('Chrome', `Error finding chrome-headless-shell: ${e}`);
    }
    
    return false;
  } catch (error) {
    Logger.error('Chrome', `Uncaught error during Chrome installation: ${error}`);
    return false;
  }
}

// Run the installation
installChrome()
  .then(success => {
    if (success) {
      Logger.success('Chrome', 'Chrome installation completed successfully');
      process.exit(0);
    } else {
      Logger.error('Chrome', 'Chrome installation failed');
      process.exit(1);
    }
  })
  .catch(err => {
    Logger.error('Chrome', `Unexpected error in installation script: ${err}`);
    process.exit(1);
  }); 