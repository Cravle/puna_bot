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
    sudo \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Keep using root user for all file operations
# Copy package files
COPY package*.json ./

# Install dependencies as root
RUN npm install

# Copy project files
COPY . .

# Build TypeScript project
RUN npm run build:render

# Create necessary directories
RUN mkdir -p /app/logs /app/data/backups

# Create backup scheduler script
RUN echo '#!/bin/bash\nwhile true; do\n  echo "Running scheduled backup: $(date)"\n  node /app/dist/src/scripts/backup-db.js >> /app/logs/backup.log 2>&1\n  echo "Next backup in 24 hours. Sleeping."\n  sleep 86400\ndone' > /app/backup-scheduler.sh
RUN chmod +x /app/backup-scheduler.sh

# Create entrypoint script
RUN echo '#!/bin/bash\n\n# Start dbus as root\nsudo service dbus start\n\n# Start backup scheduler in background\nnohup /app/backup-scheduler.sh &\n\n# Start main application\nexec node dist/index.js' > /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Configure sudo for pptruser
RUN echo "pptruser ALL=(ALL) NOPASSWD: /usr/sbin/service dbus start" > /etc/sudoers.d/pptruser

# Fix ownership of all files
RUN chown -R pptruser:pptruser /app

# Switch to pptruser for running the application
USER pptruser

# Expose port (optional - only needed if you have an HTTP server)
EXPOSE 3000

# Use entrypoint script instead of direct command
ENTRYPOINT ["/app/entrypoint.sh"] 