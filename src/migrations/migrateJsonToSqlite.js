const fs = require('fs');
const path = require('path');

// Import repositories and database
const db = require('../database/Database');
const userRepository = require('../database/repositories/UserRepository');
const matchRepository = require('../database/repositories/MatchRepository');
const betRepository = require('../database/repositories/BetRepository');
const transactionRepository = require('../database/repositories/TransactionRepository');

// Paths to JSON files
const balancesPath = path.join(__dirname, '..', '..', 'data', 'balances.json');
const matchPath = path.join(__dirname, '..', '..', 'data', 'match.json');

/**
 * Migrate balances from JSON to SQLite
 */
function migrateBalances() {
  if (!fs.existsSync(balancesPath)) {
    console.log('Balances file not found, skipping migration');
    return 0;
  }
  
  const balancesData = JSON.parse(fs.readFileSync(balancesPath, 'utf8'));
  let migratedCount = 0;
  
  console.log(`Migrating ${Object.keys(balancesData).length} user balances...`);
  
  for (const [userId, balance] of Object.entries(balancesData)) {
    // Create user with balance
    userRepository.createOrUpdate({
      id: userId,
      name: 'Unknown User', // We don't have usernames in the JSON data
      balance
    });
    
    // Create initial transaction for the balance
    transactionRepository.createInitialTransaction(userId, balance);
    
    migratedCount++;
  }
  
  console.log(`Migrated ${migratedCount} user balances successfully`);
  return migratedCount;
}

/**
 * Migrate match and bets from JSON to SQLite
 */
function migrateMatch() {
  if (!fs.existsSync(matchPath)) {
    console.log('Match file not found, skipping migration');
    return 0;
  }
  
  const matchData = JSON.parse(fs.readFileSync(matchPath, 'utf8'));
  
  // Skip if no match data or match is not in a valid state
  if (!matchData || !matchData.team1 || !matchData.team2) {
    console.log('No valid match data found, skipping match migration');
    return 0;
  }
  
  console.log(`Migrating match: ${matchData.team1} vs ${matchData.team2}`);
  
  // Create match in database
  const match = matchRepository.create({
    team1: matchData.team1,
    team2: matchData.team2,
    status: matchData.status || 'none'
  });
  
  // Set winner if match is done
  if (matchData.status === 'done' && matchData.winner) {
    matchRepository.setWinner(match.id, matchData.winner);
  }
  
  // Migrate bets if there are any
  if (Array.isArray(matchData.bets) && matchData.bets.length > 0) {
    console.log(`Migrating ${matchData.bets.length} bets...`);
    
    for (const bet of matchData.bets) {
      // Determine bet result based on match status and winner
      let betResult = 'pending';
      if (matchData.status === 'done' && matchData.winner) {
        betResult = bet.team === matchData.winner ? 'win' : 'loss';
      } else if (matchData.status === 'canceled') {
        betResult = 'refund';
      }
      
      // Create bet in database with result
      const stmt = db.getConnection().prepare(`
        INSERT INTO bets (user_id, match_id, team, amount, result)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *
      `);
      
      const createdBet = stmt.get(bet.userId, match.id, bet.team, bet.amount, betResult);
      
      // Create transaction for the bet
      transactionRepository.createBetTransaction(bet.userId, bet.amount, createdBet.id);
      
      // If this was a winning bet and match is done, also create a payout transaction
      if (betResult === 'win') {
        const payout = bet.amount * 2; // Fixed 2x payout
        transactionRepository.createPayoutTransaction(bet.userId, payout, createdBet.id);
      }
      
      // If match was canceled, create a refund transaction
      if (betResult === 'refund') {
        transactionRepository.createRefundTransaction(bet.userId, bet.amount, createdBet.id);
      }
    }
    
    console.log(`Migrated ${matchData.bets.length} bets successfully`);
  }
  
  return 1;
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('Starting migration from JSON to SQLite...');
  
  try {
    // Migrate user balances
    const balancesCount = migrateBalances();
    
    // Migrate match and bets
    const matchCount = migrateMatch();
    
    console.log('Migration completed successfully!');
    console.log(`Summary: Migrated ${balancesCount} users and ${matchCount} matches`);
    
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate().then(() => {
    console.log('Migration script finished. Exiting...');
    process.exit(0);
  });
}

module.exports = { migrate }; 