const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const userRepository = require('../database/repositories/UserRepository');

/**
 * Script to fetch Discord users and update their names in the database
 */
async function updateUserNames() {
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
    await client.login(process.env.DISCORD_TOKEN);
    
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
              name: displayName
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
        console.error(`Error fetching members from guild ${guild.name}: ${err.message}`);
      }
    }
    
    console.log(`Update complete! Processed ${totalUsers} users, updated ${updatedUsers} in database.`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Always destroy the client when done
    client.destroy();
    console.log('Discord client disconnected.');
  }
}

// Run immediately if called directly
if (require.main === module) {
  updateUserNames()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { updateUserNames }; 