const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });

const BALANCE_PATH = path.join(__dirname, 'data', 'balances.json');
const MATCH_PATH = path.join(__dirname, 'data', 'match.json');

const START_BALANCE = 1000;

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
    if (!msg.content.startsWith('!')) return;
    console.log(msg.content,'msg')

  const [command, ...args] = msg.content.slice(1).split(/\s+/);
  const userId = msg.author.id;

  // BALANCE
  if (command === 'balance') {
    const balances = loadJson(BALANCE_PATH);
    const balance = balances[userId] ?? START_BALANCE;
    msg.reply(`Your balance: $${balance} punaBacs`);
  }

  else if (command === 'init') {
    if (!msg.member.permissions.has('Administrator')) {
      return msg.reply('Только администратор может использовать эту команду.');
    }

    const balances = loadJson(BALANCE_PATH);
    const guild = msg.guild;
// console.log(await guild.members.list(),'guild')

    guild.members.fetch().then(members => {
        console.log(members,'members')
      let added = 0;
      members.forEach(member => {
        if (!member.user.bot && balances[member.id] === undefined) {
          balances[member.id] = START_BALANCE;
          added++;
        }
      });
      saveJson(BALANCE_PATH, balances);
      msg.channel.send(`Баланс выдан ${added} участникам.`);
    }).catch(err => {
      console.error(err);
      msg.reply('Ошибка при получении участников.');
    });
  }

  // CREATE MATCH
  else if (command === 'match' && args[0] === 'create') {
    const match = loadJson(MATCH_PATH);
    if (match.status === 'pending') {
      msg.reply('A match is already active!');
      return;
    }
    const [team1, team2] = [args[1], args[2]];
    if (!team1 || !team2) return msg.reply('Usage: !match create Team1 Team2');
    saveJson(MATCH_PATH, {
      status: 'pending',
      team1,
      team2,
      bets: []
    });
    msg.channel.send(`Match created: ${team1} vs ${team2}`);
  }

  // PLACE BET
  else if (command === 'bet') {
    const match = loadJson(MATCH_PATH);
    if (match.status !== 'pending') return msg.reply('No active match to bet on!');
    const [team, amountStr] = args;
    const amount = parseInt(amountStr);
    if (![match.team1, match.team2].includes(team)) return msg.reply('Invalid team name!');
    if (isNaN(amount) || amount <= 0) return msg.reply('Invalid bet amount!');

    const balances = loadJson(BALANCE_PATH);
    balances[userId] = balances[userId] ?? START_BALANCE;

    if (balances[userId] < amount) return msg.reply('Not enough balance!');

    if (match.bets.find(b => b.userId === userId)) return msg.reply('You already placed a bet.');

    match.bets.push({ userId, team, amount });
    balances[userId] -= amount;

    saveJson(MATCH_PATH, match);
    saveJson(BALANCE_PATH, balances);
    msg.reply(`Bet of $${amount} on ${team} accepted.`);
  }

  // CANCEL MATCH
  else if (command === 'match' && args[0] === 'cancel') {
    const match = loadJson(MATCH_PATH);
    if (match.status !== 'pending') return msg.reply('No match to cancel.');
    const balances = loadJson(BALANCE_PATH);
    match.bets.forEach(b => {
      balances[b.userId] += b.amount;
    });
    match.status = 'canceled';
    saveJson(BALANCE_PATH, balances);
    saveJson(MATCH_PATH, match);
    msg.channel.send('Match canceled. Bets refunded.');
  }

  // MATCH RESULT
  else if (command === 'match' && args[0] === 'result') {
    const match = loadJson(MATCH_PATH);
    if (match.status !== 'pending') return msg.reply('No active match to finish.');
    const winner = args[1];
    if (![match.team1, match.team2].includes(winner)) return msg.reply('Invalid winner team.');

    const balances = loadJson(BALANCE_PATH);
    const winners = match.bets.filter(b => b.team === winner);
    winners.forEach(b => {
      const payout = b.amount * 2; // Fixed 2x payout
      balances[b.userId] = (balances[b.userId] ?? START_BALANCE) + payout;
    });

    match.status = 'done';
    match.winner = winner;
    saveJson(BALANCE_PATH, balances);
    saveJson(MATCH_PATH, match);

    msg.channel.send(`Match finished. ${winner} won! Bets paid out.`);
  }

  // LEADERBOARD
  else if (command === 'leaderboard') {
    const balances = loadJson(BALANCE_PATH);
    const sorted = Object.entries(balances)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const leaderboard = sorted.map(([uid, bal], i) => `${i + 1}. <@${uid}> — $${bal}`).join('\n');
    msg.channel.send(`🏆 Leaderboard:\n${leaderboard}`);
  }
});

client.login(process.env.DISCORD_TOKEN);