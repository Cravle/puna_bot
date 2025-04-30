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
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ComponentType,
  InteractionResponse,
  Colors,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
} from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

import { BalanceManager } from './BalanceManager.js';
import { MatchManager } from './MatchManager.js';
import { EventManager } from './EventManager.js';
import { Match, DiscordMessage, Bet, OperationResult, EventBet, MatchType } from './types/index.js';
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

    // Handle button interactions
    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isButton()) return;

      try {
        // Extract the action from the button's customId
        // Format: action:param1:param2...
        const [action, ...params] = interaction.customId.split(':');

        // Handle different button actions
        switch (action) {
        case 'flip_again':
          await this.handleFlipAgainButton(interaction);
          break;
        case 'random_again':
          await this.handleRandomAgainButton(interaction, params);
          break;
        case 'bet_match':
          await this.handleBetMatchButton(interaction, params);
          break;
        case 'bet_event':
          await this.handleBetEventButton(interaction, params);
          break;
        case 'show_match_bets':
          await this.handleShowMatchBetsButton(interaction, params);
          break;
        case 'show_event_bets':
          await this.handleShowEventBetsButton(interaction, params);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown button action',
            ephemeral: true,
          });
        }
      } catch (error) {
        Logger.error('Button', `Error handling button interaction: ${error}`);
        await interaction.reply({
          content: '❌ There was an error processing this button!',
          ephemeral: true,
        });
      }
    });

    // Handle modal submit interactions
    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isModalSubmit()) return;

      try {
        // Extract the action from the modal's customId
        // Format: action:param1:param2...
        const [action, ...params] = interaction.customId.split(':');

        // Handle different modal actions
        switch (action) {
        case 'place_bet':
          await this.handlePlaceBetModalSubmit(interaction, params);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown modal action',
            ephemeral: true,
          });
        }
      } catch (error) {
        Logger.error('Modal', `Error handling modal interaction: ${error}`);
        await interaction.reply({
          content: '❌ There was an error processing your input!',
          ephemeral: true,
        });
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
              description: 'Number of users to show (default: 5)',
              required: false,
              min_value: 1,
              max_value: 25,
            },
          ],
        },
        {
          name: 'flip',
          description: 'Flip a coin (heads or tails)',
        },
        {
          name: 'random',
          description: 'Generate a random number (default: 1-100)',
          options: [
            {
              name: 'min',
              type: ApplicationCommandOptionType.Integer,
              description: 'Minimum value (default: 1)',
              required: false,
              min_value: 1,
              max_value: 100000,
            },
            {
              name: 'max',
              type: ApplicationCommandOptionType.Integer,
              description: 'Maximum value (default: 100)',
              required: false,
              min_value: 1,
              max_value: 100000,
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
              name: 'limit',
              type: ApplicationCommandOptionType.Integer,
              description: 'Number of matches to show (default: 5)',
              required: false,
              min_value: 1,
              max_value: 25,
            },
            {
              name: 'show_all',
              type: ApplicationCommandOptionType.Boolean,
              description:
                'Show all matches including canceled ones (default: only completed matches)',
              required: false,
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
      this.commands.set('flip', this.handleFlipCommand.bind(this));
      this.commands.set('random', this.handleRandomCommand.bind(this));

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

        // Create buttons for player betting
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`bet_match:${match.id}:${user1.id}`)
            .setLabel(`Bet on ${user1.username}`)
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`bet_match:${match.id}:${user2.id}`)
            .setLabel(`Bet on ${user2.username}`)
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`show_match_bets:${match.id}`)
            .setLabel('See All Bets')
            .setStyle(ButtonStyle.Secondary),
        );

        await interaction.reply({
          content: `
🎮 **1v1 Match #${match.id} Created!**
**${user1.username}** 🆚 **${user2.username}**

⏰ **Betting Window: 5 Minutes**
• Betting will automatically close in ${timeRemainingStr}
• Use \`/bet ${match.id} @${user1.username} <amount>\` to bet on ${user1.username}
• Use \`/bet ${match.id} @${user2.username} <amount>\` to bet on ${user2.username}
• Only one bet per user is allowed
• Admins can set the result with \`/match result ${match.id}\`

Good luck! 🍀
          `,
          components: [row],
        });
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

        // Create buttons for team betting
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`bet_match:${match.id}:${team1}`)
            .setLabel(`Bet on ${team1}`)
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`bet_match:${match.id}:${team2}`)
            .setLabel(`Bet on ${team2}`)
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`show_match_bets:${match.id}`)
            .setLabel('See All Bets')
            .setStyle(ButtonStyle.Secondary),
        );

        await interaction.reply({
          content: `
🎮 **Team Match #${match.id} Created!**
**${team1}** 🆚 **${team2}**

⏰ **Betting Window: 5 Minutes**
• Betting will automatically close in ${timeRemainingStr}
• Use \`/bet ${match.id} ${team1} <amount>\` to bet on ${team1}
• Use \`/bet ${match.id} ${team2} <amount>\` to bet on ${team2}
• Only one bet per user is allowed
• Admins can set the result with \`/match result ${match.id}\`

Good luck! 🍀
          `,
          components: [row],
        });
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

        // Create an embed for a more visually appealing announcement
        const matchStartEmbed = new EmbedBuilder()
          .setColor(Colors.Gold)
          .setTitle(`🏆 Match #${matchId} Has Started!`)
          .setDescription(
            `**${matchData.team1}** 🆚 **${matchData.team2}**\n⏰ **Betting is now CLOSED!**`,
          )
          .addFields(
            {
              name: '📊 Betting Statistics',
              value: `Total Bets: **${betStats.total}** (${betStats.totalAmount} PunaCoins)`,
              inline: false,
            },
            {
              name: `${matchData.team1}`,
              value: `${betStats.team1.count} bets\n${betStats.team1.amount} PunaCoins`,
              inline: true,
            },
            {
              name: '📈 Odds',
              value:
                  betStats.totalAmount > 0
                    ? `${((betStats.team1.amount / betStats.totalAmount) * 100).toFixed(1)}% : ${(
                      (betStats.team2.amount / betStats.totalAmount) *
                        100
                    ).toFixed(1)}%`
                    : '50% : 50%',
              inline: true,
            },
            {
              name: `${matchData.team2}`,
              value: `${betStats.team2.count} bets\n${betStats.team2.amount} PunaCoins`,
              inline: true,
            },
          )
          .setFooter({ text: 'The match result will be announced soon!' })
          .setTimestamp();

        // Add button to see all bets
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`show_match_bets:${matchId}`)
            .setLabel('See All Bets')
            .setStyle(ButtonStyle.Primary),
        );

        // Send the enhanced announcement
        await interaction.reply({
          embeds: [matchStartEmbed],
          components: [row],
        });
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

      // Create buttons for event betting
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`bet_event:${event.id}:Yes`)
          .setLabel('Bet on Yes')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`bet_event:${event.id}:No`)
          .setLabel('Bet on No')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`show_event_bets:${event.id}`)
          .setLabel('See All Bets')
          .setStyle(ButtonStyle.Secondary),
      );

      // Send response
      await interaction.reply({
        content: `
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
      `,
        components: [row],
      });
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
        // For 1v1 matches, format the choice to show username instead of ID
        let displayChoice = option;
        if (match.match_type === MatchType.ONE_VS_ONE) {
          // If the bet is on player1, show their username
          if (option === match.player1_id) {
            displayChoice = match.team1;
          }
          // If the bet is on player2, show their username
          else if (option === match.player2_id) {
            displayChoice = match.team2;
          }
        }

        // Create embed for successful bet
        const successEmbed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle('✅ Bet Placed Successfully!')
          .setDescription(`Your bet has been placed on match #${id}`)
          .addFields(
            { name: 'Match', value: `**${match.team1}** vs **${match.team2}**`, inline: false },
            { name: 'Your Choice', value: `**${displayChoice}**`, inline: true },
            { name: 'Amount', value: `**${amount}** PunaCoins`, inline: true },
            { name: 'Status', value: result.message, inline: false },
          )
          .setFooter({
            text: `Your current balance: ${this.balanceManager.getBalance(userId)} PunaCoins`,
          })
          .setTimestamp();

        // Add buttons to see match details and bets
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`show_match_bets:${id}`)
            .setLabel('See All Bets')
            .setStyle(ButtonStyle.Primary),
        );

        // Send private confirmation to the user
        await interaction.reply({
          embeds: [successEmbed],
          components: [row],
          ephemeral: true,
        });

        // Create announcement embed for the channel
        // For 1v1 matches, format the choice to show username instead of ID
        displayChoice = option;
        if (match.match_type === MatchType.ONE_VS_ONE) {
          // If the bet is on player1, show their username
          if (option === match.player1_id) {
            displayChoice = match.team1;
          }
          // If the bet is on player2, show their username
          else if (option === match.player2_id) {
            displayChoice = match.team2;
          }
        }

        const announcementEmbed = new EmbedBuilder()
          .setColor(Colors.Gold)
          .setTitle('💰 New Bet Placed!')
          .setDescription(`<@${userId}> has placed a bet on match #${id}`)
          .addFields(
            { name: 'Match', value: `**${match.team1}** vs **${match.team2}**`, inline: false },
            { name: 'Choice', value: `**${displayChoice}**`, inline: true },
            { name: 'Amount', value: `**${amount}** PunaCoins`, inline: true },
          )
          .setFooter({ text: `Match ID: ${id}` })
          .setTimestamp();

        // Announce the bet to the channel
        try {
          await interaction.followUp({
            embeds: [announcementEmbed],
            ephemeral: false,
          });
        } catch (err) {
          Logger.error('Bet', `Failed to announce bet: ${err}`);
        }
      } else {
        // Create embed for failed bet
        const errorEmbed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setTitle('❌ Bet Failed')
          .setDescription(`Unable to place bet on match #${id}`)
          .addFields(
            { name: 'Error', value: result.message, inline: false },
            { name: 'Match', value: `**${match.team1}** vs **${match.team2}**`, inline: false },
            {
              name: 'Current Balance',
              value: `**${this.balanceManager.getBalance(userId)}** PunaCoins`,
              inline: true,
            },
          )
          .setFooter({ text: 'Try again with a different amount or match' })
          .setTimestamp();

        await interaction.reply({
          embeds: [errorEmbed],
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
        // Create embed for successful event bet
        const successEmbed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle('✅ Event Bet Placed Successfully!')
          .setDescription(`Your bet has been placed on event #${id}`)
          .addFields(
            { name: 'Event', value: `**${event.title}**`, inline: false },
            { name: 'Your Prediction', value: `**${option}**`, inline: true },
            { name: 'Amount', value: `**${amount}** PunaCoins`, inline: true },
            { name: 'Status', value: result.message, inline: false },
          )
          .setFooter({
            text: `Your current balance: ${this.balanceManager.getBalance(userId)} PunaCoins`,
          })
          .setTimestamp();

        // Add button to see all event bets
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`show_event_bets:${id}`)
            .setLabel('See All Bets')
            .setStyle(ButtonStyle.Primary),
        );

        // Send private confirmation to the user
        await interaction.reply({
          embeds: [successEmbed],
          components: [row],
          ephemeral: true,
        });

        // Create announcement embed for the channel
        const announcementEmbed = new EmbedBuilder()
          .setColor(Colors.Purple)
          .setTitle('💰 New Event Bet Placed!')
          .setDescription(`<@${userId}> has placed a bet on event #${id}`)
          .addFields(
            { name: 'Event', value: `**${event.title}**`, inline: false },
            { name: 'Prediction', value: `**${option}**`, inline: true },
            { name: 'Amount', value: `**${amount}** PunaCoins`, inline: true },
          )
          .setFooter({ text: `Event ID: ${id}` })
          .setTimestamp();

        // Announce the bet to the channel
        try {
          await interaction.followUp({
            embeds: [announcementEmbed],
            ephemeral: false,
          });
        } catch (err) {
          Logger.error('Bet', `Failed to announce event bet: ${err}`);
        }
      } else {
        // Create embed for failed event bet
        const errorEmbed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setTitle('❌ Event Bet Failed')
          .setDescription(`Unable to place bet on event #${id}`)
          .addFields(
            { name: 'Error', value: result.message, inline: false },
            { name: 'Event', value: `**${event.title}**`, inline: false },
            {
              name: 'Current Balance',
              value: `**${this.balanceManager.getBalance(userId)}** PunaCoins`,
              inline: true,
            },
          )
          .setFooter({ text: 'Try again with a different amount or event' })
          .setTimestamp();

        await interaction.reply({
          embeds: [errorEmbed],
          ephemeral: true,
        });
      }
      return;
    }

    // Neither match nor event found - create error embed
    const notFoundEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('❌ Invalid ID')
      .setDescription(`ID #${id} was not found in our system`)
      .addFields(
        { name: 'Solution', value: 'Please select a valid match or event ID', inline: false },
        {
          name: 'Tip',
          value: 'Use `/matches` or `/events` to see available options',
          inline: false,
        },
      )
      .setFooter({
        text: `Your current balance: ${this.balanceManager.getBalance(userId)} PunaCoins`,
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [notFoundEmbed],
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

      // Create embed for leaderboard
      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('💰 PunaCoin Leaderboard 💰')
        .setDescription(`*Top ${leaderboard.length} users by balance:*`)
        .setFooter({ text: `Requested by ${username}` })
        .setTimestamp();

      // Add fields for each user
      leaderboard.forEach((user, index) => {
        const medal =
          index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        embed.addFields({
          name: `${medal} Rank #${index + 1}`,
          value: `<@${user.id}>: **${user.balance}** PunaCoins`,
          inline: false,
        });
      });

      // Calculate total economy size
      const totalEconomy = leaderboard.reduce((sum, user) => sum + user.balance, 0);
      embed.addFields({
        name: '💹 Economy Stats',
        value: `Total in circulation: **${totalEconomy}** PunaCoins`,
        inline: false,
      });

      await interaction.reply({
        embeds: [embed],
      });
    } catch (error) {
      Logger.error('Leaderboard', `Error showing leaderboard: ${error}`);
      // Check if we already replied or deferred before sending an error message
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **Error**: There was a problem getting the leaderboard data.',
          ephemeral: true,
        });
      } else {
        // If we already replied/deferred, use followup for the error message
        // Use ephemeral here too so only the user sees the error
        await interaction.followUp({
          content: '❌ **Error**: There was a problem getting the leaderboard data.',
          ephemeral: true,
        });
      }
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
    const showAll = interaction.options.getBoolean('show_all') || false;

    // Log the command
    Logger.command(userId, username, `/matches ${limit} ${showAll ? 'all' : 'completed_only'}`);

    try {
      // Get recent matches - either all or only completed ones based on showAll option
      const matches = showAll
        ? this.matchManager.getMatchHistory(limit)
        : this.matchManager.getCompletedMatchHistory(limit);

      if (matches.length === 0) {
        await interaction.reply({
          content: showAll
            ? '❌ **No Matches**: There are no matches in the history yet.'
            : '❌ **No Completed Matches**: There are no completed matches in the history yet.',
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
            // For 1v1 matches, convert winner ID to username if needed
            let displayWinner = match.winner;

            if (match.match_type === MatchType.ONE_VS_ONE && match.winner) {
              // If winner is player1, show team1 (player1's username)
              if (match.winner === match.player1_id) {
                displayWinner = match.team1;
              }
              // If winner is player2, show team2 (player2's username)
              else if (match.winner === match.player2_id) {
                displayWinner = match.team2;
              }
            }

            statusDisplay = `✅ Finished - Winner: **${displayWinner}**`;
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
🏆 **${showAll ? 'Recent' : 'Completed'} Matches** 🏆
*Last ${matches.length} ${showAll ? '' : 'completed '}matches:*

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
   * Provides comprehensive help information for all available commands including:
   * - Basic commands (balance, leaderboard, history)
   * - Fun commands (flip, random)
   * - Match betting commands (matches, bet)
   * - Event betting commands (events, bet)
   * - Admin commands (init, match create/result, event create/result)
   *
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
• \`/balance [user]\` - Check your or another user's PunaCoin balance
• \`/leaderboard [limit]\` - Show top users by balance
• \`/history [limit]\` - View your transaction history

🎮 **Fun Commands:**
• \`/flip\` - Flip a coin (heads or tails)
• \`/random [min] [max]\` - Generate a random number, default 1-100

🏆 **Match Betting:**
• \`/matches [limit] [show_all]\` - View matches (defaults to completed matches only)
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
   * Handle /flip command
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleFlipCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Log the command
    Logger.command(userId, username, '/flip');

    // Flip a coin (50/50 chance)
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    const emoji = result === 'Heads' ? '🪙' : '💿';

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(result === 'Heads' ? Colors.Gold : Colors.Blue)
      .setTitle('Coin Flip')
      .setDescription(`${emoji} The coin landed on **${result}**!`)
      .setFooter({ text: `Requested by ${username}` })
      .setTimestamp();

    // Create button for flipping again
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('flip_again')
        .setLabel('Flip Again')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄'),
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle /random command
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   */
  private async handleRandomCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Get the optional min and max values, defaulting to 1 and 100
    let min = interaction.options.getInteger('min') || 1;
    let max = interaction.options.getInteger('max') || 100;

    // Ensure min <= max
    if (min > max) {
      [min, max] = [max, min]; // Swap values if min > max
    }

    // Log the command
    Logger.command(userId, username, `/random min:${min} max:${max}`);

    // Generate random number between min and max (inclusive)
    const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Random Number Generator')
      .setDescription(`🎲 Random number (${min}-${max}): **${randomNumber}**`)
      .setFooter({ text: `Requested by ${username}` })
      .setTimestamp();

    // Create button for generating another number
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`random_again:${min}:${max}`)
        .setLabel('Generate Again')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄'),
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle flip again button click
   * @param {ButtonInteraction} interaction - Button interaction
   */
  private async handleFlipAgainButton(interaction: ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Log the interaction
    Logger.command(userId, username, '/flip (button)');

    // Flip a coin (50/50 chance)
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    const emoji = result === 'Heads' ? '🪙' : '💿';

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(result === 'Heads' ? Colors.Gold : Colors.Blue)
      .setTitle('Coin Flip')
      .setDescription(`${emoji} The coin landed on **${result}**!`)
      .setFooter({ text: `Requested by ${username}` })
      .setTimestamp();

    // Create button for flipping again
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('flip_again')
        .setLabel('Flip Again')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄'),
    );

    await interaction.update({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle random again button click
   * @param {ButtonInteraction} interaction - Button interaction
   * @param {string[]} params - Parameters from button [min, max]
   */
  private async handleRandomAgainButton(
    interaction: ButtonInteraction,
    params: string[],
  ): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Parse min and max from params
    let min = parseInt(params[0] || '1');
    let max = parseInt(params[1] || '100');

    // Ensure min <= max
    if (min > max) {
      [min, max] = [max, min]; // Swap values if min > max
    }

    // Log the interaction
    Logger.command(userId, username, `/random min:${min} max:${max} (button)`);

    // Generate random number between min and max (inclusive)
    const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Random Number Generator')
      .setDescription(`🎲 Random number (${min}-${max}): **${randomNumber}**`)
      .setFooter({ text: `Requested by ${username}` })
      .setTimestamp();

    // Create button for generating another number
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`random_again:${min}:${max}`)
        .setLabel('Generate Again')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄'),
    );

    await interaction.update({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle bet match button click
   * @param {ButtonInteraction} interaction - Button interaction
   * @param {string[]} params - Parameters from button [matchId, team]
   */
  private async handleBetMatchButton(
    interaction: ButtonInteraction,
    params: string[],
  ): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Extract parameters
    const matchId = parseInt(params[0]);
    const choice = params[1];

    // Log the interaction
    Logger.command(userId, username, `/bet_button match:${matchId} choice:${choice}`);

    // Get match data to verify it exists and is still in betting phase
    const match = this.matchManager.getMatch(matchId);
    if (!match) {
      await interaction.reply({
        content: `❌ Match #${matchId} not found.`,
        ephemeral: true,
      });
      return;
    }

    // Check if match is still accepting bets
    if (match.status !== 'pending') {
      await interaction.reply({
        content: '❌ Betting is closed! The match has already started.',
        ephemeral: true,
      });
      return;
    }

    // Check if user already placed a bet on this match
    if (betRepository.userHasBet(userId, matchId)) {
      await interaction.reply({
        content: '❌ You already placed a bet on this match.',
        ephemeral: true,
      });
      return;
    }

    // Get user balance
    const balance = this.balanceManager.getBalance(userId);

    // For 1v1 matches, convert player ID to username for display
    let displayChoice = choice;
    if (match.match_type === MatchType.ONE_VS_ONE) {
      if (choice === match.player1_id) {
        displayChoice = match.team1;
      } else if (choice === match.player2_id) {
        displayChoice = match.team2;
      }
    }

    // Display a form to enter bet amount
    const modal = new ModalBuilder()
      .setCustomId(`place_bet:${matchId}:${choice}`)
      .setTitle(`Place Bet on ${displayChoice}`);

    // Create a text input component for the amount
    const amountInput = new TextInputBuilder()
      .setCustomId('betAmount')
      .setLabel(`Enter amount (max ${balance} PunaCoins)`)
      .setPlaceholder('100')
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(10)
      .setRequired(true);

    // Add the amount input to an action row
    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);

    // Add the action row to the modal
    modal.addComponents(actionRow);

    // Show the modal to the user
    await interaction.showModal(modal);
  }

  /**
   * Handle bet event button click
   * @param {ButtonInteraction} interaction - Button interaction
   * @param {string[]} params - Parameters from button [eventId, outcome]
   */
  private async handleBetEventButton(
    interaction: ButtonInteraction,
    params: string[],
  ): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Extract parameters
    const eventId = parseInt(params[0]);
    const outcome = params[1]; // 'Yes' or 'No'

    // Log the interaction
    Logger.command(userId, username, `/bet_button event:${eventId} outcome:${outcome}`);

    // Get event data to verify it exists and is still in betting phase
    const event = this.eventManager.getEventInfo(eventId);
    if (!event) {
      await interaction.reply({
        content: `❌ Event #${eventId} not found.`,
        ephemeral: true,
      });
      return;
    }

    // Check if event is still accepting bets
    if (event.status !== 'pending') {
      await interaction.reply({
        content: '❌ Betting is closed! The event has already started.',
        ephemeral: true,
      });
      return;
    }

    // Check if user already placed a bet on this event
    const bets = this.eventManager.getEventBets(eventId);
    const userBet = bets.find(b => b.user_id === userId);
    if (userBet) {
      await interaction.reply({
        content: '❌ You already placed a bet on this event.',
        ephemeral: true,
      });
      return;
    }

    // Get user balance
    const balance = this.balanceManager.getBalance(userId);

    // Display a form to enter bet amount
    const modal = new ModalBuilder()
      .setCustomId(`place_bet:${eventId}:${outcome}`)
      .setTitle(`Place ${outcome} Bet on Event #${eventId}`);

    // Create a text input component for the amount
    const amountInput = new TextInputBuilder()
      .setCustomId('betAmount')
      .setLabel(`Enter amount (max ${balance} PunaCoins)`)
      .setPlaceholder('100')
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(10)
      .setRequired(true);

    // Add the amount input to an action row
    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);

    // Add the action row to the modal
    modal.addComponents(actionRow);

    // Show the modal to the user
    await interaction.showModal(modal);
  }

  /**
   * Handle show match bets button click
   * @param {ButtonInteraction} interaction - Button interaction
   * @param {string[]} params - Parameters from button [matchId]
   */
  private async handleShowMatchBetsButton(
    interaction: ButtonInteraction,
    params: string[],
  ): Promise<void> {
    const matchId = parseInt(params[0]);
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Log the interaction
    Logger.command(userId, username, `/show_bets match:${matchId} (button)`);

    // Get match data
    const match = this.matchManager.getMatch(matchId);
    if (!match) {
      await interaction.reply({
        content: `❌ Match #${matchId} not found.`,
        ephemeral: true,
      });
      return;
    }

    // Get bets for this match
    const bets = this.matchManager.getMatchBets(matchId);

    // Debug log to help diagnose the issue
    Logger.info('Bets', `Match ${matchId} has ${bets.length} bets: ${JSON.stringify(bets)}`);

    // For 1v1 matches, we need to map player IDs to usernames
    let team1Id = match.team1;
    let team2Id = match.team2;

    if (match.match_type === MatchType.ONE_VS_ONE) {
      team1Id = match.player1_id || match.team1;
      team2Id = match.player2_id || match.team2;
    }

    const team1Bets = bets.filter(b => b.team === team1Id);
    const team2Bets = bets.filter(b => b.team === team2Id);

    // Calculate totals
    const team1Total = team1Bets.reduce((sum, b) => sum + b.amount, 0);
    const team2Total = team2Bets.reduce((sum, b) => sum + b.amount, 0);
    const totalAmount = team1Total + team2Total;

    // Calculate percentages
    const team1Percent = totalAmount > 0 ? ((team1Total / totalAmount) * 100).toFixed(1) : '50.0';
    const team2Percent = totalAmount > 0 ? ((team2Total / totalAmount) * 100).toFixed(1) : '50.0';

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(
        match.status === 'done'
          ? Colors.Green
          : match.status === 'canceled'
            ? Colors.Red
            : Colors.Blue,
      )
      .setTitle(`Match #${match.id} Betting Summary`)
      .setDescription(`**${match.team1}** 🆚 **${match.team2}**`)
      .addFields(
        {
          name: 'Status',
          value: match.status.charAt(0).toUpperCase() + match.status.slice(1),
          inline: true,
        },
        {
          name: 'Match Type',
          value: match.match_type === 'team' ? 'Team Match' : '1v1 Match',
          inline: true,
        },
        { name: 'Total Bets', value: `${bets.length} (${totalAmount} PunaCoins)`, inline: true },
        {
          name: `${match.team1}`,
          value: `${team1Bets.length} bets • ${team1Total} PunaCoins (${team1Percent}%)`,
          inline: true,
        },
        {
          name: `${match.team2}`,
          value: `${team2Bets.length} bets • ${team2Total} PunaCoins (${team2Percent}%)`,
          inline: true,
        },
      )
      .setFooter({
        text: `Match created at ${new Date(match.created_at as string).toLocaleString()}`,
      })
      .setTimestamp();

    // Add winner if match is done
    if (match.status === 'done' && match.winner) {
      // For 1v1 matches, we need to show the username instead of the user ID
      let displayWinner = match.winner;
      if (match.match_type === MatchType.ONE_VS_ONE) {
        // If winner is player1, show their username
        if (match.winner === match.player1_id) {
          displayWinner = match.team1;
        }
        // If winner is player2, show their username
        else if (match.winner === match.player2_id) {
          displayWinner = match.team2;
        }
      }

      embed.addFields({ name: 'Winner', value: `${displayWinner} 🏆`, inline: false });
    }

    // Add a field showing the individual bets if there are any
    if (bets.length > 0) {
      // Sort bets by amount (descending)
      const sortedBets = [...bets].sort((a, b) => b.amount - a.amount);

      // Format the bets list, showing up to 10 bets
      const betsList = sortedBets
        .slice(0, 10)
        .map(bet => {
          const betTeam = bet.team === team1Id ? match.team1 : match.team2;
          return `<@${bet.user_id}>: **${bet.amount}** PunaCoins on **${betTeam}**`;
        })
        .join('\n');

      embed.addFields({
        name: 'Recent Bets',
        value: betsList,
        inline: false,
      });
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });
  }

  /**
   * Handle show event bets button click
   * @param {ButtonInteraction} interaction - Button interaction
   * @param {string[]} params - Parameters from button [eventId]
   */
  private async handleShowEventBetsButton(
    interaction: ButtonInteraction,
    params: string[],
  ): Promise<void> {
    const eventId = parseInt(params[0]);
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Log the interaction
    Logger.command(userId, username, `/show_bets event:${eventId} (button)`);

    // Get event data
    const event = this.eventManager.getEventInfo(eventId);
    if (!event) {
      await interaction.reply({
        content: `❌ Event #${eventId} not found.`,
        ephemeral: true,
      });
      return;
    }

    // Get bets for this event
    const bets = this.eventManager.getEventBets(eventId);

    // Debug log to help diagnose the issue
    Logger.info('Bets', `Event ${eventId} has ${bets.length} bets: ${JSON.stringify(bets)}`);

    const yesBets = bets.filter(b => b.outcome === true);
    const noBets = bets.filter(b => b.outcome === false);

    // Calculate totals
    const yesTotal = yesBets.reduce((sum, b) => sum + b.amount, 0);
    const noTotal = noBets.reduce((sum, b) => sum + b.amount, 0);
    const totalAmount = yesTotal + noTotal;

    // Calculate percentages
    const yesPercent = totalAmount > 0 ? ((yesTotal / totalAmount) * 100).toFixed(1) : '50.0';
    const noPercent = totalAmount > 0 ? ((noTotal / totalAmount) * 100).toFixed(1) : '50.0';

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(
        event.status === 'done'
          ? Colors.Green
          : event.status === 'canceled'
            ? Colors.Red
            : Colors.Purple,
      )
      .setTitle(`Event #${event.id} Betting Summary`)
      .setDescription(`**${event.title}**${event.description ? `\n*${event.description}*` : ''}`)
      .addFields(
        {
          name: 'Status',
          value: event.status.charAt(0).toUpperCase() + event.status.slice(1),
          inline: true,
        },
        { name: 'Total Bets', value: `${bets.length} (${totalAmount} PunaCoins)`, inline: true },
        { name: '\u200B', value: '\u200B', inline: true }, // Empty field for alignment
        {
          name: 'YES',
          value: `${yesBets.length} bets • ${yesTotal} PunaCoins (${yesPercent}%)`,
          inline: true,
        },
        {
          name: 'NO',
          value: `${noBets.length} bets • ${noTotal} PunaCoins (${noPercent}%)`,
          inline: true,
        },
      )
      .setFooter({
        text: `Event created at ${new Date(event.created_at as string).toLocaleString()}`,
      })
      .setTimestamp();

    // Add outcome if event is done
    if (event.status === 'done' && event.success !== undefined) {
      embed.addFields({
        name: 'Outcome',
        value: event.success ? '✅ **YES**' : '❌ **NO**',
        inline: false,
      });
    }

    // Add a field showing the individual bets if there are any
    if (bets.length > 0) {
      // Sort bets by amount (descending)
      const sortedBets = [...bets].sort((a, b) => b.amount - a.amount);

      // Format the bets list, showing up to 10 bets
      const betsList = sortedBets
        .slice(0, 10)
        .map(bet => {
          return `<@${bet.user_id}>: **${bet.amount}** PunaCoins on **${
            bet.outcome ? 'YES' : 'NO'
          }**`;
        })
        .join('\n');

      embed.addFields({
        name: 'Recent Bets',
        value: betsList,
        inline: false,
      });
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });
  }

  /**
   * Handle modal submission for placing a bet
   * @param {ModalSubmitInteraction} interaction - Modal submit interaction
   * @param {string[]} params - Parameters from modal [id, choice/outcome]
   */
  private async handlePlaceBetModalSubmit(
    interaction: ModalSubmitInteraction,
    params: string[],
  ): Promise<void> {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Extract parameters
    const id = parseInt(params[0]);
    const choice = params[1];

    // Get the bet amount from the form
    const amountStr = interaction.fields.getTextInputValue('betAmount');
    const amount = parseInt(amountStr);

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      await interaction.reply({
        content: '❌ Please enter a valid positive number for the bet amount.',
        ephemeral: true,
      });
      return;
    }

    // Check that amount is at least 10
    if (amount < 10) {
      await interaction.reply({
        content: '❌ Minimum bet amount is 10 PunaCoins.',
        ephemeral: true,
      });
      return;
    }

    // Log the command
    Logger.command(userId, username, `/bet ${id} ${choice} ${amount} (via modal)`);

    // Check if id is for a match
    const match = this.matchManager.getMatch(id);
    if (match) {
      // Place bet on match
      const result = this.matchManager.placeBetOnMatch(userId, username, id, choice, amount);

      if (result.success) {
        // For 1v1 matches, format the choice to show username instead of ID
        let displayChoice = choice;
        if (match.match_type === MatchType.ONE_VS_ONE) {
          // If the bet is on player1, show their username
          if (choice === match.player1_id) {
            displayChoice = match.team1;
          }
          // If the bet is on player2, show their username
          else if (choice === match.player2_id) {
            displayChoice = match.team2;
          }
        }

        // Create embed for successful bet
        const successEmbed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle('✅ Bet Placed Successfully!')
          .setDescription(`Your bet has been placed on match #${id}`)
          .addFields(
            { name: 'Match', value: `**${match.team1}** vs **${match.team2}**`, inline: false },
            { name: 'Your Choice', value: `**${displayChoice}**`, inline: true },
            { name: 'Amount', value: `**${amount}** PunaCoins`, inline: true },
            { name: 'Status', value: result.message, inline: false },
          )
          .setFooter({
            text: `Your current balance: ${this.balanceManager.getBalance(userId)} PunaCoins`,
          })
          .setTimestamp();

        // Add button to see all bets
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`show_match_bets:${id}`)
            .setLabel('See All Bets')
            .setStyle(ButtonStyle.Primary),
        );

        // Send confirmation to user
        await interaction.reply({
          embeds: [successEmbed],
          components: [row],
          ephemeral: true,
        });

        // Create announcement embed for the channel
        displayChoice = choice;
        if (match.match_type === MatchType.ONE_VS_ONE) {
          // If the bet is on player1, show their username
          if (choice === match.player1_id) {
            displayChoice = match.team1;
          }
          // If the bet is on player2, show their username
          else if (choice === match.player2_id) {
            displayChoice = match.team2;
          }
        }

        const announcementEmbed = new EmbedBuilder()
          .setColor(Colors.Gold)
          .setTitle('💰 New Bet Placed!')
          .setDescription(`<@${userId}> has placed a bet on match #${id}`)
          .addFields(
            { name: 'Match', value: `**${match.team1}** vs **${match.team2}**`, inline: false },
            { name: 'Choice', value: `**${displayChoice}**`, inline: true },
            { name: 'Amount', value: `**${amount}** PunaCoins`, inline: true },
          )
          .setFooter({ text: `Match ID: ${id}` })
          .setTimestamp();

        // Announce the bet to the channel
        try {
          await interaction.followUp({
            embeds: [announcementEmbed],
            ephemeral: false,
          });
        } catch (err) {
          Logger.error('Bet', `Failed to announce bet: ${err}`);
        }
      } else {
        // Create embed for failed bet
        const errorEmbed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setTitle('❌ Bet Failed')
          .setDescription(`Unable to place bet on match #${id}`)
          .addFields(
            { name: 'Error', value: result.message, inline: false },
            { name: 'Match', value: `**${match.team1}** vs **${match.team2}**`, inline: false },
            {
              name: 'Current Balance',
              value: `**${this.balanceManager.getBalance(userId)}** PunaCoins`,
              inline: true,
            },
          )
          .setFooter({ text: 'Try again with a different amount or match' })
          .setTimestamp();

        await interaction.reply({
          embeds: [errorEmbed],
          ephemeral: true,
        });
      }
    } else {
      // Match not found
      await interaction.reply({
        content: `❌ Match #${id} not found.`,
        ephemeral: true,
      });
    }
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
