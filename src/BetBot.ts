import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

import { BalanceManager } from './BalanceManager.js';
import { MatchManager } from './MatchManager.js';
import { Match, DiscordMessage, Bet, OperationResult } from './types/index.js';
import { Logger } from './utils/Logger.js';

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
      Logger.success('Bot', `Logged in as ${this.client.user?.tag}`);
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

    // Log the command
    Logger.command(userId, username, msg.content);

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
      case 'matches':
        this.handleMatchesHistoryCommand(msg);
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
    msg.reply(`💰 **Your Balance**: ${balance} PunaCoins`);
  }

  /**
   * Handle !init command (admin only)
   * @param {DiscordMessage} msg - Discord.js message object
   */
  private async handleInitCommand(msg: any): Promise<void> {
    if (!msg.member.permissions.has('Administrator')) {
      return msg.reply('🚫 **Access Denied**: Only administrators can use this command.');
    }

    try {
      const members = await msg.guild.members.fetch();
      const added = this.balanceManager.initializeAllMembers(members);
      msg.channel.send(`✅ **Success**: Balance initialized for ${added} members.`);
    } catch (err) {
      console.error(err);
      msg.reply('❌ **Error**: Failed to fetch members.');
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
          msg.reply('⚠️ **Usage**: `!match create Team1 Team2`');
          return;
        }
        
        const currentMatch = this.matchManager.getCurrentMatch();
        if (currentMatch && currentMatch.status === 'pending') {
          msg.reply('⚠️ **Error**: A match is already active!');
          return;
        }
        
        const match = this.matchManager.createMatch(team1, team2);
        msg.channel.send(`🎮 **Match #${match.id} Created**\n${team1} 🆚 ${team2}`);
        break;
        
      case 'cancel':
        const cancelResult = this.matchManager.cancelMatch();
        msg.channel.send(`🚫 ${cancelResult.message}`);
        break;
        
      case 'result':
        const winner = args[1];
        const resultResponse = this.matchManager.finishMatch(winner);
        
        if (resultResponse.success) {
          // Get the match data after it has been updated
          const matchData = this.matchManager.getCurrentMatch();
          if (matchData && matchData.winner === winner) {
            const bets = this.matchManager.getMatchBets(matchData.id);
            const totalBets = bets.length;
            const totalAmount = bets.reduce((sum: number, bet: Bet) => sum + bet.amount, 0);
            Logger.matchResult(matchData.id, matchData.team1, matchData.team2, winner, totalBets, totalAmount);
          }
        } else {
          Logger.warn('Match', `Failed to set match result: ${resultResponse.message}`);
        }
        
        msg.channel.send(`🏆 ${resultResponse.message}`);
        break;
        
      case 'list':
        const history = this.matchManager.getMatchHistory(5);
        if (history.length === 0) {
          msg.channel.send('📜 **Match History**: No matches found.');
          return;
        }
        
        const historyMsg = history.map(m => {
          const status = m.status === 'pending' ? '🟢 Active' : (m.status === 'done' ? `🏆 Winner: ${m.winner}` : '❌ Canceled');
          return `#${m.id} **${m.team1}** 🆚 **${m.team2}** - ${status}`;
        }).join('\n');
        
        msg.channel.send(`📜 **Match History:**\n${historyMsg}`);
        break;
        
      case 'info':
        const matchId = parseInt(args[1]);
        if (isNaN(matchId)) {
          msg.reply('⚠️ **Usage**: `!match info <match_id>`');
          return;
        }
        
        const matchInfo = this.matchManager.getMatchBets(matchId);
        if (matchInfo.length === 0) {
          msg.reply('❌ **Error**: No bets found for this match or invalid match ID.');
          return;
        }
        
        const matchData = matchInfo[0] as any;
        const team1Bets = matchInfo.filter(b => b.team === matchData.team1);
        const team2Bets = matchInfo.filter(b => b.team === matchData.team2);
        
        const infoMsg = `📊 **Match #${matchId} Bets:**\n` +
          `**${matchData.team1}**: ${team1Bets.length} bets, ${team1Bets.reduce((sum, b) => sum + b.amount, 0)} PunaCoins\n` +
          `**${matchData.team2}**: ${team2Bets.length} bets, ${team2Bets.reduce((sum, b) => sum + b.amount, 0)} PunaCoins`;
          
        msg.channel.send(infoMsg);
        break;
        
      default:
        // If no subcommand or invalid, show the current match
        const activeMatch = this.matchManager.getCurrentMatch();
        if (!activeMatch || activeMatch.status !== 'pending') {
          msg.channel.send('❌ **No Active Match**: Create one with `!match create Team1 Team2`');
          return;
        }
        
        const team1Count = activeMatch.bets?.filter(b => b.team === activeMatch.team1).length || 0;
        const team2Count = activeMatch.bets?.filter(b => b.team === activeMatch.team2).length || 0;
        
        msg.channel.send(`🎮 **Active Match #${activeMatch.id}:**\n` +
          `**${activeMatch.team1}** (${team1Count} bets) 🆚 **${activeMatch.team2}** (${team2Count} bets)\n` +
          `💰 Place your bet with: \`!bet ${activeMatch.team1} <amount>\` or \`!bet ${activeMatch.team2} <amount>\``);
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
    
    if (betResult.success) {
      const match = this.matchManager.getCurrentMatch();
      if (match) {
        Logger.bet(userId, username, match.id, team, amount);
      }
    } else {
      Logger.warn('Bet', `Failed bet from ${username} (${userId}): ${betResult.message}`);
    }
    
    msg.reply(`🎲 ${betResult.message}`);
  }

  /**
   * Handle !leaderboard command
   * @param {DiscordMessage} msg - Discord.js message object
   */
  private handleLeaderboardCommand(msg: any): void {
    const leaderboardData = this.balanceManager.getLeaderboard();
    
    if (leaderboardData.length === 0) {
      msg.channel.send('📊 **Leaderboard**: No users found yet.');
      return;
    }
    
    const leaderboard = leaderboardData
      .map((user, i) => {
        let medal = '';
        if (i === 0) medal = '🥇 ';
        else if (i === 1) medal = '🥈 ';
        else if (i === 2) medal = '🥉 ';
        else medal = `${i + 1}. `;
        
        return `${medal}<@${user.id}> — ${user.balance} PunaCoins`;
      })
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
          msg.reply('📜 **Bet History**: You have not placed any bets yet.');
          return;
        }
        
        const betsHistory = userBets.map((bet: any) => {
          let resultIcon = '⏳ Pending';
          
          if (bet.result === 'win') {
            resultIcon = '💰 Won';
          } else if (bet.result === 'loss') {
            resultIcon = '❌ Lost';
          } else if (bet.result === 'refund') {
            resultIcon = '↩️ Refunded';
          } else if (bet.status === 'done') {
            // Fallback for old bets without result field
            resultIcon = bet.winner === bet.team ? '💰 Won' : '❌ Lost';
          } else if (bet.status === 'canceled') {
            resultIcon = '🚫 Canceled';
          }
              
          return `**${bet.team1}** 🆚 **${bet.team2}** - Bet: ${bet.amount} PunaCoins on **${bet.team}** - ${resultIcon}`;
        }).slice(0, 5).join('\n');
        
        msg.reply(`📜 **Your Recent Bets:**\n${betsHistory}`);
        break;
        
      case 'transactions':
        const transactions = this.balanceManager.getTransactionHistory(userId);
        
        if (transactions.length === 0) {
          msg.reply('📜 **Transaction History**: No transactions found.');
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
          
          return `${typeMap[tx.type] || tx.type}${matchInfo}: **${sign}${Math.abs(tx.amount)} PunaCoins**`;
        }).join('\n');
        
        msg.reply(`📜 **Your Recent Transactions:**\n${txHistory}`);
        break;
    }
  }
  
  /**
   * Handle !matches command to show detailed match history
   * @param {DiscordMessage} msg - Discord.js message object
   */
  private handleMatchesHistoryCommand(msg: any): void {
    const args = msg.content.split(/\s+/).slice(1);
    const showAllBets = args[0] === 'all' || !args[0];
    const limit = showAllBets ? 999 : parseInt(args[0]) || 3;
    
    const matches = this.matchManager.getMatchHistory(5);
    
    if (matches.length === 0) {
      msg.channel.send('📜 **Match History**: No matches found.');
      return;
    }
    
    const matchPromises = matches.map(async (match) => {
      const bets = this.matchManager.getMatchBets(match.id);
      
      const team1Bets = bets.filter(b => b.team === match.team1);
      const team2Bets = bets.filter(b => b.team === match.team2);
      
      const team1Total = team1Bets.reduce((sum: number, b: Bet) => sum + b.amount, 0);
      const team2Total = team2Bets.reduce((sum: number, b: Bet) => sum + b.amount, 0);
      
      let statusEmoji, statusText;
      if (match.status === 'pending') {
        statusEmoji = '🟢';
        statusText = 'Active';
      } else if (match.status === 'done') {
        statusEmoji = '🏆';
        statusText = `Winner: **${match.winner}**`;
      } else {
        statusEmoji = '❌';
        statusText = 'Canceled';
      }
      
      // Sort bets by amount (highest first)
      const sortedTeam1Bets = [...team1Bets].sort((a, b) => b.amount - a.amount);
      const sortedTeam2Bets = [...team2Bets].sort((a, b) => b.amount - a.amount);
      
      // Display all bets or limit to top X
      const team1BettorsToShow = sortedTeam1Bets.slice(0, limit);
      const team2BettorsToShow = sortedTeam2Bets.slice(0, limit);
      
      // Generate the bettors text
      const team1BettorsText = team1BettorsToShow.length > 0 
        ? team1BettorsToShow.map(b => `<@${b.user_id}>: ${b.amount} PunaCoins`).join('\n  ')
        : 'None';
        
      const team2BettorsText = team2BettorsToShow.length > 0 
        ? team2BettorsToShow.map(b => `<@${b.user_id}>: ${b.amount} PunaCoins`).join('\n  ')
        : 'None';
      
      // Show total counts if there are more bets than shown
      const team1ExtraCount = Math.max(0, team1Bets.length - team1BettorsToShow.length);
      const team2ExtraCount = Math.max(0, team2Bets.length - team2BettorsToShow.length);
      
      const team1Extra = team1ExtraCount > 0 ? `\n  _...and ${team1ExtraCount} more ${team1ExtraCount === 1 ? 'bettor' : 'bettors'}_` : '';
      const team2Extra = team2ExtraCount > 0 ? `\n  _...and ${team2ExtraCount} more ${team2ExtraCount === 1 ? 'bettor' : 'bettors'}_` : '';
      
      const bettingRatio = (team1Total + team2Total > 0) 
        ? `${(team1Total / (team1Total + team2Total) * 100).toFixed(1)}% : ${(team2Total / (team1Total + team2Total) * 100).toFixed(1)}%`
        : 'No bets';
        
      return `
📊 **Match #${match.id}** - ${statusEmoji} ${statusText}
**${match.team1}** 🆚 **${match.team2}**

💰 **Betting Overview:**
**${match.team1}**: ${team1Bets.length} bets, ${team1Total} PunaCoins
**${match.team2}**: ${team2Bets.length} bets, ${team2Total} PunaCoins
Ratio: ${bettingRatio}

🥇 **Bettors for ${match.team1}:**
  ${team1BettorsText}${team1Extra}
  
🥇 **Bettors for ${match.team2}:**
  ${team2BettorsText}${team2Extra}
`;
    });
    
    Promise.all(matchPromises).then(matchHistoryDetails => {
      const fullHistory = matchHistoryDetails.join('\n───────────────────────\n');
      
      let title = '📜 **Recent Match History';
      if (!showAllBets && !isNaN(limit)) {
        title += ` (Top ${limit} bets per team)**:`;
      } else {
        title += ' (All bets)**:';
      }
      
      msg.channel.send(`${title}\n${fullHistory}`);
    });
  }
  
  /**
   * Handle !help command
   * @param {DiscordMessage} msg - Discord.js message object
   */
  private handleHelpCommand(msg: any): void {
    const helpText = `
🤖 **Betting Bot Commands:**

💰 **Balance & Leaderboard**
\`!balance\` - Check your current balance
\`!leaderboard\` - Show the top users by balance

🎮 **Match Management**
\`!match\` - Show the current active match
\`!match create <team1> <team2>\` - Create a new match
\`!match cancel\` - Cancel the current match and refund bets
\`!match result <winner>\` - Set the winner of the current match
\`!match list\` - Show recent matches
\`!match info <id>\` - Show details of a specific match

🎲 **Betting**
\`!bet <team> <amount>\` - Place a bet on a team

📜 **History**
\`!history bets\` - Show your betting history
\`!history transactions\` - Show your transaction history
\`!matches\` - Show detailed history of recent matches with all bets
\`!matches <number>\` - Show matches with top X bets per team

❓ **Help**
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
      Logger.error('Bot', 'DISCORD_TOKEN not found in environment variables');
      throw new Error('DISCORD_TOKEN not found in environment variables');
    }
    
    Logger.info('Bot', 'Connecting to Discord...');
    this.client.login(token);
  }
} 