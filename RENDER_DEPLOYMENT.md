# Deploying to Render.com (Free Plan)

This guide explains how to deploy the Discord Betting Bot to Render.com's free tier Web Service without SSH access.

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

## Chrome Installation for Free Plan

Since the free plan doesn't offer SSH access, we've adapted the solution:

1. The `render-setup.js` script now runs automatically during the build process.
2. This script will:
   - Create necessary directories
   - Install Chrome using multiple methods
   - Print diagnostic information in the build logs

### Getting Chrome Path from Build Logs

After deployment, you need to check the build logs to find Chrome's executable path:

1. Go to your web service in the Render dashboard
2. Click the "Events" tab
3. Find the most recent "Build started" event and click "View Build Log"
4. Look for lines mentioning "Found Chrome executable" or "Found Chrome/Chromium executables"
5. Copy the full path (e.g., `/opt/render/.cache/puppeteer/chrome/chrome`)

### Setting PUPPETEER_EXECUTABLE_PATH

Once you have the path:

1. Go to the "Environment" tab in your Render dashboard
2. Add a new environment variable:
   ```
   PUPPETEER_EXECUTABLE_PATH=/the/path/from/logs
   ```
3. Click "Save Changes"
4. Deploy again by clicking "Manual Deploy" > "Deploy latest commit"

## Troubleshooting Without SSH

Without SSH access, troubleshooting relies heavily on the logs:

### Common Issues and Solutions

1. **"Could not find Chrome" error**:

   - Check the build logs for found Chrome paths
   - Add the correct PUPPETEER_EXECUTABLE_PATH environment variable
   - Deploy again

2. **Build fails during Chrome installation**:

   - The build might time out on the free plan when installing Chrome
   - Try deploying again - sometimes it works on a second attempt
   - If it consistently fails, you might need to upgrade to a paid plan

3. **Memory errors during runtime**:
   - Chrome is memory-intensive and may exceed the free plan's limits
   - Try running with fewer Chrome tabs/instances
   - Consider upgrading to a paid plan with more memory

## Debugging

Since you don't have SSH access, use the logs for debugging:

1. **Build Logs**: Found under "Events" > "View Build Log"
2. **Runtime Logs**: Found under the "Logs" tab
3. **Metrics**: Check CPU and memory usage under the "Metrics" tab

The runtime logs will show any errors occurring when the bot tries to use Chrome, which can help pinpoint issues with the browser installation or configuration.

## Deployment Checklist

- [ ] Code pushed to GitHub repository
- [ ] Render.com service connected to repository
- [ ] Environment variables set correctly
- [ ] Build and deployment successful
- [ ] Chrome installed and path configured if needed
- [ ] Bot connects to Discord successfully
- [ ] Aternos commands working properly
