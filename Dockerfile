FROM ghcr.io/puppeteer/puppeteer:latest

# Set working directory
WORKDIR /app

# Install cron and dependencies
RUN apt-get update && apt-get install -y cron && apt-get clean

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

# Build TypeScript project
RUN npm run build:render

# Setup cron job for daily backups
RUN echo "0 0 * * * cd /app && node dist/src/scripts/backup-db.js >> /app/logs/backup.log 2>&1" > /etc/cron.d/backup-cron
RUN chmod 0644 /etc/cron.d/backup-cron
RUN crontab /etc/cron.d/backup-cron

# Create log directory
RUN mkdir -p /app/logs

# Expose port (optional - only needed if you have an HTTP server)
EXPOSE 3000

# Start cron service, dbus (required for Chrome) and then your application
CMD service cron start && service dbus start && node dist/index.js 