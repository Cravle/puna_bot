const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const userRepository = require('../database/repositories/UserRepository');
const transactionRepository = require('../database/repositories/TransactionRepository');

/**
 * Script to sync all Discord users to the database
 * Will add new users and update existing ones
 */
async function syncAllUsers() {
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
    await client.login(process.env.DISCORD_TOKEN);
    
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
              name: displayName
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
        console.error(`Error fetching members from guild ${guild.name}: ${err.message}`);
      }
    }
    
    console.log(`
Synchronization complete!
Total users processed: ${totalUsers}
Existing users updated: ${updatedUsers}
New users added: ${addedUsers}
    `);
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
  syncAllUsers()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { syncAllUsers }; 