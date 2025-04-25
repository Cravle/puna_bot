import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

import { BalanceManager } from './BalanceManager.js';
import { MatchManager } from './MatchManager.js';
import { Match, DiscordMessage } from './types/index.js';

/**
 * Main Discord bot class that handles commands and integrates managers
 */
export class BetBot {
  private client: Client;
  private balanceManager: BalanceManager;
  private matchManager: MatchManager;

  constructor() {
    this.client = new Client({ 
      intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
      ] 
    });
    
    // Initialize managers
    this.balanceManager = new BalanceManager();
    this.matchManager = new MatchManager(this.balanceManager);
    
    this.setupEventHandlers();
  }

  /**
   * Set up Discord.js event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      console.log(`Logged in as ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', this.handleMessage.bind(this));
  }

  /**
   * Handle incoming Discord messages
   * @param {DiscordMessage} msg - Discord.js message object
   */
  private async handleMessage(msg: any): Promise<void> {
    if (!msg.content.startsWith('!')) return;
    
    const [command, ...args] = msg.content.slice(1).split(/\s+/);
    const userId = msg.author.id;
    const username = msg.author.username;

    switch (command) {
      case 'balance':
        this.handleBalanceCommand(msg, userId);
        break;
      case 'init':
        this.handleInitCommand(msg);
        break;
      case 'match':
        this.handleMatchCommand(msg, args, userId, username);
        break;
      case 'bet':
        this.handleBetCommand(msg, args, userId, username);
        break;
      case 'leaderboard':
        this.handleLeaderboardCommand(msg);
        break;
      case 'history':
        this.handleHistoryCommand(msg, args, userId);
        break;
      case 'help':
        this.handleHelpCommand(msg);
        break;
    }
  }

  /**
   * Handle !balance command
   * @param {DiscordMessage} msg - Discord.js message object
   * @param {string} userId - Discord user ID
   */
  private handleBalanceCommand(msg: any, userId: string): void {
    const balance = this.balanceManager.getBalance(userId);
    msg.reply(`Your balance: $${balance} punaBacs`);
  }

  /**
   * Handle !init command (admin only)
   * @param {DiscordMessage} msg - Discord.js message object
   */
  private async handleInitCommand(msg: any): Promise<void> {
    if (!msg.member.permissions.has('Administrator')) {
      return msg.reply('Только администратор может использовать эту команду.');
    }

    try {
      const members = await msg.guild.members.fetch();
      const added = this.balanceManager.initializeAllMembers(members);
      msg.channel.send(`Баланс выдан ${added} участникам.`);
    } catch (err) {
      console.error(err);
      msg.reply('Ошибка при получении участников.');
    }
  }

  /**
   * Handle !match commands
   * @param {DiscordMessage} msg - Discord.js message object
   * @param {Array<string>} args - Command arguments
   * @param {string} userId - Discord user ID
   * @param {string} username - Discord username
   */
  private handleMatchCommand(msg: any, args: string[], userId: string, username: string): void {
    const subCommand = args[0];
    
    switch(subCommand) {
      case 'create':
        const [team1, team2] = [args[1], args[2]];
        if (!team1 || !team2) {
          msg.reply('Usage: !match create Team1 Team2');
          return;
        }
        
        const currentMatch = this.matchManager.getCurrentMatch();
        if (currentMatch && currentMatch.status === 'pending') {
          msg.reply('A match is already active!');
          return;
        }
        
        const match = this.matchManager.createMatch(team1, team2);
        msg.channel.send(`Match #${match.id} created: ${team1} vs ${team2}`);
        break;
        
      case 'cancel':
        const cancelResult = this.matchManager.cancelMatch();
        msg.channel.send(cancelResult.message);
        break;
        
      case 'result':
        const winner = args[1];
        const resultResponse = this.matchManager.finishMatch(winner);
        msg.channel.send(resultResponse.message);
        break;
        
      case 'list':
        const history = this.matchManager.getMatchHistory(5);
        if (history.length === 0) {
          msg.channel.send('No match history found.');
          return;
        }
        
        const historyMsg = history.map(m => {
          const status = m.status === 'pending' ? '🟢 Active' : (m.status === 'done' ? `✅ Winner: ${m.winner}` : '❌ Canceled');
          return `#${m.id} ${m.team1} vs ${m.team2} - ${status}`;
        }).join('\n');
        
        msg.channel.send(`**Match History:**\n${historyMsg}`);
        break;
        
      case 'info':
        const matchId = parseInt(args[1]);
        if (isNaN(matchId)) {
          msg.reply('Usage: !match info <match_id>');
          return;
        }
        
        const matchInfo = this.matchManager.getMatchBets(matchId);
        if (matchInfo.length === 0) {
          msg.reply('No bets found for this match or invalid match ID.');
          return;
        }
        
        const matchData = matchInfo[0] as any;
        const team1Bets = matchInfo.filter(b => b.team === matchData.team1);
        const team2Bets = matchInfo.filter(b => b.team === matchData.team2);
        
        const infoMsg = `**Match #${matchId} Bets:**\n` +
          `${team1Bets.length} bets on ${matchData.team1}: $${team1Bets.reduce((sum, b) => sum + b.amount, 0)}\n` +
          `${team2Bets.length} bets on ${matchData.team2}: $${team2Bets.reduce((sum, b) => sum + b.amount, 0)}`;
          
        msg.channel.send(infoMsg);
        break;
        
      default:
        // If no subcommand or invalid, show the current match
        const activeMatch = this.matchManager.getCurrentMatch();
        if (!activeMatch || activeMatch.status !== 'pending') {
          msg.channel.send('No active match. Create one with `!match create Team1 Team2`');
          return;
        }
        
        const team1Count = activeMatch.bets?.filter(b => b.team === activeMatch.team1).length || 0;
        const team2Count = activeMatch.bets?.filter(b => b.team === activeMatch.team2).length || 0;
        
        msg.channel.send(`**Active Match #${activeMatch.id}:**\n` +
          `${activeMatch.team1} (${team1Count} bets) vs ${activeMatch.team2} (${team2Count} bets)\n` +
          `Place your bet with: !bet ${activeMatch.team1} <amount> or !bet ${activeMatch.team2} <amount>`);
    }
  }

  /**
   * Handle !bet command
   * @param {DiscordMessage} msg - Discord.js message object
   * @param {Array<string>} args - Command arguments
   * @param {string} userId - Discord user ID
   * @param {string} username - Discord username
   */
  private handleBetCommand(msg: any, args: string[], userId: string, username: string): void {
    const [team, amountStr] = args;
    const amount = parseInt(amountStr);
    
    const betResult = this.matchManager.placeBet(userId, username, team, amount);
    msg.reply(betResult.message);
  }

  /**
   * Handle !leaderboard command
   * @param {DiscordMessage} msg - Discord.js message object
   */
  private handleLeaderboardCommand(msg: any): void {
    const leaderboardData = this.balanceManager.getLeaderboard();
    
    if (leaderboardData.length === 0) {
      msg.channel.send('No users found in the leaderboard yet.');
      return;
    }
    
    const leaderboard = leaderboardData
      .map((user, i) => `${i + 1}. <@${user.id}> — $${user.balance}`)
      .join('\n');
    
    msg.channel.send(`🏆 **Leaderboard:**\n${leaderboard}`);
  }
  
  /**
   * Handle !history command
   * @param {DiscordMessage} msg - Discord.js message object
   * @param {Array<string>} args - Command arguments
   * @param {string} userId - Discord user ID
   */
  private handleHistoryCommand(msg: any, args: string[], userId: string): void {
    const subCommand = args[0] || 'bets';
    
    switch(subCommand) {
      case 'bets':
        const userBets = this.matchManager.getUserBets(userId);
        
        if (userBets.length === 0) {
          msg.reply('You have not placed any bets yet.');
          return;
        }
        
        const betsHistory = userBets.map((bet: any) => {
          let resultIcon = '⏳ Pending';
          
          if (bet.result === 'win') {
            resultIcon = '✅ Won';
          } else if (bet.result === 'loss') {
            resultIcon = '❌ Lost';
          } else if (bet.result === 'refund') {
            resultIcon = '🔄 Refunded';
          } else if (bet.status === 'done') {
            // Fallback for old bets without result field
            resultIcon = bet.winner === bet.team ? '✅ Won' : '❌ Lost';
          } else if (bet.status === 'canceled') {
            resultIcon = '🚫 Canceled';
          }
              
          return `**${bet.team1}** vs **${bet.team2}** - Bet: $${bet.amount} on ${bet.team} - ${resultIcon}`;
        }).slice(0, 5).join('\n');
        
        msg.reply(`**Your recent bets:**\n${betsHistory}`);
        break;
        
      case 'transactions':
        const transactions = this.balanceManager.getTransactionHistory(userId);
        
        if (transactions.length === 0) {
          msg.reply('No transaction history found.');
          return;
        }
        
        const txHistory = transactions.map((tx: any) => {
          const typeMap: Record<string, string> = {
            'init': '🏦 Initial balance',
            'bet': '🎲 Bet placed',
            'payout': '💰 Payout received',
            'refund': '♻️ Bet refunded',
            'donate': '🎁 Gift'
          };
          
          const sign = tx.amount >= 0 ? '+' : '';
          const matchInfo = tx.match_info ? ` (${tx.match_info})` : '';
          
          return `${typeMap[tx.type] || tx.type}${matchInfo}: ${sign}$${Math.abs(tx.amount)}`;
        }).join('\n');
        
        msg.reply(`**Your recent transactions:**\n${txHistory}`);
        break;
    }
  }
  
  /**
   * Handle !help command
   * @param {DiscordMessage} msg - Discord.js message object
   */
  private handleHelpCommand(msg: any): void {
    const helpText = `
**Betting Bot Commands:**
\`!balance\` - Check your current balance
\`!bet <team> <amount>\` - Place a bet on a team
\`!match\` - Show the current active match
\`!match create <team1> <team2>\` - Create a new match
\`!match cancel\` - Cancel the current match and refund bets
\`!match result <winner>\` - Set the winner of the current match
\`!match list\` - Show recent matches
\`!match info <id>\` - Show details of a specific match
\`!leaderboard\` - Show the top users by balance
\`!history bets\` - Show your betting history
\`!history transactions\` - Show your transaction history
\`!help\` - Show this help message
`;
    
    msg.channel.send(helpText);
  }

  /**
   * Start the Discord bot
   */
  start(): void {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_TOKEN not found in environment variables');
    }
    this.client.login(token);
  }
} 