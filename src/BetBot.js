const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const DataManager = require('./DataManager');
const BalanceManager = require('./BalanceManager');
const MatchManager = require('./MatchManager');

/**
 * Main Discord bot class that handles commands and integrates managers
 */
class BetBot {
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
    this.dataManager = new DataManager();
    this.balanceManager = new BalanceManager(this.dataManager);
    this.matchManager = new MatchManager(this.dataManager, this.balanceManager);
    
    this.setupEventHandlers();
  }

  /**
   * Set up Discord.js event handlers
   */
  setupEventHandlers() {
    this.client.on('ready', () => {
      console.log(`Logged in as ${this.client.user.tag}`);
    });

    this.client.on('messageCreate', this.handleMessage.bind(this));
  }

  /**
   * Handle incoming Discord messages
   * @param {Message} msg - Discord.js message object
   */
  async handleMessage(msg) {
    if (!msg.content.startsWith('!')) return;
    
    const [command, ...args] = msg.content.slice(1).split(/\s+/);
    const userId = msg.author.id;

    switch (command) {
      case 'balance':
        this.handleBalanceCommand(msg, userId);
        break;
      case 'init':
        this.handleInitCommand(msg);
        break;
      case 'match':
        this.handleMatchCommand(msg, args, userId);
        break;
      case 'bet':
        this.handleBetCommand(msg, args, userId);
        break;
      case 'leaderboard':
        this.handleLeaderboardCommand(msg);
        break;
    }
  }

  /**
   * Handle !balance command
   * @param {Message} msg - Discord.js message object
   * @param {string} userId - Discord user ID
   */
  handleBalanceCommand(msg, userId) {
    const balance = this.balanceManager.getBalance(userId);
    msg.reply(`Your balance: $${balance} punaBacs`);
  }

  /**
   * Handle !init command (admin only)
   * @param {Message} msg - Discord.js message object
   */
  async handleInitCommand(msg) {
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
   * @param {Message} msg - Discord.js message object
   * @param {Array} args - Command arguments
   * @param {string} userId - Discord user ID
   */
  handleMatchCommand(msg, args, userId) {
    const subCommand = args[0];
    
    switch(subCommand) {
      case 'create':
        const [team1, team2] = [args[1], args[2]];
        if (!team1 || !team2) {
          msg.reply('Usage: !match create Team1 Team2');
          return;
        }
        
        const currentMatch = this.matchManager.getCurrentMatch();
        if (currentMatch.status === 'pending') {
          msg.reply('A match is already active!');
          return;
        }
        
        this.matchManager.createMatch(team1, team2);
        msg.channel.send(`Match created: ${team1} vs ${team2}`);
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
    }
  }

  /**
   * Handle !bet command
   * @param {Message} msg - Discord.js message object
   * @param {Array} args - Command arguments
   * @param {string} userId - Discord user ID
   */
  handleBetCommand(msg, args, userId) {
    const [team, amountStr] = args;
    const amount = parseInt(amountStr);
    
    const betResult = this.matchManager.placeBet(userId, team, amount);
    msg.reply(betResult.message);
  }

  /**
   * Handle !leaderboard command
   * @param {Message} msg - Discord.js message object
   */
  handleLeaderboardCommand(msg) {
    const leaderboardData = this.balanceManager.getLeaderboard();
    const leaderboard = leaderboardData
      .map(([uid, bal], i) => `${i + 1}. <@${uid}> — $${bal}`)
      .join('\n');
    
    msg.channel.send(`🏆 Leaderboard:\n${leaderboard}`);
  }

  /**
   * Start the Discord bot
   */
  start() {
    this.client.login(process.env.DISCORD_TOKEN);
  }
}

module.exports = BetBot; 