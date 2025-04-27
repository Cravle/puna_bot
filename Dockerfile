FROM ghcr.io/puppeteer/puppeteer:20-slim

# Set working directory
WORKDIR /app

# Install build dependencies for better-sqlite3
USER root
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
USER pptruser

# Install dependencies
COPY package*.json ./
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

# Expose port (optional - only needed if you have an HTTP server)
EXPOSE 3000

# Start dbus (required for Chrome), backup scheduler in background, and then your application
CMD service dbus start && (nohup /app/backup-scheduler.sh &) && node dist/index.js 