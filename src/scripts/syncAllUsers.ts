import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

import userRepository from '../database/repositories/UserRepository.js';
import transactionRepository from '../database/repositories/TransactionRepository.js';

/**
 * Script to sync all Discord users to the database
 * Will add new users and update existing ones
 */
async function syncAllUsers(): Promise<void> {
  console.log('Starting user synchronization process...');
  
  // Create Discord client
  const client = new Client({ 
    intents: [
      GatewayIntentBits.Guilds, 
      GatewayIntentBits.GuildMembers
    ] 
  });
  
  const START_BALANCE = 1000;
  
  try {
    // Login to Discord
    console.log('Logging in to Discord...');
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_TOKEN not found in environment variables');
    }
    await client.login(token);
    
    // Once logged in, fetch users from all guilds
    console.log('Fetching users from Discord servers...');
    
    let totalUsers = 0;
    let updatedUsers = 0;
    let addedUsers = 0;
    
    // Process each guild the bot is in
    for (const guild of client.guilds.cache.values()) {
      console.log(`Fetching members from guild: ${guild.name} (${guild.id})`);
      
      try {
        // Fetch all members for this guild
        const members = await guild.members.fetch();
        console.log(`Found ${members.size} members in ${guild.name}`);
        
        // Process each member
        for (const [memberId, member] of members) {
          totalUsers++;
          
          // Skip bots
          if (member.user.bot) continue;
          
          // Get user's display name
          const displayName = member.displayName || member.user.username;
          
          // Check if user exists in database
          if (userRepository.exists(memberId)) {
            // Update existing user
            userRepository.createOrUpdate({
              id: memberId,
              name: displayName,
              balance: 0 // This field is required but will be ignored in the update
            });
            updatedUsers++;
          } else {
            // Add new user
            console.log(`Adding new user: ${displayName} (${memberId})`);
            
            // Create user with initial balance
            userRepository.createOrUpdate({
              id: memberId,
              name: displayName,
              balance: START_BALANCE
            });
            
            // Create initial transaction
            transactionRepository.createInitialTransaction(memberId, START_BALANCE);
            
            addedUsers++;
          }
          
          if ((updatedUsers + addedUsers) % 10 === 0) {
            console.log(`Processed ${updatedUsers + addedUsers} users so far...`);
          }
        }
      } catch (err) {
        console.error(`Error fetching members from guild ${guild.name}: ${(err as Error).message}`);
      }
    }
    
    console.log(`
Synchronization complete!
Total users processed: ${totalUsers}
Existing users updated: ${updatedUsers}
New users added: ${addedUsers}
    `);
  } catch (error) {
    console.error('Error:', (error as Error).message);
  } finally {
    // Always destroy the client when done
    client.destroy();
    console.log('Discord client disconnected.');
  }
}

// Run immediately if called directly
if (import.meta.url === new URL(import.meta.url).href) {
  syncAllUsers()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { syncAllUsers }; 