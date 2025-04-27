FROM ghcr.io/puppeteer/puppeteer:20.9.0

# Set working directory
WORKDIR /app

# Install build dependencies for better-sqlite3 and additional dependencies for Chrome
USER root
RUN rm -f /etc/apt/sources.list.d/google-chrome.list /etc/apt/sources.list.d/google.list && \
    apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify Chrome installation - Puppeteer image already includes Chrome, no need to install Chromium
# Using existing Chrome instead of installing a new browser

# Keep using root user for all file operations
# Copy package files
COPY package*.json ./

# Install dependencies as root
RUN npm install

# Install Puppeteer browser explicitly
RUN npx puppeteer browsers install chrome

# Create necessary directories first
RUN mkdir -p /app/logs /app/data/backups /app/scripts /app/config

# Copy source code
COPY src/ /app/src/

# Copy other project files (without database) - only files that actually exist
COPY tsconfig.json /app/
COPY index.ts /app/
COPY tsconfig.node.json /app/
COPY .eslintrc.json /app/
COPY .eslintignore /app/
COPY .prettierrc /app/
COPY README.md /app/
COPY cleanup.js /app/
COPY cleanup.json /app/
COPY resequence.js /app/

# Build TypeScript project
RUN npm run build:render

# IMPORTANT: Remove any database that might have been created in dist/data
RUN rm -f /app/dist/data/betting.db

# Create symlink to ensure application uses the mounted database
RUN mkdir -p /app/dist/data && ln -sf /app/data/betting.db /app/dist/data/betting.db

# Create backup scheduler script
RUN echo '#!/bin/bash\nwhile true; do\n  echo "Running scheduled backup: $(date)"\n  node /app/dist/src/scripts/backup-db.js >> /app/logs/backup.log 2>&1\n  echo "Next backup in 24 hours. Sleeping."\n  sleep 86400\ndone' > /app/backup-scheduler.sh
RUN chmod +x /app/backup-scheduler.sh

# Verify Chrome location
RUN which google-chrome || echo "Default Chrome not found in PATH"
RUN ls -la /usr/bin/google-chrome || echo "Chrome binary not found at expected location"

# Create a simple test script to verify Puppeteer works
RUN echo '#!/bin/bash\nnode -e "const puppeteer = require(\"puppeteer\"); (async () => { console.log(\"Testing Puppeteer...\"); try { const browser = await puppeteer.launch({headless: true, args: [\"--no-sandbox\", \"--disable-setuid-sandbox\"]}); const page = await browser.newPage(); console.log(\"Browser launched successfully!\"); await page.goto(\"https://example.com\"); console.log(\"Page loaded successfully!\"); const title = await page.title(); console.log(\"Page title:\", title); await browser.close(); console.log(\"Test completed successfully!\"); } catch (error) { console.error(\"Test failed:\", error); process.exit(1); } })()"' > /app/test-puppeteer.sh
RUN chmod +x /app/test-puppeteer.sh

# Create entrypoint script with precise Chrome configuration
RUN echo '#!/bin/bash\n\n# Print database location info\necho "Database directory contents:"\nls -la /app/data\necho "Dist/data directory contents:"\nls -la /app/dist/data\n\n# Test Puppeteer\necho "Testing Puppeteer installation..."\n/app/test-puppeteer.sh\nif [ $? -ne 0 ]; then\n  echo "Puppeteer test failed!"\nelse\n  echo "Puppeteer test passed!"\nfi\n\n# Start backup scheduler in background\nnohup /app/backup-scheduler.sh &\n\n# Set environment variables for Puppeteer\nexport PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false\nexport PUPPETEER_EXECUTABLE_PATH=$(which google-chrome)\nexport DEBUG="puppeteer:*"\n\n# Log Chrome location\necho "Using Chrome at: $PUPPETEER_EXECUTABLE_PATH"\n\n# Start main application with Puppeteer in no-sandbox mode and verbose logging\nNODE_OPTIONS="--no-warnings --unhandled-rejections=strict" exec node dist/index.js 2>&1 | tee /app/logs/app.log' > /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Fix ownership of all files
RUN chown -R pptruser:pptruser /app

# Switch to pptruser for running the application
USER pptruser

# Environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu"
ENV DEBUG="puppeteer:*"
ENV NODE_OPTIONS="--no-warnings --unhandled-rejections=strict"

# Important: Define volume for persistent database storage
# This should be mounted from host when running: docker run -v $(pwd)/data:/app/data
VOLUME ["/app/data"]

# Expose port for Discord bot
EXPOSE 3000

# Use entrypoint script instead of direct command
ENTRYPOINT ["/app/entrypoint.sh"] 