import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

import userRepository from '../database/repositories/UserRepository.js';

/**
 * Script to fetch Discord users and update their names in the database
 */
async function updateUserNames(): Promise<void> {
  console.log('Starting user name update process...');
  
  // Create Discord client
  const client = new Client({ 
    intents: [
      GatewayIntentBits.Guilds, 
      GatewayIntentBits.GuildMembers
    ] 
  });
  
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
            // Update the name
            userRepository.createOrUpdate({
              id: memberId,
              name: displayName,
              balance: 0 // This field is required but will be ignored in the update
            });
            updatedUsers++;
            
            if (updatedUsers % 10 === 0) {
              console.log(`Updated ${updatedUsers} users so far...`);
            }
          } else {
            console.log(`User ${displayName} (${memberId}) not found in database, skipping.`);
          }
        }
      } catch (err) {
        console.error(`Error fetching members from guild ${guild.name}: ${(err as Error).message}`);
      }
    }
    
    console.log(`Update complete! Processed ${totalUsers} users, updated ${updatedUsers} in database.`);
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
  updateUserNames()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { updateUserNames }; 