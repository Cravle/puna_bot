#!/bin/bash

# Ensure script fails on error
set -e

echo "===== CHROME INSTALLATION FOR PUPPETEER ====="

# Create cache directory if it doesn't exist
CACHE_DIR="/opt/render/.cache/puppeteer"
mkdir -p "$CACHE_DIR" || echo "Warning: Could not create cache directory (it might already exist)"
chmod -R 777 "$CACHE_DIR" 2>/dev/null || echo "Warning: Could not change permissions on cache directory"

echo "Cache directory: $CACHE_DIR"

# Try multiple installation methods
echo "Method 1: Installing Chrome using puppeteer browsers command..."
npx puppeteer browsers install chrome-headless-shell || echo "Warning: First installation method failed, trying alternatives"

# Fallback method
if [ $? -ne 0 ]; then
  echo "Method 2: Installing Chrome using npm directly..."
  npm explore puppeteer -- npm run postinstall || echo "Warning: Second installation method failed"
fi

# Another fallback method
if [ ! -d "$CACHE_DIR/chrome-headless-shell" ]; then
  echo "Method 3: Installing Chrome using direct npm install..."
  npm install puppeteer --no-save || echo "Warning: Third installation method failed"
fi

# Wait a moment for files to settle
sleep 2

# Find the Chrome path
echo "Searching for Chrome binary..."
SEARCH_PATHS=(
  "$CACHE_DIR/chrome-headless-shell"
  "/opt/render/.cache/puppeteer"
  "/opt/render/.cache"
)

for SEARCH_PATH in "${SEARCH_PATHS[@]}"; do
  echo "Searching in $SEARCH_PATH..."
  
  if [ -d "$SEARCH_PATH" ]; then
    CHROME_PATH=$(find "$SEARCH_PATH" -name "chrome-headless-shell" -type f | head -1)
    
    if [ -n "$CHROME_PATH" ]; then
      echo "Found Chrome at: $CHROME_PATH"
      break
    fi
  fi
done

# Fallback to global search if still not found
if [ -z "$CHROME_PATH" ]; then
  echo "Performing system-wide search for Chrome..."
  CHROME_PATH=$(find /opt/render -name "chrome-headless-shell" -o -name "chrome" -type f 2>/dev/null | grep -v "node_modules" | head -1)
fi

# List all installed browsers
echo "Listing installed browsers:"
npx puppeteer browsers list || echo "Could not list browsers"

# Check if chrome path was found and make it executable
if [ -n "$CHROME_PATH" ]; then
  echo "Found Chrome at: $CHROME_PATH"
  
  # Try to make it executable
  chmod +x "$CHROME_PATH" 2>/dev/null || echo "Warning: Could not make Chrome executable (this might be OK)"
  
  # Test if Chrome is runnable
  "$CHROME_PATH" --version 2>/dev/null && echo "Chrome is executable and working" || echo "Warning: Chrome is not executable (but might still work with Puppeteer)"
  
  # Save the path to a file
  echo "$CHROME_PATH" > chrome-path.txt
  echo "Chrome path saved to chrome-path.txt"
  
  # Export as environment variable
  export PUPPETEER_EXECUTABLE_PATH="$CHROME_PATH"
  echo "Set PUPPETEER_EXECUTABLE_PATH environment variable"
  exit 0
else
  echo "ERROR: Could not find Chrome executable after installation"
  echo "Available files in cache directory:"
  find "$CACHE_DIR" -type f | sort || echo "Could not list cache directory"
  exit 1
fi 