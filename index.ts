// Main entry point for the Discord Betting Bot
import { BetBot } from './src/BetBot.js';
import http from 'http';

// Initialize and start the bot
const bot = new BetBot();
bot.start();

// Create a simple HTTP server for Render.com deployment
const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord Bot is running!');
});

server.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
