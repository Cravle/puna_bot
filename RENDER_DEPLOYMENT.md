# Deploying to Render.com

This guide explains how to deploy the Discord Betting Bot to Render.com's free tier Web Service.

## Setup Instructions

1. Create a new Web Service in your Render dashboard
2. Connect your GitHub repository
3. Configure the following settings:

### Basic Configuration

- **Name**: `bet-bot` (or your preferred name)
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Plan**: `Free`

### Environment Variables

Add the following environment variables:

```
NODE_VERSION=20.x
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
RENDER=true
```

Plus your application's required variables:

```
DISCORD_TOKEN=your_discord_token
ATERNOS_USERNAME=your_aternos_username
ATERNOS_PASSWORD=your_aternos_password
ATERNOS_SERVER_ID=your_aternos_server_id
```

### Advanced Options

- **Memory**: Set to at least 512MB (required for Chrome to run properly)

## Troubleshooting

### Chrome Installation Issues

If you see Chrome installation errors:

1. SSH into your Render instance through the dashboard
2. Run the following commands:

   ```bash
   mkdir -p /opt/render/.cache/puppeteer
   npm run render-setup
   ```

3. If Chrome is still not found, you may need to manually set the environment variable to the correct location:
   ```
   PUPPETEER_EXECUTABLE_PATH=/opt/render/.cache/puppeteer/chrome-headless-shell/chrome-headless-shell-linux-<version>/chrome-headless-shell
   ```
   Replace `<version>` with the actual version from the filesystem.

### Memory Issues

If you're experiencing out-of-memory errors, try:

1. Increasing memory allocation (if possible on your plan)
2. Adding more aggressive Chrome startup flags in your `src/aternos/Aternos.ts` file

## Debugging

Enable Render logs to see detailed output for troubleshooting.
