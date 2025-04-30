// Main entry point for the Discord Betting Bot
import { BetBot } from './src/BetBot.js';
import http from 'http';
import userRepository from './src/database/repositories/UserRepository.js';

// Initialize and start the bot
const bot = new BetBot();
bot.start();

// Create a simple HTTP server for Render.com deployment
const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  // Serve the leaderboard for all routes
  // Get top 10 users
  const leaders = userRepository.getLeaderboard(10);

  // Create HTML for leaderboard
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Betting Bot Leaderboard</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        h1 {
          color: #333;
          text-align: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
        }
        th, td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #4CAF50;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f2f2f2;
        }
        tr:hover {
          background-color: #ddd;
        }
        .rank {
          font-weight: bold;
          text-align: center;
        }
        .balance {
          text-align: right;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h1>Betting Bot Leaderboard</h1>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>User</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          ${leaders
            .map(
              (user, index) => `
            <tr>
              <td class="rank">${index + 1}</td>
              <td>${user.name}</td>
              <td class="balance">${user.balance.toLocaleString()}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
      <p style="text-align: center; margin-top: 20px;">Last updated: ${new Date().toLocaleString()}</p>
    </body>
    </html>
  `;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
