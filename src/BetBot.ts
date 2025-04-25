import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Collection,
  ChatInputCommandInteraction,
  REST,
  Routes,
  EmbedBuilder,
  ApplicationCommandOptionType,
} from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

import { BalanceManager } from './BalanceManager.js';
import { MatchManager } from './MatchManager.js';
import { EventManager } from './EventManager.js';
import { Match, DiscordMessage, Bet, OperationResult, EventBet } from './types/index.js';
import { Logger } from './utils/Logger.js';
import matchRepository from './database/repositories/MatchRepository.js';
import eventRepository from './database/repositories/EventRepository.js';
import userRepository from './database/repositories/UserRepository.js';
import betRepository from './database/repositories/BetRepository.js';

/**
 * Main Discord bot class that handles commands and integrates managers
 */
export class BetBot {
  private client: Client;
  private balanceManager: BalanceManager;
  private matchManager: MatchManager;
  private eventManager: EventManager;
  private commands: Collection<string, any>;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

    // Initialize managers
    this.balanceManager = new BalanceManager();
    this.matchManager = new MatchManager(this.balanceManager);
    this.eventManager = new EventManager(this.balanceManager);
    this.commands = new Collection();

    this.setupEventHandlers();
    this.setupAutocompletesHandler();
    this.registerCommands();
  }

  /**
   * Set up Discord.js event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      Logger.success('Bot', `Logged in as ${this.client.user?.tag}`);
    });

    // Handle slash command interactions
    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command(interaction);
      } catch (error) {
        Logger.error('Command', `Error executing ${interaction.commandName}`, error);

        const reply = {
          content: '❌ There was an error executing this command!',
          ephemeral: true,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    });

    // Handle autocomplete interactions
    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isAutocomplete()) return;

      if (
        interaction.commandName === 'bet' &&
        interaction.options.getFocused(true).name === 'team'
      ) {
        const activeMatch = this.matchManager.getCurrentMatch();
        if (!activeMatch) {
          await interaction.respond([]);
          return;
        }

        const options = [
          { name: activeMatch.team1, value: activeMatch.team1 },
          { name: activeMatch.team2, value: activeMatch.team2 },
        ];

        await interaction.respond(options);
      }

      // Handle autocomplete for match winner
      if (
        interaction.commandName === 'match' &&
        interaction.options.getSubcommand() === 'result' &&
        interaction.options.getFocused(true).name === 'winner'
      ) {
        const activeMatch = this.matchManager.getCurrentMatch();
        if (!activeMatch) {
          await interaction.respond([]);
          return;
        }

        const options = [
          { name: activeMatch.team1, value: activeMatch.team1 },
          { name: activeMatch.team2, value: activeMatch.team2 },
        ];

        await interaction.respond(options);
      }
    });

    // Keep message handler for backward compatibility but deprecate it
    this.client.on('messageCreate', async (msg: any) => {
      if (!msg.content.startsWith('!')) return;

      // Send a deprecation notice
      msg.reply(
        '⚠️ Message commands are deprecated. Please use slash commands instead (type / to see available commands).',
      );
    });
  }

  /**
   * Register slash commands with Discord
   */
  private async registerCommands(): Promise<void> {
    try {
      const commands = [
        {
          name: 'balance',
          description: 'Check your PunaCoin balance',
          options: [
            {
              name: 'user',
              type: ApplicationCommandOptionType.User,
              description: 'User to check balance for (admin only)',
              required: false,
            },
          ],
        },
        {
          name: 'leaderboard',
          description: 'Show PunaCoin leaderboard',
          options: [
            {
              name: 'limit',
              type: ApplicationCommandOptionType.Integer,
              description: 'Number of users to show (default: 10)',
              required: false,
              min_value: 1,
              max_value: 25,
            },
          ],
        },
        {
          name: 'match',
          description: 'Match management commands',
          options: [
            {
              name: 'create',
              type: ApplicationCommandOptionType.Subcommand,
              description: 'Create a new match',
              options: [
                {
                  name: 'type',
                  type: ApplicationCommandOptionType.String,
                  description: 'Type of match to create',
                  required: true,
                  choices: [
                    {
                      name: 'User vs User (1v1)',
                      value: '1v1',
                    },
                    {
                      name: 'Team vs Team',
                      value: 'team',
                    },
                  ],
                },
                {
                  name: 'participant1',
                  type: ApplicationCommandOptionType.User,
                  description: 'First participant (for 1v1 match)',
                  required: false,
                },
                {
                  name: 'participant2',
                  type: ApplicationCommandOptionType.User,
                  description: 'Second participant (for 1v1 match)',
                  required: false,
                },
                {
                  name: 'team1',
                  type: ApplicationCommandOptionType.String,
                  description: 'First team name (for team match)',
                  required: false,
                },
                {
                  name: 'team2',
                  type: ApplicationCommandOptionType.String,
                  description: 'Second team name (for team match)',
                  required: false,
                },
              ],
            },
            {
              name: 'start',
              type: ApplicationCommandOptionType.Subcommand,
              description: 'Start a match immediately (admin only)',
              options: [
                {
                  name: 'match_id',
                  type: ApplicationCommandOptionType.Integer,
                  description: 'ID of the match to start',
                  required: true,
                  autocomplete: true,
                },
              ],
            },
            {
              name: 'cancel',
              type: ApplicationCommandOptionType.Subcommand,
              description: 'Cancel a match (admin only)',
              options: [
                {
                  name: 'match_id',
                  type: ApplicationCommandOptionType.Integer,
                  description: 'ID of the match to cancel',
                  required: true,
                  autocomplete: true,
                },
              ],
            },
            {
              name: 'result',
              type: ApplicationCommandOptionType.Subcommand,
              description: 'Set the result of a match (admin only)',
              options: [
                {
                  name: 'match_id',
                  type: ApplicationCommandOptionType.Integer,
                  description: 'ID of the match to set result for',
                  required: true,
                  autocomplete: true,
                },
                {
                  name: 'winner',
                  type: ApplicationCommandOptionType.User,
                  description: 'The winner of the match (for 1v1)',
                  required: false,
                },
                {
                  name: 'team',
                  type: ApplicationCommandOptionType.String,
                  description: 'The winning team name (for team match)',
                  required: false,
                  autocomplete: true,
                },
              ],
            },
          ],
        },
        {
          name: 'event',
          description: 'Event management commands',
          options: [
            {
              name: 'create',
              type: ApplicationCommandOptionType.Subcommand,
              description: 'Create a new event with Yes/No outcome',
              options: [
                {
                  name: 'name',
                  type: ApplicationCommandOptionType.String,
                  description: 'Name of the event',
                  required: true,
                },
                {
                  name: 'participant',
                  type: ApplicationCommandOptionType.User,
                  description: 'Associated participant (optional)',
                  required: false,
                },
                {
                  name: 'description',
                  type: ApplicationCommandOptionType.String,
                  description: 'Additional description of the event',
                  required: false,
                },
              ],
            },
            {
              name: 'start',
              type: ApplicationCommandOptionType.Subcommand,
              description: 'Start an event immediately (admin only)',
              options: [
                {
                  name: 'event_id',
                  type: ApplicationCommandOptionType.Integer,
                  description: 'ID of the event to start',
                  required: true,
                  autocomplete: true,
                },
              ],
            },
            {
              name: 'cancel',
              type: ApplicationCommandOptionType.Subcommand,
              description: 'Cancel an event (admin only)',
              options: [
                {
                  name: 'event_id',
                  type: ApplicationCommandOptionType.Integer,
                  description: 'ID of the event to cancel',
                  required: true,
                  autocomplete: true,
                },
              ],
            },
            {
              name: 'result',
              type: ApplicationCommandOptionType.Subcommand,
              description: 'Set the result of an event (admin only)',
              options: [
                {
                  name: 'event_id',
                  type: ApplicationCommandOptionType.Integer,
                  description: 'ID of the event to set result for',
                  required: true,
                  autocomplete: true,
                },
                {
                  name: 'outcome',
                  type: ApplicationCommandOptionType.Boolean,
                  description: 'Outcome of the event (Yes/No)',
                  required: true,
                },
              ],
            },
          ],
        },
        {
          name: 'bet',
          description: 'Place a bet on a match or event',
          options: [
            {
              name: 'id',
              type: ApplicationCommandOptionType.Integer,
              description: 'ID of the match or event to bet on',
              required: true,
              autocomplete: true,
            },
            {
              name: 'option',
              type: ApplicationCommandOptionType.String,
              description: 'Participant/team/outcome to bet on',
              required: true,
              autocomplete: true,
            },
            {
              name: 'amount',
              type: ApplicationCommandOptionType.Integer,
              description: 'Amount to bet',
              required: true,
              min_value: 10,
            },
          ],
        },
        {
          name: 'history',
          description: 'View your betting history',
          options: [
            {
              name: 'limit',
              type: ApplicationCommandOptionType.Integer,
              description: 'Number of entries to show (default: 5)',
              required: false,
              min_value: 1,
              max_value: 25,
            },
          ],
        },
        {
          name: 'matches',
          description: 'View match history or active matches',
          options: [
            {
              name: 'filter',
              type: ApplicationCommandOptionType.String,
              description: 'Filter to apply',
              required: false,
              choices: [
                {
                  name: 'All matches',
                  value: 'all',
                },
                {
                  name: 'Active matches only',
                  value: 'active',
                },
                {
                  name: 'Completed matches only',
                  value: 'completed',
                },
                {
                  name: '1v1 matches only',
                  value: '1v1',
                },
                {
                  name: 'Team matches only',
                  value: 'team',
                },
              ],
            },
            {
              name: 'limit',
              type: ApplicationCommandOptionType.Integer,
              description: 'Number of matches to show (default: 5)',
              required: false,
              min_value: 1,
              max_value: 25,
            },
          ],
        },
        {
          name: 'events',
          description: 'View event history or active events',
          options: [
            {
              name: 'filter',
              type: ApplicationCommandOptionType.String,
              description: 'Filter to apply',
              required: false,
              choices: [
                {
                  name: 'All events',
                  value: 'all',
                },
                {
                  name: 'Active events only',
                  value: 'active',
                },
                {
                  name: 'Completed events only',
                  value: 'completed',
                },
              ],
            },
            {
              name: 'limit',
              type: ApplicationCommandOptionType.Integer,
              description: 'Number of events to show (default: 5)',
              required: false,
              min_value: 1,
              max_value: 25,
            },
          ],
        },
        {
          name: 'help',
          description: 'Show help information',
        },
        {
          name: 'init',
          description: 'Initialize a user in the system with starting balance (admin only)',
          options: [
            {
              name: 'user',
              type: ApplicationCommandOptionType.User,
              description: 'User to initialize',
              required: true,
            },
            {
              name: 'balance',
              type: ApplicationCommandOptionType.Integer,
              description: 'Starting balance (default: 1000)',
              required: false,
              min_value: 0,
            },
          ],
        },
      ];

      // Update commands for bot/guild
      const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
      const CLIENT_ID = process.env.CLIENT_ID;
      if (!DISCORD_TOKEN || !CLIENT_ID) {
        Logger.error('Bot', 'Missing DISCORD_TOKEN or CLIENT_ID environment variables');
        return;
      }

      const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

      Logger.info('Bot', `Started refreshing ${commands.length} application (/) commands.`);

      // Register commands globally
      await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commands,
      });

      // Set up the commands in the client collection
      this.commands = new Collection();
      this.commands.set('balance', this.handleBalanceCommand.bind(this));
      this.commands.set('init', this.handleInitCommand.bind(this));
      this.commands.set('match', this.handleMatchCommand.bind(this));
      this.commands.set('event', this.handleEventCommand.bind(this));
      this.commands.set('bet', this.handleBetCommand.bind(this));
      this.commands.set('leaderboard', this.handleLeaderboardCommand.bind(this));
      this.commands.set('history', this.handleHistoryCommand.bind(this));
      this.commands.set('matches', this.handleMatchesHistoryCommand.bind(this));
      this.commands.set('events', this.handleEventsHistoryCommand.bind(this));
      this.commands.set('help', this.handleHelpCommand.bind(this));

      Logger.success('Bot', 'Successfully registered application commands.');
    } catch (error) {
      Logger.error('Bot', `Error refreshing application commands: ${error}`);
    }
  }

  /**
   * Handle autocomplete interactions for various commands
   */
  private setupAutocompletesHandler(): void {
    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isAutocomplete()) return;

      // Handle match option autocomplete
      if (
        interaction.commandName === 'bet' &&
        interaction.options.getFocused(true).name === 'option'
      ) {
        const id = interaction.options.getInteger('id');
        if (!id) {
          await interaction.respond([]);
          return;
        }

        // Check if this is a match or an event
        const match = this.matchManager.getMatch(id);
        if (match) {
          // It's a match, offer team choices
          let options = [];

          if (match.match_type === '1v1') {
            // For 1v1 matches, show the player usernames but pass their IDs as values
            options = [
              { name: match.team1, value: match.player1_id || match.team1 },
              { name: match.team2, value: match.player2_id || match.team2 },
            ];
          } else {
            // For team matches, show the team names
            options = [
              { name: match.team1, value: match.team1 },
              { name: match.team2, value: match.team2 },
            ];
          }

          await interaction.respond(options);
        } else {
          // Check if it's an event
          const event = this.eventManager.getEventInfo(id);
          if (event) {
            // It's an event, offer Yes/No choices
            const options = [
              { name: 'Yes', value: 'Yes' },
              { name: 'No', value: 'No' },
            ];
            await interaction.respond(options);
          } else {
            await interaction.respond([]);
          }
        }
      }

      // Handle match ID autocomplete
      if (interaction.commandName === 'bet' && interaction.options.getFocused(true).name === 'id') {
        // Combine active matches and events
        const matches = this.getPendingMatches();
        const events = this.getPendingEvents();

        const options = [
          ...matches.map((m: any) => ({
            name: `Match #${m.id}: ${m.team1} vs ${m.team2}`,
            value: m.id,
          })),
          ...events.map((e: any) => ({
            name: `Event #${e.id}: ${e.title}`,
            value: e.id,
          })),
        ];

        await interaction.respond(options);
      }

      // Handle match result autocomplete for team choice
      if (
        interaction.commandName === 'match' &&
        interaction.options.getSubcommand() === 'result' &&
        interaction.options.getFocused(true).name === 'team'
      ) {
        const matchId = interaction.options.getInteger('match_id');
        if (!matchId) {
          await interaction.respond([]);
          return;
        }

        const match = this.matchManager.getMatch(matchId);
        if (!match) {
          await interaction.respond([]);
          return;
        }

        const options = [
          { name: match.team1, value: match.team1 },
          { name: match.team2, value: match.team2 },
        ];

        await interaction.respond(options);
      }

      // Autocomplete for match IDs in various match commands
      if (
        interaction.commandName === 'match' &&
        ['start', 'cancel', 'result'].includes(interaction.options.getSubcommand()) &&
        interaction.options.getFocused(true).name === 'match_id'
      ) {
        const matches = this.getPendingMatches();
        const options = matches.map((m: any) => ({
          name: `Match #${m.id}: ${m.team1} vs ${m.team2}`,
          value: m.id,
        }));

        await interaction.respond(options);
      }

      // Autocomplete for event IDs in various event commands
      if (
        interaction.commandName === 'event' &&
        ['start', 'cancel', 'result'].includes(interaction.options.getSubcommand()) &&
        interaction.options.getFocused(true).name === 'event_id'
      ) {
        const events = this.getPendingEvents();
        const options = events.map((e: any) => ({
          name: `Event #${e.id}: ${e.title}`,
          value: e.id,
        }));

        await interaction.respond(options);
      }
    });
  }

  /**
   * Get active/pending matches for autocomplete
   */
  private getPendingMatches(): any[] {
    // Get matches that are in 'pending' status
    return this.matchManager.getMatchHistory(10).filter(m => m.status === 'pending');
  }

  /**
   * Get active/pending events for autocomplete
   */
  private getPendingEvents(): any[] {
    // Get events that are in 'pending' status
    return this.eventManager.getEventHistory(10).filter(e => e.status === 'pending');
  }

  /**
   * Handle /balance command
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleBalanceCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const targetUser = interaction.options.getUser('user');

    if (targetUser) {
      // User wants to check someone else's balance
      const targetBalance = this.balanceManager.getBalance(targetUser.id);
      await interaction.reply(
        `💰 **${targetUser.username}'s Balance**: ${targetBalance} PunaCoins`,
      );
      Logger.command(userId, username, `/balance user:${targetUser.username}`);
    } else {
      // User wants to check their own balance
      const balance = this.balanceManager.getBalance(userId);
      await interaction.reply(`💰 **Your Balance**: ${balance} PunaCoins`);
      Logger.command(userId, username, '/balance');
    }
  }

  /**
   * Handle /init command (admin only)
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleInitCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // Check admin permissions
    if (!interaction.memberPermissions?.has('Administrator')) {
      await interaction.reply({
        content: '🚫 **Access Denied**: Only administrators can use this command.',
        ephemeral: true,
      });
      return;
    }

    // Defer reply as this might take time
    await interaction.deferReply();

    try {
      const members = await interaction.guild?.members.fetch();
      if (!members) {
        await interaction.editReply('❌ **Error**: Failed to fetch members.');
        return;
      }

      const added = this.balanceManager.initializeAllMembers(members);
      await interaction.editReply(`✅ **Success**: Balance initialized for ${added} members.`);

      Logger.command(interaction.user.id, interaction.user.username, '/init');
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ **Error**: Failed to fetch members.');
    }
  }

  /**
   * Handle /match commands for all match types (1v1, team, event)
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleMatchCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const subCommand = interaction.options.getSubcommand();

    // Log the command
    Logger.command(userId, username, `/match ${subCommand}`);

    switch (subCommand) {
    case 'create': {
      // Check if user has admin permission for creating matches
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: '🚫 **Access Denied**: Only administrators can create matches.',
          ephemeral: true,
        });
        return;
      }

      const matchType = interaction.options.getString('type', true);

      if (matchType === '1v1') {
        // Handle 1v1 match creation
        const user1 = interaction.options.getUser('participant1');
        const user2 = interaction.options.getUser('participant2');

        if (!user1 || !user2) {
          await interaction.reply({
            content: '❌ **Error**: Both participants are required for 1v1 matches.',
            ephemeral: true,
          });
          return;
        }

        // Check if both users are different
        if (user1.id === user2.id) {
          await interaction.reply({
            content: '❌ **Error**: You cannot create a 1v1 match between the same user.',
            ephemeral: true,
          });
          return;
        }

        // Verify that both users exist in the database
        const user1Exists = userRepository.exists(user1.id);
        const user2Exists = userRepository.exists(user2.id);

        if (!user1Exists || !user2Exists) {
          await interaction.reply({
            content: `❌ **Error**: ${
              !user1Exists ? user1.username : user2.username
            } is not initialized. Use /init to add them to the system first.`,
            ephemeral: true,
          });
          return;
        }

        // Create a 1v1 match
        const match = this.matchManager.createUserMatch(
          user1.id,
          user1.username,
          user2.id,
          user2.username,
        );

        // Calculate time until auto-start for this specific match
        const timeRemaining = this.matchManager.getBettingTimeRemaining(match.id);
        const minutesRemaining = Math.floor(timeRemaining / 60);
        const secondsRemaining = timeRemaining % 60;
        const timeRemainingStr = `${minutesRemaining}m ${secondsRemaining}s`;

        await interaction.reply(`
🎮 **1v1 Match #${match.id} Created!**
**${user1.username}** 🆚 **${user2.username}**

⏰ **Betting Window: 5 Minutes**
• Betting will automatically close in ${timeRemainingStr}
• Use \`/bet ${match.id} @${user1.username} <amount>\` to bet on ${user1.username}
• Use \`/bet ${match.id} @${user2.username} <amount>\` to bet on ${user2.username}
• Only one bet per user is allowed
• Admins can set the result with \`/match result ${match.id}\`

Good luck! 🍀
          `);
      } else if (matchType === 'team') {
        // Handle team match creation
        const team1 = interaction.options.getString('team1');
        const team2 = interaction.options.getString('team2');

        if (!team1 || !team2) {
          await interaction.reply({
            content: '❌ **Error**: Both team names are required for team matches.',
            ephemeral: true,
          });
          return;
        }

        // Check if both teams are different
        if (team1.toLowerCase() === team2.toLowerCase()) {
          await interaction.reply({
            content: '❌ **Error**: You cannot create a match between the same team.',
            ephemeral: true,
          });
          return;
        }

        // Create a team match
        const match = this.matchManager.createTeamMatch(team1, team2);

        // Calculate time until auto-start for this specific match
        const timeRemaining = this.matchManager.getBettingTimeRemaining(match.id);
        const minutesRemaining = Math.floor(timeRemaining / 60);
        const secondsRemaining = timeRemaining % 60;
        const timeRemainingStr = `${minutesRemaining}m ${secondsRemaining}s`;

        await interaction.reply(`
🎮 **Team Match #${match.id} Created!**
**${team1}** 🆚 **${team2}**

⏰ **Betting Window: 5 Minutes**
• Betting will automatically close in ${timeRemainingStr}
• Use \`/bet ${match.id} ${team1} <amount>\` to bet on ${team1}
• Use \`/bet ${match.id} ${team2} <amount>\` to bet on ${team2}
• Only one bet per user is allowed
• Admins can set the result with \`/match result ${match.id}\`

Good luck! 🍀
          `);
      }
      break;
    }
    case 'start': {
      // Check admin permissions
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: '🚫 **Access Denied**: Only administrators can start matches.',
          ephemeral: true,
        });
        return;
      }

      const matchId = interaction.options.getInteger('match_id', true);

      // Start the match
      const result = this.matchManager.startMatch(matchId);
      if (result.success) {
        // Get match and bet statistics
        const matchData = result.data.match;
        const betStats = result.data.bets;

        // Announce match start with statistics
        await interaction.reply(`
⏰ **BETTING CLOSED!** ⏰
Match #${matchId} has started! Betting is now closed.

**${matchData.team1}** 🆚 **${matchData.team2}**

📊 **Bet Statistics:**
• **${matchData.team1}**: ${betStats.team1.count} bets, ${betStats.team1.amount} PunaCoins
• **${matchData.team2}**: ${betStats.team2.count} bets, ${betStats.team2.amount} PunaCoins

Total bets: ${betStats.total} (${betStats.totalAmount} PunaCoins)
          `);
      } else {
        await interaction.reply({
          content: `❌ **Error**: ${result.message}`,
          ephemeral: true,
        });
      }
      break;
    }
    case 'cancel': {
      // Check admin permissions
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: '🚫 **Access Denied**: Only administrators can cancel matches.',
          ephemeral: true,
        });
        return;
      }

      const matchId = interaction.options.getInteger('match_id', true);

      // Cancel the match
      const result = this.matchManager.cancelMatch(matchId);
      if (result.success) {
        await interaction.reply(
          `✅ Match #${matchId} has been canceled. All bets have been refunded.`,
        );
      } else {
        await interaction.reply({
          content: `❌ **Error**: ${result.message}`,
          ephemeral: true,
        });
      }
      break;
    }
    case 'result': {
      // Check admin permissions
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: '🚫 **Access Denied**: Only administrators can set match results.',
          ephemeral: true,
        });
        return;
      }

      const matchId = interaction.options.getInteger('match_id', true);

      // Check if this is a regular match
      const match = this.matchManager.getMatch(matchId);

      if (match) {
        if (match.match_type === '1v1') {
          // Handle 1v1 match result
          const winner = interaction.options.getUser('winner', true);

          // Validate winner is in the match
          if (match.player1_id !== winner.id && match.player2_id !== winner.id) {
            await interaction.reply({
              content: `❌ **Error**: User "${winner.username}" is not part of Match #${matchId}.`,
              ephemeral: true,
            });
            return;
          }

          // Set match result
          const resultResponse = this.matchManager.finishMatch(matchId, winner.id);

          if (resultResponse.success) {
            // Get the updated match data
            const matchData = this.matchManager.getMatch(matchId);
            if (matchData && matchData.winner === winner.id) {
              const bets = this.matchManager.getMatchBets(matchData.id);
              const totalBets = bets.length;
              const totalAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);

              // Generate winners list
              const winningBets = bets.filter(b => b.team === winner.id);
              const winnersList =
                  winningBets.length > 0
                    ? winningBets
                      .sort((a, b) => b.amount - a.amount)
                      .slice(0, 5)
                      .map(
                        b =>
                          `• <@${b.user_id}>: ${b.amount} PunaCoins → ${b.amount * 2} PunaCoins`,
                      )
                      .join('\n')
                    : 'No winning bets';

              await interaction.reply(`
🏆 **MATCH RESULTS** 🏆
**Match #${matchData.id}**: **${matchData.team1}** 🆚 **${matchData.team2}**

🎉 **WINNER: ${winner.username}!**

💰 **Top Winners:**
${winnersList}

Congratulations to all winners! Your bets have been paid out at 2x.
                `);
            }
          } else {
            await interaction.reply({
              content: `❌ ${resultResponse.message}`,
              ephemeral: true,
            });
          }
        } else if (match.match_type === 'team') {
          // Handle team match result
          const team = interaction.options.getString('team', true);

          // Validate team is in the match
          if (match.team1 !== team && match.team2 !== team) {
            await interaction.reply({
              content: `❌ **Error**: Team "${team}" is not part of Match #${matchId}.`,
              ephemeral: true,
            });
            return;
          }

          // Set match result
          const resultResponse = this.matchManager.finishTeamMatch(matchId, team);

          if (resultResponse.success) {
            // Get the updated match data
            const matchData = this.matchManager.getMatch(matchId);
            if (matchData && matchData.winner === team) {
              const bets = this.matchManager.getMatchBets(matchData.id);
              const totalBets = bets.length;
              const totalAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);

              // Generate winners list
              const winningBets = bets.filter(b => b.team === team);
              const winnersList =
                  winningBets.length > 0
                    ? winningBets
                      .sort((a, b) => b.amount - a.amount)
                      .slice(0, 5)
                      .map(
                        b =>
                          `• <@${b.user_id}>: ${b.amount} PunaCoins → ${b.amount * 2} PunaCoins`,
                      )
                      .join('\n')
                    : 'No winning bets';

              await interaction.reply(`
🏆 **TEAM MATCH RESULTS** 🏆
**Match #${matchData.id}**: **${matchData.team1}** 🆚 **${matchData.team2}**

🎉 **WINNER: ${team}!**

💰 **Top Winners:**
${winnersList}

Congratulations to all winners! Your bets have been paid out at 2x.
                `);
            }
          } else {
            await interaction.reply({
              content: `❌ ${resultResponse.message}`,
              ephemeral: true,
            });
          }
        }
      } else {
        await interaction.reply({
          content: `❌ **Error**: Match #${matchId} not found.`,
          ephemeral: true,
        });
      }
      break;
    }
    }
  }

  /**
   * Handle /event commands for event management
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleEventCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const subCommand = interaction.options.getSubcommand();

    // Log the command
    Logger.command(userId, username, `/event ${subCommand}`);

    switch (subCommand) {
    case 'create': {
      // Check admin permissions
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: '🚫 **Access Denied**: Only administrators can create events.',
          ephemeral: true,
        });
        return;
      }

      const name = interaction.options.getString('name', true);
      const description = interaction.options.getString('description') || '';
      const participant = interaction.options.getUser('participant');

      // Create the event
      const event = this.eventManager.createEvent(name, description, participant?.id);

      // Format the time remaining
      const timeRemaining = this.eventManager.getBettingTimeRemaining(event.id);
      const minutesRemaining = Math.floor(timeRemaining / 60);
      const secondsRemaining = timeRemaining % 60;
      const timeRemainingStr = `${minutesRemaining}m ${secondsRemaining}s`;

      // Send response
      await interaction.reply(`
📊 **Event #${event.id} Created!**
**${name}**
${description ? `*${description}*\n` : ''}
${participant ? `**Participant**: <@${participant.id}>\n` : ''}
⏰ **Betting Window: 5 Minutes**
• Betting will automatically close in ${timeRemainingStr}
• Use \`/bet ${event.id} Yes <amount>\` to bet on "Yes"
• Use \`/bet ${event.id} No <amount>\` to bet on "No"
• Only one bet per user is allowed
• Admins can set the result with \`/event result ${event.id}\`

Good luck! 🍀
      `);
      break;
    }
    case 'start': {
      // Check admin permissions
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: '🚫 **Access Denied**: Only administrators can start events.',
          ephemeral: true,
        });
        return;
      }

      const eventId = interaction.options.getInteger('event_id', true);

      // Start the event
      const result = this.eventManager.startEvent(eventId);
      if (result.success) {
        // Get event and bet statistics
        const eventData = result.data.event;
        const betStats = result.data.bets;

        // Announce event start with statistics
        await interaction.reply(`
⏰ **BETTING CLOSED!** ⏰
Event #${eventId} has started! Betting is now closed.

**${eventData.title}**
${eventData.description ? `*${eventData.description}*\n` : ''}

📊 **Bet Statistics:**
• **Yes**: ${betStats.yes.count} bets, ${betStats.yes.amount} PunaCoins
• **No**: ${betStats.no.count} bets, ${betStats.no.amount} PunaCoins

Total bets: ${betStats.total} (${betStats.totalAmount} PunaCoins)
        `);
      } else {
        await interaction.reply({
          content: `❌ **Error**: ${result.message}`,
          ephemeral: true,
        });
      }
      break;
    }
    case 'cancel': {
      // Check admin permissions
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: '🚫 **Access Denied**: Only administrators can cancel events.',
          ephemeral: true,
        });
        return;
      }

      const eventId = interaction.options.getInteger('event_id', true);

      // Cancel the event
      const result = this.eventManager.cancelEvent(eventId);
      if (result.success) {
        await interaction.reply(
          `✅ Event #${eventId} has been canceled. All bets have been refunded.`,
        );
      } else {
        await interaction.reply({
          content: `❌ **Error**: ${result.message}`,
          ephemeral: true,
        });
      }
      break;
    }
    case 'result': {
      // Check admin permissions
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: '🚫 **Access Denied**: Only administrators can set event results.',
          ephemeral: true,
        });
        return;
      }

      const eventId = interaction.options.getInteger('event_id', true);
      const outcome = interaction.options.getBoolean('outcome', true);

      // Set the event result
      const result = this.eventManager.setEventResult(eventId, outcome);
      if (result.success) {
        // Get event and winner data
        const event = this.eventManager.getEventInfo(eventId);
        if (event) {
          const bets = this.eventManager.getEventBets(eventId);

          // Generate winners list
          const winningBets = bets.filter(b => b.outcome === outcome);
          const winnersList =
              winningBets.length > 0
                ? winningBets
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 5)
                  .map(
                    b => `• <@${b.user_id}>: ${b.amount} PunaCoins → ${b.amount * 2} PunaCoins`,
                  )
                  .join('\n')
                : 'No winning bets';

          await interaction.reply(`
🏆 **EVENT RESULTS** 🏆
**Event #${event.id}**: ${event.title}
${event.description ? `*${event.description}*\n` : ''}

🎉 **OUTCOME: ${outcome ? 'YES' : 'NO'}!**

💰 **Top Winners:**
${winnersList}

Congratulations to all winners! Your bets have been paid out at 2x.
        `);
        }
      } else {
        await interaction.reply({
          content: `❌ **Error**: ${result.message}`,
          ephemeral: true,
        });
      }
      break;
    }
    }
  }

  /**
   * Handle /bet command
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleBetCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const id = interaction.options.getInteger('id', true);
    const option = interaction.options.getString('option', true);
    const amount = interaction.options.getInteger('amount', true);

    // Log the command
    Logger.command(userId, username, `/bet ${id} ${option} ${amount}`);

    // Check if id is for a match
    const match = this.matchManager.getMatch(id);
    if (match) {
      // Place bet on match
      const result = this.matchManager.placeBetOnMatch(userId, username, id, option, amount);

      if (result.success) {
        // Send a reply to the user who placed the bet
        await interaction.reply({
          content: `✅ **Bet Placed!** ${result.message}`,
          ephemeral: true,
        });

        // Announce the bet to the channel - using followUp for public visibility
        try {
          await interaction.followUp({
            content: `💰 **New Bet!** <@${userId}> bet ${amount} PunaCoins on **${option}** in match #${id} (${match.team1} vs ${match.team2})`,
            ephemeral: false,
          });
        } catch (err) {
          Logger.error('Bet', `Failed to announce bet: ${err}`);
        }
      } else {
        await interaction.reply({
          content: `❌ **Error**: ${result.message}`,
          ephemeral: true,
        });
      }
      return;
    }

    // Check if id is for an event
    const event = this.eventManager.getEventInfo(id);
    if (event) {
      // Place bet on event
      const result = this.eventManager.placeBet(userId, username, id, option === 'Yes', amount);

      if (result.success) {
        // Send a reply to the user who placed the bet
        await interaction.reply({
          content: `✅ **Bet Placed!** ${result.message}`,
          ephemeral: true,
        });

        // Announce the bet to the channel - using followUp for public visibility
        try {
          await interaction.followUp({
            content: `💰 **New Bet!** <@${userId}> bet ${amount} PunaCoins on **${option}** in event #${id} (${event.title})`,
            ephemeral: false,
          });
        } catch (err) {
          Logger.error('Bet', `Failed to announce event bet: ${err}`);
        }
      } else {
        await interaction.reply({
          content: `❌ **Error**: ${result.message}`,
          ephemeral: true,
        });
      }
      return;
    }

    // Neither match nor event found
    await interaction.reply({
      content: `❌ **Error**: ID #${id} not found. Please select a valid match or event.`,
      ephemeral: true,
    });
  }

  /**
   * Handle /leaderboard command
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleLeaderboardCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const limit = interaction.options.getInteger('limit') || 5;

    // Log the command
    Logger.command(userId, username, `/leaderboard ${limit}`);

    try {
      // Get top users by balance
      const leaderboard = this.balanceManager.getLeaderboard(limit);

      if (leaderboard.length === 0) {
        await interaction.reply({
          content: '❌ **No Data**: There are no users with a balance yet.',
          ephemeral: true,
        });
        return;
      }

      // Build leaderboard display
      const leaderboardDisplay = leaderboard
        .map((user, index) => {
          const medal =
            index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          return `${medal} <@${user.id}>: **${user.balance}** PunaCoins`;
        })
        .join('\n');

      await interaction.reply(`
💰 **PunaCoin Leaderboard** 💰
*Top ${leaderboard.length} users by balance:*

${leaderboardDisplay}
      `);
    } catch (error) {
      Logger.error('Leaderboard', `Error showing leaderboard: ${error}`);
      await interaction.reply({
        content: '❌ **Error**: There was a problem getting the leaderboard data.',
        ephemeral: true,
      });
    }
  }

  /**
   * Handle /history command
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleHistoryCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const limit = interaction.options.getInteger('limit') || 5;

    // Log the command
    Logger.command(userId, username, `/history ${limit}`);

    try {
      // Get user's transaction history
      const transactions = this.balanceManager.getTransactionHistory(userId, limit);

      if (transactions.length === 0) {
        await interaction.reply({
          content: "❌ **No History**: You don't have any transactions yet.",
          ephemeral: true,
        });
        return;
      }

      // Format transaction history
      const transactionList = transactions
        .map(tx => {
          const date = new Date(tx.created_at).toLocaleString();
          const amountDisplay = tx.amount > 0 ? `+${tx.amount}` : tx.amount;
          const amountColor = tx.amount > 0 ? '🟢' : '🔴';

          let description;
          switch (tx.type) {
          case 'init':
            description = 'Initial balance';
            break;
          case 'bet':
            description = `Placed bet #${tx.reference_id}`;
            break;
          case 'payout':
            description = `Winnings from bet #${tx.reference_id}`;
            break;
          case 'refund':
            description = `Refund from bet #${tx.reference_id}`;
            break;
          case 'event_bet':
            description = `Placed event bet #${tx.reference_id}`;
            break;
          case 'event_payout':
            description = `Winnings from event bet #${tx.reference_id}`;
            break;
          case 'donate':
            description = 'Donation';
            break;
          default:
            description = tx.type;
          }

          return `**${date}**: ${amountColor} ${description} - **${amountDisplay}** PunaCoins`;
        })
        .join('\n');

      await interaction.reply({
        content: `
📜 **Transaction History** 📜
*Your last ${transactions.length} transactions:*

${transactionList}

Current balance: **${this.balanceManager.getBalance(userId)}** PunaCoins
        `,
        ephemeral: true,
      });
    } catch (error) {
      Logger.error('History', `Error showing transaction history: ${error}`);
      await interaction.reply({
        content: '❌ **Error**: There was a problem getting your transaction history.',
        ephemeral: true,
      });
    }
  }

  /**
   * Handle /matches command
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleMatchesHistoryCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const limit = interaction.options.getInteger('limit') || 5;

    // Log the command
    Logger.command(userId, username, `/matches ${limit}`);

    try {
      // Get recent matches
      const matches = this.matchManager.getMatchHistory(limit);

      if (matches.length === 0) {
        await interaction.reply({
          content: '❌ **No Matches**: There are no matches in the history yet.',
          ephemeral: false,
        });
        return;
      }

      // Format match history
      const matchesList = matches
        .map(match => {
          const date = new Date(match.created_at as string).toLocaleString();
          let statusDisplay;

          switch (match.status) {
          case 'pending':
            statusDisplay = '⏳ Betting Open';
            break;
          case 'started':
            statusDisplay = '🔄 In Progress';
            break;
          case 'done':
            statusDisplay = `✅ Finished - Winner: **${match.winner}**`;
            break;
          case 'canceled':
            statusDisplay = '❌ Canceled';
            break;
          default:
            statusDisplay = match.status;
          }

          const matchType = match.match_type === 'team' ? 'Team Match' : '1v1 Match';

          return `**Match #${match.id}**: ${match.team1} 🆚 ${match.team2} - ${matchType}
*${date}* - Status: ${statusDisplay}`;
        })
        .join('\n\n');

      await interaction.reply(`
🏆 **Recent Matches** 🏆
*Last ${matches.length} matches:*

${matchesList}
      `);
    } catch (error) {
      Logger.error('Matches', `Error showing match history: ${error}`);
      await interaction.reply({
        content: '❌ **Error**: There was a problem getting the match history.',
        ephemeral: true,
      });
    }
  }

  /**
   * Handle /events command
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleEventsHistoryCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const limit = interaction.options.getInteger('limit') || 5;

    // Log the command
    Logger.command(userId, username, `/events ${limit}`);

    try {
      // Get recent events
      const events = this.eventManager.getEventHistory(limit);

      if (events.length === 0) {
        await interaction.reply({
          content: '❌ **No Events**: There are no events in the history yet.',
          ephemeral: false,
        });
        return;
      }

      // Format event history
      const eventsList = events
        .map(event => {
          const date = new Date(event.created_at as string).toLocaleString();
          let statusDisplay;
          let outcomeDisplay = '';

          switch (event.status) {
          case 'pending':
            statusDisplay = '⏳ Betting Open';
            break;
          case 'started':
            statusDisplay = '🔄 In Progress';
            break;
          case 'done':
            statusDisplay = '✅ Finished';
            // Add outcome info if the event is done
            if (event.success !== undefined) {
              outcomeDisplay = `\nOutcome: **${event.success ? 'YES' : 'NO'}**`;
            }
            break;
          case 'canceled':
            statusDisplay = '❌ Canceled';
            break;
          default:
            statusDisplay = event.status;
          }

          return `**Event #${event.id}**: ${event.title}
*${date}* - Status: ${statusDisplay}${outcomeDisplay}
${event.description ? `Description: ${event.description}` : ''}`;
        })
        .join('\n\n');

      await interaction.reply(`
📅 **Recent Events** 📅
*Last ${events.length} events:*

${eventsList}
      `);
    } catch (error) {
      Logger.error('Events', `Error showing event history: ${error}`);
      await interaction.reply({
        content: '❌ **Error**: There was a problem getting the event history.',
        ephemeral: true,
      });
    }
  }

  /**
   * Handle /help command
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Log the command
    Logger.command(userId, username, '/help');

    const helpText = `
🤖 **PunaCoin Betting Bot Commands** 🤖

💰 **Basic Commands:**
• \`/balance\` - Check your PunaCoin balance
• \`/leaderboard [limit]\` - Show top users by balance
• \`/history [limit]\` - View your transaction history

🏆 **Match Betting:**
• \`/matches [limit]\` - View recent matches
• \`/bet <id> <option> <amount>\` - Place a bet on a match

📅 **Event Betting:**
• \`/events [limit]\` - View recent events
• \`/bet <id> <Yes|No> <amount>\` - Place a bet on an event outcome

👑 **Admin Commands:**
• \`/init\` - Initialize balances for new server members
• \`/match create\` - Create a new match
• \`/match result\` - Set match result
• \`/event create\` - Create a new event
• \`/event result\` - Set event result

Need more help? Contact the server administrator.
`;

    // Send help message
    await interaction.reply({
      content: helpText,
      ephemeral: true,
    });
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
