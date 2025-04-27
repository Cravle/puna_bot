#!/bin/bash

# Install Chrome using Puppeteer
echo "Installing Chrome headless shell..."
npx puppeteer browsers install chrome-headless-shell

# Find the Chrome path
CHROME_PATH=$(find /opt/render/.cache/puppeteer -name "chrome-headless-shell" -type f | head -1)

if [ -n "$CHROME_PATH" ]; then
  echo "Found Chrome at: $CHROME_PATH"
  
  # Try to make it executable
  chmod +x "$CHROME_PATH" || echo "Could not make Chrome executable, but this might be OK"
  
  # Save the path to a file
  echo "$CHROME_PATH" > chrome-path.txt
  echo "Chrome path saved to chrome-path.txt"
  
  # Export as environment variable
  export PUPPETEER_EXECUTABLE_PATH="$CHROME_PATH"
  echo "Set PUPPETEER_EXECUTABLE_PATH environment variable"
  exit 0
else
  echo "Could not find Chrome after installation"
  exit 1
fi 