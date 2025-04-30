FROM ghcr.io/puppeteer/puppeteer:20.9.0

# Set working directory
WORKDIR /app

# Install build dependencies for better-sqlite3
USER root
# Fix Chrome repository issues and install dependencies
RUN rm -f /etc/apt/sources.list.d/google-chrome.list /etc/apt/sources.list.d/google.list && \
    apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Keep using root user for all file operations
# Copy package files
COPY package*.json ./

# Install dependencies as root
RUN npm install

# Install Puppeteer browser explicitly
RUN npx puppeteer browsers install chrome

# Create necessary directories first
RUN mkdir -p /app/logs /app/data/backups

# Copy project files including the database
COPY . .

# Ensure the database directory exists
RUN mkdir -p /app/data

# Build TypeScript project
RUN npm run build:render

# Create backup scheduler script
RUN echo '#!/bin/bash\nwhile true; do\n  echo "Running scheduled backup: $(date)"\n  node /app/dist/src/scripts/backup-db.js >> /app/logs/backup.log 2>&1\n  echo "Next backup in 24 hours. Sleeping."\n  sleep 86400\ndone' > /app/backup-scheduler.sh
RUN chmod +x /app/backup-scheduler.sh

# Verify Chrome location
RUN ls -la /usr/bin/google-chrome-stable || echo "Chrome not found at expected location"
RUN which google-chrome || echo "Chrome not found in PATH"
RUN ls -la /opt/render/.cache/puppeteer || echo "Puppeteer cache directory not found"

# Create entrypoint script with precise Chrome configuration
RUN echo '#!/bin/bash\n\n# Start backup scheduler in background\nnohup /app/backup-scheduler.sh &\n\n# Set environment variables for Puppeteer\nexport PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false\nexport PUPPETEER_EXECUTABLE_PATH=$(which google-chrome)\n\n# Log Chrome location\necho "Using Chrome at: $PUPPETEER_EXECUTABLE_PATH"\n\n# Start main application with Puppeteer in no-sandbox mode\nNODE_OPTIONS=--no-warnings exec node dist/index.js' > /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Fix ownership of all files
RUN chown -R pptruser:pptruser /app

# Switch to pptruser for running the application
USER pptruser

# Environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"

# Expose port (optional - only needed if you have an HTTP server)
EXPOSE 3000

# Define volume for persistent database storage
VOLUME ["/app/data"]

# Use entrypoint script instead of direct command
ENTRYPOINT ["/app/entrypoint.sh"] 