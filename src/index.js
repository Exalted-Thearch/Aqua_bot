require("dotenv").config();
const stringSimilarity = require("string-similarity");
const { GoogleGenerativeAI } = require("@google/generative-ai");
// const {
//   initDb,
//   getUserProfile,
//   updateUserProfile,
//   currentBalance,
//   deleteUser,
//   db,
// } = require("./db");
// const { coinFlip, nexus_coin } = require("./coinflip.js");
// const { formatCurrency, formatChange } = require("./utils.js");
// const {
//   spinRoulette,
//   rouletteWheel,
//   payoutMultipliers,
//   getRouletteSpinResult,
// } = require("./roulettegame.js");
// const {
//   createDeck,
//   drawCard,
//   calculateHandValue,
//   getHandDisplay,
//   getCardDisplay,
// } = require("./blackjackgame.js");
const {
  Client,
  ActivityType,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Routes,
  // GuildMember,
  // Role
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const axios = require("axios");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

const cooldowns = new Map();
// --- DATABASE SETUP ---
let db;
async function initDB() {
  db = await open({
    filename: "./roles.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
        CREATE TABLE IF NOT EXISTS user_roles (
            user_id TEXT PRIMARY KEY,
            role_id TEXT,
            is_temp INTEGER DEFAULT 0,
            expiry_date INTEGER
        )
    `);
}
client.commands = new Collection();
const prefix = "!";
let forumPostsCache = [];
let lastCacheUpdate = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

function simpleSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  const commonWords = words1.filter((word) => words2.includes(word));

  return commonWords.length / Math.max(words1.length, words2.length);
}

async function fetchAllForumPosts(guild) {
  const now = Date.now();

  // Return cached data if it's still fresh
  if (forumPostsCache.length > 0 && now - lastCacheUpdate < CACHE_DURATION) {
    console.log("Using cached forum posts");
    return forumPostsCache;
  }

  console.log("Fetching fresh forum posts...");
  const channels = await guild.channels.fetch();
  let allForumPosts = [];

  const forumChannels = channels.filter((channel) => channel.type === 15);

  // Fetch all forum posts in parallel
  await Promise.all(
    forumChannels.map(async (channel) => {
      try {
        const [activeThreads, archivedThreads] = await Promise.all([
          channel.threads.fetchActive(),
          channel.threads.fetchArchived({ limit: 100 }),
        ]);

        const posts = [
          ...activeThreads.threads.values(),
          ...archivedThreads.threads.values(),
        ];

        // Store parent info with each post to avoid fetching later
        posts.forEach((post) => {
          post.parentName = channel.name;
        });

        allForumPosts = allForumPosts.concat(posts);
      } catch (err) {
        console.log(`Could not fetch posts from forum ${channel.name}`);
      }
    })
  );

  forumPostsCache = allForumPosts;
  lastCacheUpdate = now;

  console.log(`Cached ${allForumPosts.length} forum posts`);
  return allForumPosts;
}
// const activeRouletteGames = {}; // Stores active roulette games by channel ID
// const activeBlackjackGames = {};
// const ROULETTE_BETTING_TIME_MS = 30 * 1000; // 30 seconds in milliseconds
// const ROULETTE_COOLDOWN_TIME_MS = 5 * 1000; // 5 seconds cooldown for placing bets

// const userCooldowns = new Map();

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// function getBlackjackEmbed(
//   game,
//   playerDiscordUser,
//   showDealerCards = false,
//   statusMessage = "",
//   gameIsOver = false
// ) {
//   const playerHandValue = calculateHandValue(game.playerHand);
//   const dealerHandValue = calculateHandValue(game.dealerHand);

//   // Get card displays
//   const playerHandDisplay = getHandDisplay(game.playerHand);
//   let dealerHandDisplay;
//   let dealerDisplayValue;

//   if (showDealerCards) {
//     dealerHandDisplay = getHandDisplay(game.dealerHand);
//     dealerDisplayValue = dealerHandValue.value;
//   } else {
//     // Use your custom backside emoji for the hidden card
//     dealerHandDisplay = `${getCardDisplay(
//       game.dealerHand[0]
//     )} <:BackSide:1398023017396699226>`;
//     dealerDisplayValue = `${
//       calculateHandValue([game.dealerHand[0]]).value
//     } + ?`;
//   }

//   let description;
//   if (gameIsOver || playerHandValue.value > 21) {
//     description = statusMessage ? `${statusMessage}\n\n` : "";
//   } else {
//     description =
//       (statusMessage ? `**${statusMessage}**\n\n` : "") + // Part 1
//       (gameIsOver // Part 2: action list
//         ? ""
//         : "**Hit -** Take another card\n" +
//           "**Stand -** End your turn\n" +
//           (game.playerHand.length === 2
//             ? "**Double Down -** Double your bet, hit once, then stand\n"
//             : ""));
//   }

//   // Ensure description is never empty (Discord requires at least 1 character)
//   if (!description || description.trim() === "") {
//     description = "Game in progress...";
//   }
//   const embed = new EmbedBuilder()
//     .setColor(0x34a8eb) // Green for active game (you can choose colors for different states later)
//     .setAuthor({
//       name: playerDiscordUser.username,
//       iconURL: playerDiscordUser.displayAvatarURL(),
//     })
//     .setDescription(description)
//     .addFields(
//       // --- Row 1: Hands (Inline) ---
//       {
//         name: "Your Hand",
//         value: `${playerHandDisplay}\n\nValue: ${playerHandValue.value.toLocaleString()}`,
//         inline: true,
//       },
//       {
//         name: "Dealer Hand",
//         value: `${dealerHandDisplay}\n\nValue: ${dealerDisplayValue.toLocaleString()}`,
//         inline: true,
//       },

//       // --- Row 2: Game Info (Inline where suitable) ---
//       {
//         name: "Cards Remaining:",
//         value: game.deck.length.toLocaleString(),
//         inline: false,
//       }
//     )
//     .setTimestamp();

//   const row = new ActionRowBuilder();

//   row.addComponents(
//     new ButtonBuilder()
//       .setCustomId("blackjack_hit")
//       .setLabel("Hit")
//       .setStyle(ButtonStyle.Primary)
//       .setDisabled(gameIsOver || !game.playerTurn), // Disable if game is over or not player's turn

//     new ButtonBuilder()
//       .setCustomId("blackjack_stand")
//       .setLabel("Stand")
//       .setStyle(ButtonStyle.Success)
//       .setDisabled(gameIsOver || !game.playerTurn), // Disable if game is over or not player's turn

//     new ButtonBuilder()
//       .setCustomId("blackjack_doubledown")
//       .setLabel("Double Down")
//       .setStyle(ButtonStyle.Secondary)
//       // Disable if game is over, not player's turn, or not initial deal (hand length != 2)
//       .setDisabled(
//         gameIsOver || !game.playerTurn || game.playerHand.length !== 2
//       )
//   );

//   // Attach the row of buttons to the embed message.
//   // The message.send/edit call will pass this component.
//   embed.components = [row]; // This sets the components on the embed directly for later use in message.send/edit

//   return embed;
// }
// async function handleBlackjackPayout(
//   userId,
//   winner,
//   betAmount,
//   gameMessage,
//   statusMessage = ""
// ) {
//   const game = activeBlackjackGames[userId] || {};
//   const playerHandValue = calculateHandValue(game.playerHand || []);

//   let netChange = 0;
//   let outcomeText = "";

//   if (winner === "player") {
//     if (playerHandValue.isBlackjack) {
//       netChange = betAmount * 1.5; // Profit part of 3:2 payout
//       outcomeText = "Blackjack!";
//     } else {
//       netChange = betAmount * 1; // 1:1 payout (1 profit)
//       outcomeText = "Win!";
//     }
//     await updateUserProfile(userId, netChange + betAmount); // Add profit PLUS original bet back
//   } else if (winner === "push") {
//     netChange = 0;
//     outcomeText = "Push!";
//     await updateUserProfile(userId, betAmount); // Return original bet
//   } else {
//     // Dealer wins (player loses)
//     netChange = -betAmount;
//     outcomeText = "Loss!"; // General loss. Specific statusMessage from hit/stand will describe "Bust!"
//   }

//   const newBalance = await getUserProfile(userId);

//   // Build the result line (e.g., "Result: Bust 💰 -500")
//   let resultLine = `Result: **${outcomeText}** ${nexus_coin} **${formatChange(
//     netChange
//   )}**`;

//   // --- CRITICAL FIX START: Re-create the final embed using getBlackjackEmbed with revealed cards ---
//   // 1. Get a base embed that shows ALL cards (dealer revealed) and is marked as game over
//   const baseFinalGameEmbed = getBlackjackEmbed(
//     game,
//     await client.users.fetch(userId),
//     true,
//     statusMessage, // Use the passed statusMessage
//     true
//   );

//   // 2. Now, take this base embed and add the specific resultLine to its description, and update the footer/color.
//   const finalGameEmbed = EmbedBuilder.from(baseFinalGameEmbed)
//     .setColor(
//       winner === "player" ? 0x00ff00 : winner === "dealer" ? 0xff0000 : 0xffff00
//     ) // Set final color
//     // Combine description from baseFinalGameEmbed (which had the basic actions/status) with resultLine
//     .setDescription(`${statusMessage}\n\n${resultLine}`)
//     .setFooter({
//       text: `Blackjack! Game Over.`,
//     })
//     .setTimestamp();

//   // Fields are already correctly set by baseFinalGameEmbed.addFields, no need to copy currentEmbed.fields
//   // --- CRITICAL FIX END ---

//   await gameMessage.edit({
//     embeds: [finalGameEmbed],
//     components: [], // Clear components as game is over
//   });
// }
// async function playDealersTurnAndDetermineWinner(
//   userId,
//   game,
//   playerDiscordUser,
//   gameMessage,
//   initialStatusMessage = ""
// ) {
//   let dealerHandValue = calculateHandValue(game.dealerHand);
//   let statusMessage = initialStatusMessage; // FIXED: Initialize statusMessage properly
//   let dealerActions = [];

//   // 1. Reveal dealer's hidden card
//   statusMessage += `Dealer reveals their hand.\n`;
//   const revealEmbed = getBlackjackEmbed(
//     game,
//     playerDiscordUser,
//     true,
//     statusMessage,
//     false
//   );
//   await gameMessage.edit({
//     embeds: [revealEmbed.embed], // FIXED: Access .embed property
//     components: revealEmbed.components,
//   });
//   await new Promise((resolve) => setTimeout(resolve, 1000));

//   // 2. Dealer hits until 17 or more - collect all actions first
//   while (dealerHandValue.value < 17) {
//     const newCard = drawCard(game.deck);
//     game.dealerHand.push(newCard);
//     dealerHandValue = calculateHandValue(game.dealerHand);

//     // FIXED: Collect actions inside the loop
//     dealerActions.push(
//       `Dealer hits and draws ${getCardDisplay(
//         newCard
//       )}. Dealer's hand is now ${dealerHandValue.value.toLocaleString()}.`
//     );
//   }

//   // 3. Add dealer actions to status message
//   if (dealerActions.length > 0) {
//     statusMessage += dealerActions.join("\n") + "\n";
//     statusMessage += `Dealer's final hand is ${dealerHandValue.value.toLocaleString()}.\n`;
//   } else {
//     statusMessage += "Dealer stands.\n";
//   }

//   // 4. Determine winner and add outcome
//   const finalPlayerHandValue = calculateHandValue(game.playerHand);
//   let finalWinner;

//   if (dealerHandValue.value > 21) {
//     statusMessage += "Dealer busted! You win!";
//     finalWinner = "player";
//   } else if (finalPlayerHandValue.value > dealerHandValue.value) {
//     statusMessage += "You win! Your hand is higher.";
//     finalWinner = "player";
//   } else if (dealerHandValue.value > finalPlayerHandValue.value) {
//     statusMessage += "Dealer wins! Dealer's hand is higher.";
//     finalWinner = "dealer";
//   } else {
//     statusMessage += "It's a push!";
//     finalWinner = "push";
//   }

//   // 5. Final embed update
//   game.dealerHandValue = calculateHandValue(game.dealerHand);

//   const finalEmbedData = getBlackjackEmbed(
//     game,
//     playerDiscordUser,
//     true,
//     statusMessage,
//     true
//   );
//   await gameMessage.edit({
//     embeds: [finalEmbedData.embed],
//     components: finalEmbedData.components,
//   });

//   // Handle payout and clear game state
//   await handleBlackjackPayout(
//     userId,
//     finalWinner,
//     game.betAmount,
//     gameMessage,
//     statusMessage
//   );
//   delete activeBlackjackGames[userId];
// }
// async function revealRouletteResult(channelId) {
//   const game = activeRouletteGames[channelId];
//   if (!game) return;

//   const channel = client.channels.cache.get(channelId);
//   if (!channel) {
//     console.error(
//       `Could not find channel ${channelId} to reveal roulette result.`
//     );
//     delete activeRouletteGames[channelId];
//     return;
//   }
//   const allBets = game.bets;
//   const spinResult = getRouletteSpinResult(); // Call the new function
//   const winningNumber = spinResult.winningNumber;
//   const winningColor = spinResult.winningColor;
//   const winningSlot = spinResult.winningSlot;

//   let winnersList = [];
//   let losersList = [];
//   let totalWon = 0;
//   let totalLost = 0;

//   for (const bet of allBets) {
//     let userWonThisBet = false;
//     let winMultiplier = 0;

//     const normalizedBetType = bet.betType; // Use the normalized bet type from the stored bet
//     const numBet = parseInt(normalizedBetType);
//     if (
//       normalizedBetType === numBet.toString() &&
//       !isNaN(numBet) &&
//       numBet >= 0 &&
//       numBet <= 36
//     ) {
//       if (winningNumber === numBet) {
//         userWonThisBet = true;
//         winMultiplier = payoutMultipliers.number;
//       }
//     } else if (["red", "black"].includes(normalizedBetType)) {
//       if (winningNumber !== 0 && winningColor === normalizedBetType) {
//         userWonThisBet = true;
//         winMultiplier = payoutMultipliers[normalizedBetType];
//       }
//     } else if (["odd", "even"].includes(normalizedBetType)) {
//       if (
//         winningNumber !== 0 &&
//         winningSlot.isOdd === (normalizedBetType === "odd") &&
//         winningSlot.isEven === (normalizedBetType === "even")
//       ) {
//         userWonThisBet = true;
//         winMultiplier = payoutMultipliers[normalizedBetType];
//       }
//     } else if (["low", "high"].includes(normalizedBetType)) {
//       if (
//         winningNumber !== 0 &&
//         winningSlot.isLow === (normalizedBetType === "low") &&
//         winningSlot.isHigh === (normalizedBetType === "high")
//       ) {
//         userWonThisBet = true;
//         winMultiplier = payoutMultipliers[normalizedBetType];
//       }
//     } else if (["1st", "2nd", "3rd"].includes(normalizedBetType)) {
//       if (winningSlot.dozen === normalizedBetType) {
//         userWonThisBet = true;
//         winMultiplier = payoutMultipliers[normalizedBetType];
//       }
//     } else if (["col1", "col2", "col3"].includes(normalizedBetType)) {
//       if (winningSlot.column === normalizedBetType) {
//         userWonThisBet = true;
//         winMultiplier = payoutMultipliers[normalizedBetType];
//       }
//     }

//     if (userWonThisBet) {
//       const winnings = bet.betAmount * winMultiplier;
//       await updateUserProfile(bet.userId, winnings);
//       winnersList.push(
//         `<@${bet.userId}> won ${nexus_coin} **${winnings}** (bet ${bet.betAmount} on ${normalizedBetType})`
//       );
//       totalWon += winnings;
//     } else {
//       // User already had betAmount deducted at time of placing bet.
//       // No need to deduct again.
//       losersList.push(
//         `<@${bet.userId}> lost ${nexus_coin} **${bet.betAmount}** (bet ${bet.betAmount} on ${bet.betType})`
//       );
//       totalLost += bet.betAmount;
//     }
//   }
//   const resultEmbed = new EmbedBuilder()
//     .setColor(
//       winningColor === "red"
//         ? 0xff0000
//         : winningColor === "black"
//         ? 0x000000
//         : 0x00ff00
//     ) // Color based on winning number
//     .setTitle("<:rouletteWheel:1397521672243777566> Roulette Round Results!")
//     .setDescription(
//       `The ball landed on **${winningNumber}** (${winningColor})!`
//     )
//     .addFields(
//       {
//         name: "Winners 🎉",
//         value:
//           winnersList.length > 0
//             ? winnersList.join("\n")
//             : "No winners this round.",
//         inline: false,
//       },
//       {
//         name: "Losers 💔",
//         value:
//           losersList.length > 0
//             ? losersList.join("\n")
//             : "No losers this round.",
//         inline: false,
//       },
//       { name: "\u200b", value: "\u200b", inline: false }, // Spacer
//       {
//         name: "Total Won by Players",
//         value: `${nexus_coin} ${totalWon}`,
//         inline: true,
//       },
//       {
//         name: "Total Lost by Players",
//         value: `${nexus_coin} ${totalLost}`,
//         inline: true,
//       }
//     )
//     .setFooter({ text: `Round ended. Thank you for playing!` })
//     .setTimestamp();

//   await channel.send({ embeds: [resultEmbed] });

//   // Clear game state for this channel
//   delete activeRouletteGames[channelId];
// }
async function logAction(guild, message) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  const logChannel = guild.channels.cache.get(logChannelId);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setDescription(message)
      .setColor("#3498db")
      .setTimestamp();
    await logChannel.send({ embeds: [embed] });
  }
}

async function validateImage(url) {
  try {
    const head = await axios.head(url);

    if (parseInt(head.headers["content-length"], 10) > 256000) {
      return {
        valid: false,
        error: "Image too large. **Max 256KB**.",
      };
    }

    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: "Failed to reach the image URL. Ensure it is a valid Image.",
    };
  }
}

function resolveColor(hex) {
  if (!hex) return null;
  // Remove hash and parse
  const cleanHex = hex.replace("#", "");
  const val = parseInt(cleanHex, 16);
  return isNaN(val) ? null : val;
}

// --- GRADIENT API LOGIC ---
async function updateRoleColors(guildId, roleId, primaryHex, secondaryHex) {
  const primaryInt = resolveColor(primaryHex);
  const secondaryInt = resolveColor(secondaryHex);

  // Construct body based on whether secondary color is present
  const body = {};
  if (secondaryInt !== null) {
    body.colors = {
      primary_color: primaryInt,
      secondary_color: secondaryInt,
    };
  } else {
    body.color = primaryInt; // Fallback to standard
  }

  try {
    // Send Raw Patch Request
    await client.rest.patch(Routes.guildRole(guildId, roleId), { body });
    return { success: true };
  } catch (error) {
    console.error("Gradient API Error:", error);

    // Fallback attempt if gradient fails
    if (secondaryInt !== null) {
      try {
        await client.rest.patch(Routes.guildRole(guildId, roleId), {
          body: { color: primaryInt },
        });
        return {
          success: true,
          warning: "Could not apply gradient. Applied solid color.",
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return { success: false, error: error.message };
  }
}
client.on("ready", async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}!`);
  await initDB();
  // console.log("Database initialized and ready.");

  const guild = client.guilds.cache.get(process.env.GRIMOIRE_SERVER);
  setInterval(async () => {
    try {
      const fetchedMembers = await guild.members.fetch({
        withPresences: true,
        force: false, // Use cache unless needed
      });

      const totalOnline = fetchedMembers.filter(
        (member) =>
          member.presence?.status === "online" ||
          member.presence?.status === "idle"
      ).size;

      const status = [
        // {
        //   name: "EveOfChaos",
        //   type: ActivityType.Streaming,
        //   url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        // },
        {
          name: `${totalOnline} online members`,
          type: ActivityType.Watching,
        },
        {
          name: "Listening to Spotify",
          type: ActivityType.Listening,
        },
        {
          name: "Playing with Life",
          type: ActivityType.Playing,
        },
      ];

      const randomStatus = status[Math.floor(Math.random() * status.length)];
      client.user.setActivity(randomStatus);
    } catch (error) {
      console.error("Error updating status:", error);
    }
  }, 60000);
});

client.on("interactionCreate", async (interaction) => {
  // Handle Chat Input Commands (Slash Commands)
  if (!interaction.isChatInputCommand()) return;
  // const now = Date.now();
  const { commandName } = interaction;
  if (commandName === "ping") {
    await interaction.reply(
      `Websocket latency: **${interaction.client.ws.ping}ms**.`
    );
  } else if (commandName === "role") {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") {
      const name = interaction.options.getString("name");
      const color = interaction.options.getString("hex_color");
      const secondary = interaction.options.getString("secondary_hex");
      // 1. Auto-detect the role with the "premiumSubscriber" tag
      const boosterRole = interaction.guild.roles.cache.find(
        (role) => role.tags && role.tags.premiumSubscriberRole
      );
      const isBooster = boosterRole
        ? interaction.member.roles.cache.has(boosterRole.id)
        : false;
      const record = await db.get(
        "SELECT * FROM user_roles WHERE user_id = ?",
        [interaction.user.id]
      );
      const hasPerms = isBooster || (record && record.is_temp === 1);

      if (!hasPerms)
        return interaction.reply({
          content: "You must be a Server Booster to use this command.",
          ephemeral: true,
        });
      if (record && record.role_id)
        return interaction.reply({
          content: "You already have a role. Use `/edit_role`.",
          ephemeral: true,
        });

      await interaction.deferReply();

      try {
        // 1. Create Role (Basic)
        const newRole = await interaction.guild.roles.create({
          name: name,
          permissions: [],
          reason: `Custom role for ${interaction.user.tag}`,
        });

        // 2. Apply Colors
        const colorResult = await updateRoleColors(
          interaction.guild.id,
          newRole.id,
          color,
          secondary
        );

        // 3. Position
        // 3. Position
        if (boosterRole) {
          try {
            console.log(
              `Found Booster Role: ${boosterRole.name} (Position: ${boosterRole.position})`
            );
            await newRole.setPosition(boosterRole.position + 1);
          } catch (err) {
            console.error("Positioning Error:", err);
            await interaction.followUp({
              content: `⚠️ **Warning:** Role created, but I could not move it above the Booster role. \n**Fix:** Go to Server Settings -> Roles and drag my Bot Role higher than the Booster Role!`,
              ephemeral: true,
            });
          }
        } else {
          console.warn("⚠️ No Booster Role found in this server.");
          await interaction.followUp({
            content: `⚠️ **Notice:** I couldn't find a "Server Booster" role in this server (maybe nobody has boosted yet?). The role was created but not moved.`,
            ephemeral: true,
          });
        }

        // 4. Assign & Save
        await interaction.member.roles.add(newRole);

        if (record) {
          await db.run("UPDATE user_roles SET role_id = ? WHERE user_id = ?", [
            newRole.id,
            interaction.user.id,
          ]);
        } else {
          await db.run(
            "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
            [interaction.user.id, newRole.id]
          );
        }

        let msg = `Role ${newRole} created!`;
        if (colorResult.warning) msg += ` (${colorResult.warning})`;

        await interaction.editReply(msg);
        logAction(
          interaction.guild,
          `✅ **Role Created**: ${interaction.user} created **${name}**`
        );
      } catch (e) {
        await interaction.editReply(`Error: ${e.message}`);
      }
    } else if (subcommand === "edit") {
      // Cooldown Check
      const lastUsed = cooldowns.get(interaction.user.id);
      if (lastUsed && Date.now() - lastUsed < 60000) {
        const remaining = (60 - (Date.now() - lastUsed) / 1000).toFixed(1);
        return interaction.reply({
          content: `Please wait ${remaining}s.`,
          ephemeral: true,
        });
      }

      // Database Check
      const record = await db.get(
        "SELECT role_id FROM user_roles WHERE user_id = ?",
        [interaction.user.id]
      );
      if (!record || !record.role_id)
        return interaction.reply({
          content: "No custom role found.",
          ephemeral: true,
        });

      const role = interaction.guild.roles.cache.get(record.role_id);
      if (!role)
        return interaction.reply({
          content: "Role not found.",
          ephemeral: true,
        });

      // Get Inputs
      const newName = interaction.options.getString("name");
      const newColor = interaction.options.getString("hex_color");
      const newSecondary = interaction.options.getString("secondary_hex");
      const newIcon = interaction.options.getAttachment("icon");

      if (!newName && !newColor && !newIcon && !newSecondary) {
        return interaction.reply({
          content: "No changes provided.",
          ephemeral: true,
        });
      }

      await interaction.deferReply();
      const changes = [];

      try {
        // Apply Changes
        if (newName) {
          await role.setName(newName);
          changes.push(`Name: ${newName}`);
        }

        // Color Logic
        if (newColor || newSecondary) {
          const primaryToUse = newColor || role.hexColor;
          const secondaryToUse = newSecondary; // If null, api handles it or we might need to fetch existing

          // Note: We don't fetch existing secondary because Discord API doesn't expose it easily yet
          // User must provide both if they want to change the gradient scheme significantly.

          const result = await updateRoleColors(
            interaction.guild.id,
            role.id,
            primaryToUse,
            secondaryToUse
          );

          if (result.warning) changes.push(`Color: ${primaryToUse} (Solid)`);
          else
            changes.push(
              newSecondary ? `Color: Gradient` : `Color: ${primaryToUse}`
            );
        }

        if (newIcon) {
          const check = await validateImage(newIcon.url);
          if (!check.valid)
            return interaction.editReply(`Icon Error: ${check.error}`);

          await role.setIcon(newIcon.url);
          changes.push("Icon updated");
        }

        cooldowns.set(interaction.user.id, Date.now());
        await interaction.editReply("Role updated!");
        logAction(
          interaction.guild,
          `✏️ **Role Edited**: ${interaction.user} - ${changes.join(", ")}`
        );
      } catch (e) {
        await interaction.editReply(`Error: ${e.message}`);
      }
    }
  }
  // --- COMMAND: GRANT EXCEPTION ---
  else if (commandName === "grant_exception") {
    const targetUser = interaction.options.getUser("user");
    const months = interaction.options.getInteger("months");

    const expiry = Date.now() + months * 30 * 24 * 60 * 60 * 1000;

    await db.run(
      `
            INSERT INTO user_roles (user_id, is_temp, expiry_date) 
            VALUES (?, 1, ?)
            ON CONFLICT(user_id) DO UPDATE SET is_temp=1, expiry_date=?
        `,
      [targetUser.id, expiry, expiry]
    );

    interaction.reply(
      `Exception granted to ${targetUser} for ${months} months.`
    );
    // logAction(
    //   interaction.guild,
    //   `🛡️ **Exception**: Admin granted permission to ${targetUser}`
    // );
  }

  // --- COMMAND: ASSIGN ROLE ---
  else if (commandName === "assign_role") {
    const targetUser = interaction.options.getMember("user");
    const targetRole = interaction.options.getRole("role");

    if (!targetRole.editable) {
  return interaction.reply({
    content: "<:close:1435556235691954216> I cannot assign this role due to role hierarchy or permissions.",
    ephemeral: true,
  });
}

    if (!targetUser.premiumSince) {
      return interaction.reply({
        content: "<:alert:1435556816267247738> The roles can only be assigned to boosters.",
        ephemeral: true,
      });
    }
    try {
      await targetUser.roles.add(targetRole);

      await db.run(
  `
  INSERT INTO user_roles (user_id, role_id, is_temp, expiry_date)
  VALUES (?, ?, 1, NULL)
  ON CONFLICT(user_id)
  DO UPDATE SET role_id = ?, is_temp = 1, expiry_date = NULL
  `,
  [targetUser.id, targetRole.id, targetRole.id]
);
   await interaction.reply(
      `✅ Assigned ${targetRole} to ${targetUser} (booster role).`
    );
    }
    catch (e) {
    console.error("Assign role error:", e);

    if (!interaction.replied) {
      await interaction.reply(
        `<:close:1435556235691954216> Failed to assign ${targetRole} to ${targetUser}.`
      );
    }
  }
  }
  },
);

//     } else if (interaction.commandName === "balance") {
//       const targetUser = interaction.options.getUser("user");
//       let userToCheck;
//       if (targetUser) {
//         userToCheck = targetUser;
//       } else {
//         userToCheck = interaction.user;
//       }
//       if (userToCheck.bot) {
//         return await interaction.reply({
//           content: "You cannot check a bot's balance.",
//           ephemeral: true,
//         });
//       }

//       const currentBalance = await getUserProfile(userToCheck.id);

//       if (userToCheck.id === interaction.user.id) {
//         // If checking self
//         await interaction.reply(
//           `**${userToCheck.tag}**, you currently have ${formatCurrency(
//             currentBalance
//           )} !`
//         );
//       } else {
//         // If checking someone else
//         await interaction.reply(
//           `**${userToCheck.tag}**, currently has ${formatCurrency(
//             currentBalance
//           )} !`
//         );
//       }
//       // A single return at the end of the command block is sufficient
//     }
//   } else if (interaction.commandName === "roulette") {
//     let betAmountInput = interaction.options.getString("amount");
//     let betType = interaction.options.getString("bet_type"); // Get bet_type directly

//     const betterId = interaction.user.id;
//     const currentBalance = await getUserProfile(betterId);

//     const cooldownAmount = ROULETTE_COOLDOWN_TIME_MS;
//     if (userCooldowns.has(betterId)) {
//       const expirationTime = userCooldowns.get(betterId) + cooldownAmount;
//       if (now < expirationTime) {
//         const timeLeft = (expirationTime - now) / 1000;
//         return await interaction.reply({
//           content: `Please wait ${timeLeft.toFixed(
//             0
//           )} more second(s) before placing another roulette bet.`,
//           ephemeral: true,
//         });
//       }
//     }

//     let betAmount;
//     if (betAmountInput.toLowerCase() === "all") {
//       betAmount = currentBalance;
//     } else {
//       betAmount = parseInt(betAmountInput);
//     }

//     // Validations
//     if (isNaN(betAmount) || betAmount <= 0) {
//       return await interaction.reply({
//         content:
//           "**Usage:** `/roulette <amount | all> <bet_type>` - Amount must be a positive number.",
//         ephemeral: true,
//       });
//     }
//     const MIN_ROULETTE_BET = 100; // Define locally or as global constant if not already
//     if (betAmount < MIN_ROULETTE_BET) {
//       return await interaction.reply({
//         content: `You cannot bet less than ${formatCurrency(
//           MIN_ROULETTE_BET
//         )} on roulette.`,
//         ephemeral: true,
//       });
//     }
//     const MAX_ROULETTE_BET = 300000; // Define locally or as global constant if not already
//     if (betAmount > MAX_ROULETTE_BET) {
//       return await interaction.reply({
//         content: `You cannot bet more than ${formatCurrency(
//           MAX_ROULETTE_BET
//         )} on roulette.`,
//         ephemeral: true,
//       });
//     }
//     if (betAmount > currentBalance) {
//       return await interaction.reply({
//         content: `You don't have enough currency! Your current balance is ${formatCurrency(
//           currentBalance
//         )}.`,
//         ephemeral: true,
//       });
//     }

//     // Note: betType is already validated by Discord's choices or string check if no choices provided.
//     // If individual numbers 0-36 are allowed and not in choices, you need to validate that here:
//     const numBet = parseInt(betType);
//     if (
//       !isNaN(numBet) &&
//       betType === numBet.toString() &&
//       (numBet < 0 || numBet > 36)
//     ) {
//       // If it's a number but out of range
//       return await interaction.reply({
//         content: "Invalid number bet. Please bet on a number between 0 and 36.",
//         ephemeral: true,
//       });
//     }
//     // The deeper validation will be in spinRoulette already.

//     // Roulette Game State Logic (similar to prefix command, but using interaction.channelId)
//     const channelId = interaction.channelId;
//     // Ensure 'now' is defined or passed from caller
//     // If now is not defined, add 'const now = Date.now();' here.

//     await interaction.deferReply(); // Defer because roulette has a setTimeout

//     // Deduct bet amount immediately for user
//     await updateUserProfile(betterId, -betAmount);

//     if (!activeRouletteGames[channelId]) {
//       activeRouletteGames[channelId] = {
//         bets: [],
//         initialMessage: null,
//         timer: null,
//         roundStartTime: now,
//         winningNumber: null,
//       };
//       const initialEmbed = new EmbedBuilder()
//         .setColor(0xffa500)
//         .setTitle(
//           "<:rouletteWheel:1397521672243777566> Roulette Betting Round!"
//         )
//         .setDescription(
//           `A new roulette round has started by **${interaction.user.username}**!` +
//             `\nPlace your bets using -> \n\`roulette <amount> <bet_type>\``
//         )
//         .addFields(
//           {
//             name: "Time Remaining - ",
//             value: `${Math.max(
//               0,
//               (activeRouletteGames[channelId].roundStartTime +
//                 ROULETTE_BETTING_TIME_MS -
//                 now) /
//                 1000
//             ).toFixed(0)} seconds`,
//             inline: true,
//           },
//           {
//             name: "Current Bets",
//             value: `No bets placed yet.`,
//             inline: false,
//           }
//         )
//         .setFooter({ text: `Round started by ${interaction.user.tag}` })
//         .setTimestamp();

//       // Use interaction.editReply for the initial embed
//       const sentEmbedMessage = await interaction.editReply({
//         embeds: [initialEmbed],
//       });
//       activeRouletteGames[channelId].initialMessage = sentEmbedMessage;

//       activeRouletteGames[channelId].timer = setTimeout(() => {
//         revealRouletteResult(channelId); // Call helper function outside this block
//       }, ROULETTE_BETTING_TIME_MS);

//       // No need for a message.channel.send here, interaction.editReply handles initial message
//     } else {
//       const game = activeRouletteGames[channelId];
//       const timeRemaining = Math.max(
//         0,
//         (game.roundStartTime + ROULETTE_BETTING_TIME_MS - now) / 1000
//       );
//       // Use interaction.followUp for bets in active game
//       await interaction.followUp({
//         content: `**${
//           interaction.user.username
//         }** has placed a bet of ${formatCurrency(
//           betAmount
//         )} on **${betType}** (Time remaining: ${timeRemaining.toFixed(0)}s).`,
//         ephemeral: false,
//       });
//     }

//     activeRouletteGames[channelId].bets.push({
//       userId: betterId, // userId is already defined at top of interactionCreate
//       username: interaction.user.username,
//       betAmount: betAmount,
//       betType: betType, // Use
//     });

//     const game = activeRouletteGames[channelId];
//     const betCount = game.bets.length;
//     let currentBetsDescription = `**${betCount}** bet(s) placed so far.`;
//     if (betCount > 0) {
//       const topBets = game.bets.slice(0, 5);
//       currentBetsDescription +=
//         "\n" +
//         topBets
//           .map(
//             (bet) =>
//               `**${bet.username}**: ${formatCurrency(bet.betAmount)} on ${
//                 bet.betType
//               }`
//           )
//           .join("\n");
//       if (betCount > 5) currentBetsDescription += "\n...and more!";
//     }
//     const timeRemainingField = {
//       name: "Time Remaining",
//       value: `${Math.max(
//         0,
//         (game.roundStartTime + ROULETTE_BETTING_TIME_MS - now) / 1000
//       ).toFixed(0)} seconds`,
//       inline: true,
//     };
//     const currentBetsField = {
//       name: "Current Bets",
//       value: currentBetsDescription,
//       inline: false,
//     };

//     if (game.initialMessage) {
//       // This will always be true after initial editReply
//       const updatedEmbed = EmbedBuilder.from(
//         game.initialMessage.embeds[0]
//       ).setFields(timeRemainingField, currentBetsField);
//       await game.initialMessage.edit({ embeds: [updatedEmbed] });
//     }
//     userCooldowns.set(betterId, now); // userId is already defined at top of interactionCreate
//     setTimeout(() => userCooldowns.delete(betterId), cooldownAmount);
//     return;
//   } else if (interaction.commandName === "blackjack") {
//     const betAmount = interaction.options.getInteger("bet"); // Get bet amount as integer

//     const userId = interaction.user.id;
//     const currentBalance = await getUserProfile(userId);

//     if (activeBlackjackGames[userId]) {
//       return await interaction.reply({
//         content:
//           "You are already in an active Blackjack game! Type `!hit` or `!stand` (or use buttons).",
//         ephemeral: true,
//       });
//     }

//     if (isNaN(betAmount) || betAmount <= 0) {
//       // Redundant if type is Integer, but harmless safety check
//       return await interaction.reply({
//         content: "Please specify a valid positive amount to bet on Blackjack.",
//         ephemeral: true,
//       });
//     }
//     if (betAmount > currentBalance) {
//       return await interaction.reply({
//         content: `You don't have enough currency! Your current balance is ${formatCurrency(
//           currentBalance
//         )}.`,
//         ephemeral: true,
//       });
//     }
//     const BLACKJACK_MAX_BET = 300000;
//     if (betAmount > BLACKJACK_MAX_BET) {
//       return await interaction.reply({
//         content: `You cannot bet more than ${formatCurrency(
//           BLACKJACK_MAX_BET
//         )} on Blackjack.`,
//         ephemeral: true,
//       });
//     }

//     await interaction.deferReply(); // Defer reply for Blackjack game start

//     await updateUserProfile(userId, -betAmount); // Deduct bet immediately

//     const deck = createDeck();
//     const playerHand = [drawCard(deck), drawCard(deck)];
//     const dealerHand = [drawCard(deck), drawCard(deck)];
//     const playerHandValue = calculateHandValue(playerHand);
//     const dealerHandValue = calculateHandValue(dealerHand);

//     activeBlackjackGames[userId] = {
//       channelId: interaction.channelId, // Use interaction.channelId
//       gameMessage: null,
//       deck: deck,
//       playerHand: playerHand,
//       dealerHand: dealerHand,
//       betAmount: betAmount,
//       playerTurn: true,
//       playerStand: false,
//     };
//     let statusMessage = "";
//     let gameOver = false;
//     let finalWinner = null;
//     let revealDealerImmediately = false;

//     if (playerHandValue.isBlackjack && dealerHandValue.isBlackjack) {
//       statusMessage = "Both you and the dealer got Blackjack! It's a Push!";
//       finalWinner = "push";
//       gameOver = true;
//       revealDealerImmediately = true;
//     } else if (playerHandValue.isBlackjack) {
//       statusMessage = "Blackjack! You win!";
//       finalWinner = "player";
//       gameOver = true;
//       revealDealerImmediately = true;
//     } else if (dealerHandValue.isBlackjack) {
//       statusMessage = "Dealer got Blackjack! You lose!";
//       finalWinner = "dealer";
//       gameOver = true;
//       revealDealerImmediately = true;
//     }

//     const initialGameEmbed = getBlackjackEmbed(
//       activeBlackjackGames[userId],
//       interaction.user, // Use interaction.user
//       revealDealerImmediately,
//       statusMessage,
//       gameOver
//     );

//     // Use interaction.editReply for the initial embed
//     const sentGameMessage = await interaction.editReply({
//       embeds: [initialGameEmbed],
//       components: initialGameEmbed.components,
//     });
//     activeBlackjackGames[userId].gameMessage = sentGameMessage;

//     if (gameOver) {
//       await handleBlackjackPayout(
//         userId,
//         finalWinner,
//         activeBlackjackGames[userId].betAmount,
//         sentGameMessage,
//         statusMessage // Pass statusMessage
//       );
//       delete activeBlackjackGames[userId];
//     }
//   } else if (interaction.commandName === "transfer") {
//     const recipientUser = interaction.options.getUser("recipient"); // Use 'recipient'
//     const amount = interaction.options.getInteger("amount");

//     const senderId = interaction.user.id;
//     const senderBalance = await getUserProfile(senderId); // Get sender's fresh balance

//     if (isNaN(amount) || amount <= 0) {
//       // Should be handled by Discord for integer option, but safety check
//       return await interaction.reply({
//         content: "Please provide a valid positive amount to transfer.",
//         ephemeral: true,
//       });
//     }
//     if (amount > senderBalance) {
//       return await interaction.reply({
//         content: `You don't have enough currency! Your current balance is ${formatCurrency(
//           senderBalance
//         )}.`,
//         ephemeral: true,
//       });
//     }

//     // Verify recipient is in the current guild
//     let recipientMemberInGuild = null;
//     try {
//       recipientMemberInGuild = await interaction.guild.members.fetch(
//         recipientUser.id
//       );
//     } catch (error) {
//       /* ignored */
//     }

//     if (!recipientMemberInGuild) {
//       return await interaction.reply({
//         content: "That user is not a member of this server.",
//         ephemeral: true,
//       });
//     }
//     if (recipientMemberInGuild.user.bot) {
//       return await interaction.reply({
//         content: "You cannot transfer money to a bot!",
//         ephemeral: true,
//       });
//     }
//     if (recipientUser.id === senderId) {
//       return await interaction.reply({
//         content: "You can't transfer money to yourself!",
//         ephemeral: true,
//       });
//     }

//     // Deduct from sender, add to receiver
//     await updateUserProfile(senderId, -amount);
//     await updateUserProfile(recipientUser.id, amount);

//     const senderNewBalance = await getUserProfile(senderId);
//     const recipientNewBalance = await getUserProfile(recipientUser.id);

//     const confirmationMessage =
//       `Successfully transferred ${formatCurrency(amount)} from **${
//         interaction.user.tag
//       }** to <@${recipientUser.id}>.` +
//       `\nYour new balance is ${formatCurrency(senderNewBalance)}.` +
//       `\n**${recipientUser.tag}'s** new balance is ${formatCurrency(
//         recipientNewBalance
//       )}.`;
//     await interaction.reply(confirmationMessage);
//   }
//   // Handle Button Interactions
//   else if (interaction.isButton()) {
//     const userId = interaction.user.id;
//     const customId = interaction.customId;

//     await interaction.deferUpdate(); // Acknowledge immediately

//     const game = activeBlackjackGames[userId];

//     if (!game || !game.playerTurn) {
//       // If the game exists but is already over, update the embed just in case
//       if (game && !game.playerTurn && game.playerStand) {
//         const finalEmbed = getBlackjackEmbed(
//           game,
//           interaction.user,
//           true,
//           "Game Over.",
//           true
//         );
//         await game.gameMessage.edit({
//           embeds: [finalEmbed],
//           components: finalEmbed.components,
//         });
//       }
//       return await interaction.followUp({
//         content:
//           "You are not in an active Blackjack game, or it's not your turn! Start one with `!blackjack <amount>`.",
//         ephemeral: true,
//       });
//     }
//     switch (customId) {
//       case "blackjack_hit": {
//         const newCard = drawCard(game.deck);
//         game.playerHand.push(newCard);
//         const playerHandValue = calculateHandValue(game.playerHand);

//         let statusMessage = "";
//         let gameOver = false;
//         let finalWinner = null;

//         if (playerHandValue.value > 21) {
//           statusMessage = "You busted! Your hand is over 21. You lose!";
//           finalWinner = "dealer";
//           gameOver = true;
//         }

//         const updatedEmbed = getBlackjackEmbed(
//           game,
//           interaction.user,
//           false,
//           statusMessage,
//           gameOver
//         );
//         await game.gameMessage.edit({
//           embeds: [updatedEmbed],
//           components: updatedEmbed.components,
//         });

//         if (gameOver) {
//           await handleBlackjackPayout(
//             userId,
//             finalWinner,
//             game.betAmount,
//             game.gameMessage
//           );
//           delete activeBlackjackGames[userId];
//         }
//         break;
//       }

//       case "blackjack_stand": {
//         game.playerTurn = false;
//         game.playerStand = true;

//         let dealerHandValue = calculateHandValue(game.dealerHand);
//         let statusMessage = "You stood. Dealer's turn!\n";
//         let revealEmbed = getBlackjackEmbed(
//           game,
//           interaction.user,
//           true,
//           statusMessage + "Dealer reveals their hand..."
//         );
//         await game.gameMessage.edit({
//           embeds: [revealEmbed],
//           components: revealEmbed.components,
//         });

//         await new Promise((resolve) => setTimeout(resolve, 1500));

//         while (dealerHandValue.value < 17) {
//           const newCard = drawCard(game.deck);
//           game.dealerHand.push(newCard);
//           dealerHandValue = calculateHandValue(game.dealerHand);
//           statusMessage += `Dealer hits and draws ${getCardDisplay(
//             newCard
//           )}. Dealer's hand is now ${dealerHandValue.value}.\n`;
//           let updatedEmbed = getBlackjackEmbed(
//             game,
//             interaction.user,
//             true,
//             statusMessage
//           );

//           await game.gameMessage.edit({
//             embeds: [updatedEmbed],
//             components: updatedEmbed.components,
//           });
//           await new Promise((resolve) => setTimeout(resolve, 1500));
//         }

//         let finalWinner = null;

//         const playerHandValue = calculateHandValue(game.playerHand);

//         if (dealerHandValue.value > 21) {
//           statusMessage += "Dealer busted! You win!";
//           finalWinner = "player";
//         } else if (playerHandValue.value > dealerHandValue.value) {
//           statusMessage += "You win! Your hand is higher than the dealer's.";
//           finalWinner = "player";
//         } else if (dealerHandValue.value > playerHandValue.value) {
//           statusMessage += "Dealer wins! Dealer's hand is higher than yours.";
//           finalWinner = "dealer";
//         } else {
//           statusMessage += "It's a push! Your bet is returned.";
//           finalWinner = "push";
//         }

//         const finalEmbedStand = getBlackjackEmbed(
//           game,
//           interaction.user,
//           true,
//           statusMessage,
//           true
//         );

//         await game.gameMessage.edit({
//           embeds: [finalEmbedStand],

//           components: finalEmbedStand.components,
//         });
//         await handleBlackjackPayout(
//           userId,
//           finalWinner,
//           game.betAmount,
//           game.gameMessage
//         );
//         delete activeBlackjackGames[userId];
//         break;
//       }

//       case "blackjack_doubledown": {
//         const playerBalance = await getUserProfile(userId);

//         const doubleBetAmount = game.betAmount;

//         if (game.playerHand.length !== 2) {
//           return await interaction.followUp({
//             content: "You can only Double Down on your first two cards!",
//             ephemeral: true,
//           });
//         }

//         if (playerBalance < doubleBetAmount) {
//           return await interaction.followUp({
//             content: `You don't have enough to double down! You need ${nexus_coin} ${doubleBetAmount} more.`,
//             ephemeral: true,
//           });
//         }

//         await updateUserProfile(userId, -doubleBetAmount);

//         game.betAmount += doubleBetAmount;
//         const newCard = drawCard(game.deck);
//         game.playerHand.push(newCard);
//         const playerHandValue = calculateHandValue(game.playerHand);
//         let statusMessage = `You doubled down and drew ${getCardDisplay(
//           newCard
//         )}. Your hand is now ${playerHandValue.value}.\n`;

//         let gameOver = false;

//         let finalWinner = null;

//         if (playerHandValue.value > 21) {
//           statusMessage += "You busted! Your hand is over 21. You lose!";
//           finalWinner = "dealer";
//           gameOver = true;
//         }

//         const updatedEmbedDoubleDown = getBlackjackEmbed(
//           game,
//           interaction.user,
//           false,
//           statusMessage,
//           gameOver
//         );
//         await game.gameMessage.edit({
//           embeds: [updatedEmbedDoubleDown],
//           components: updatedEmbedDoubleDown.components,
//         });

//         if (gameOver) {
//           await handleBlackjackPayout(
//             userId,
//             finalWinner,
//             game.betAmount,
//             game.gameMessage
//           );

//           delete activeBlackjackGames[userId];
//         } else {
//           await playDealersTurnAndDetermineWinner(
//             userId,
//             game,
//             interaction.user,
//             game.gameMessage,
//             statusMessage
//           );
//         }
//         break;
//       }

//       // --- CORRECTED: blackjack_split as a 'case' inside the switch ---
//       case "blackjack_split": {
//         // Split is still a placeholder as it's very complex.
//         await interaction.followUp({
//           content: "Split is not yet implemented!",
//           ephemeral: true,
//         });
//         break;
//       }

//       default: // Default case to handle any unknown customId (good practice)
//         console.log(`Unknown Blackjack button customId: ${customId}`);
//         await interaction.followUp({
//           content: "An unknown action occurred. Please try again.",
//           ephemeral: true,
//         });
//         break;
//     } // <--- This brace correctly closes the 'switch' statement.
//   } // <--- This brace closes the 'if (interaction.isButton())' block.
// });
client.on("guildMemberUpdate", async (oldMember, newMember) => {

  const wasBooster = oldMember.premiumSince;
  const isBooster = newMember.premiumSince;

 // Run ONLY if boost status actually changed
  if (!!wasBooster === !!isBooster) {
    
    if (!wasBooster && isBooster) {
  await db.run(
    "UPDATE user_roles SET expiry_date = NULL WHERE user_id = ? AND is_temp = 1",
    [newMember.id]
  ); 
  return;
    }

    // User stopped boosting
    try {
    const record = await db.get(
      "SELECT * FROM user_roles WHERE user_id = ?",
      [newMember.id]
    );

    // No record → nothing to do
    if (!record) return;

    
    // Skip temp/admin exception roles
    if (record.is_temp === 1) {
       await db.run(
    "UPDATE user_roles SET expiry_date = ? WHERE user_id = ? AND is_temp = 1",
    [Date.now() + 24 * 60 * 60 * 1000, newMember.id]
  );
      return;
    }

    const guild = newMember.guild;
    const role = guild.roles.cache.get(record.role_id);

    if (role) {
      if (!role.editable) {
        console.warn(
          `Cannot delele role ${role.name} (${role.id})\n missing permissions or hierarchy`
        );
  } else {
      await role.delete("Role deleted becuase user stopped boosting");
  }
}
    await db.run("DELETE FROM user_roles WHERE user_id = ?", [newMember.id]);
    // logAction(
    //     guild,
    //     `🗑️ **Deleted**: ${newMember.user} stopped boosting.`
    //   ); 
    } catch (error) {
      console.error("Error removing custom role:", error);
    }
  }
);
// --- BACKGROUND TASK ---
async function checkExpiredRoles() {
   try {
  const now = Date.now();
  const expired = await db.all(
    "SELECT * FROM user_roles WHERE is_temp = 1 AND expiry_date < ?",
    [now]
  );

  if (!expired.length) return;
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    console.error("Server not found for expiry check");
    return;
  }
  for (const row of expired) {
  try {
    const role = guild.roles.cache.get(row.role_id);

    if (role) {
      if (!role.editable) {
        console.warn(`Cannot delete expired role ${row.role_id} (permission issue)`);
        continue;
      }
      await role.delete("Temporary role expired");
    }

    await db.run("DELETE FROM user_roles WHERE user_id = ?", [row.user_id]);
    // logAction(
    //   guild,
    //   `⏰ **Expired**: Role for user ID ${row.user_id} removed.`
    // );
  } catch (innerErr) {
    console.error(`Error processing expired role for user ${row.user_id}:`, innerErr);
  } 
  }
} catch (err) {
  console.error("Expired role sweep error:", err);
}
}
setInterval(checkExpiredRoles, 24*60*60*1000);
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // --- Start Prefix Command Handling ---
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // --- SEARCH COMMAND ---
    if (commandName === "search" || commandName === "find") {
      // Define search constants
      const SEARCH_CHANNEL_ID = process.env.SEARCH_CHANNEL_ID;

      // A. Guild Check - MUST be first for this command
      if (!message.guild) {
        return message.channel.send(
          `<:alert:1435556816267247738> Epub search must be run inside this server.`
        );
      }

      // B. Restrict Channel Check
      if (message.channel.id !== SEARCH_CHANNEL_ID) {
        return message.channel.send(
          `<:alert:1435556816267247738> This command only works in <#${SEARCH_CHANNEL_ID}>`
        );
      }

      // C. Prepare the Query
      const query = args.join(" ").trim();
      if (query.length === 0) {
        return message.channel.send(
          `<:alert:1435556816267247738> Please provide a name to search for. \n \`${prefix}search Novel_Name\``
        );
      }

      // D. Execute Search Logic
      try {
        const searchMsg = await message.channel.send(
          `<:search:1435556273373581364> Searching Epub...`
        );

        const normalizedQuery = query.toLowerCase();

        // Use cached data
        const allForumPosts = await fetchAllForumPosts(message.guild);

        if (allForumPosts.length === 0) {
          return searchMsg.edit(
            `<:close:1435556235691954216> No forum posts found in this server.`
          );
        }

        let exactMatch = null;
        let suggestions = [];
        const SIMILARITY_THRESHOLD = 0.4;

        for (const post of allForumPosts) {
          const normalizedPostName = post.name.toLowerCase().trim();

          // Check for Exact Match
          if (normalizedPostName === normalizedQuery) {
            exactMatch = post;
            break;
          }

          // Quick check: if query is substring of post name
          if (normalizedPostName.includes(normalizedQuery)) {
            suggestions.push({
              thread: post,
              score: normalizedQuery.length / normalizedPostName.length,
            });
            continue;
          }

          // Only do expensive similarity calculation if there's some overlap
          const queryWords = normalizedQuery.split(/\s+/);
          const postWords = normalizedPostName.split(/\s+/);
          const hasCommonWord = queryWords.some((word) =>
            postWords.includes(word)
          );

          if (hasCommonWord) {
            const similarityScore = simpleSimilarity(
              normalizedPostName,
              normalizedQuery
            );

            if (similarityScore > SIMILARITY_THRESHOLD) {
              suggestions.push({ thread: post, score: similarityScore });
            }
          }
        }

        // Respond based on outcome
        if (exactMatch) {
          const forumChannelName = exactMatch.parentName || "Unknown Forum";
          return searchMsg.edit({
            content: null,
            embeds: [
              new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle(`<:check:1435556217891065878>  ${exactMatch.name}`)
                .setURL(exactMatch.url)
                .setDescription(`Found in  **${forumChannelName}**`)
                .setFooter({
                  text: `Exact match!`,
                }),
            ],
          });
        }

        if (suggestions.length > 0) {
          suggestions.sort((a, b) => b.score - a.score);
          const topSuggestions = suggestions.slice(0, 5);

          const list = topSuggestions
            .map((item, index) => {
              const forumName = item.thread.parentName || "Unknown";
              return `${index + 1}. [${item.thread.name}](${
                item.thread.url
              }) •  **${forumName}**`;
            })
            .join("\n");

          return searchMsg.edit({
            content: null,
            embeds: [
              new EmbedBuilder()
                .setColor(0x5799f3)
                .setTitle(
                  `<:alert:1435556816267247738> No exact match for "${query}"`
                )
                .setDescription(`Did you mean one of these epubs?\n\n${list}`),
            ],
          });
        }

        return searchMsg.edit(
          `<:close:1435556235691954216> Sorry, no epub found matching "${query}".`
        );
      } catch (error) {
        console.error("Search command error:", error);
        return message.channel.send(
          "<:close:1435556235691954216> An error occurred while searching for epub"
        );
      }
    }
    if (commandName === "refresh" || commandName === "cache") {
      const isAdmin = message.member.permissions.has("Administrator");
      const hasRole = message.member.roles.cache.has("1366687926330851418");
      if (!isAdmin && !hasRole) {
        return message.channel.send(
          `<:alert:1435556816267247738> Only administrators can refresh the cache.`
        );
      }

      forumPostsCache = [];
      lastCacheUpdate = 0;

      const msg = await message.channel.send(
        "<a:loading:1448687462800035840> Refreshing forum posts cache..."
      );
      await fetchAllForumPosts(message.guild);
      return msg.edit(
        `<:check:1435556217891065878> Cache refreshed! Found ${forumPostsCache.length} forum posts.`
      );
    }
    // Handle the coinflip command
    //   if (commandName === "coinflip" || commandName === "cf") {
    //     let betAmount;
    //     if (args[0] && args[0].toLowerCase() === "all") {
    //       betAmount = currentBalance;
    //     } else {
    //       betAmount = parseInt(args[0]);
    //     }
    //     let choice = args[1] ? args[1].toLowerCase() : "heads";
    //     if (choice === "h") choice = "heads";
    //     if (choice === "t") choice = "tails";

    //     // Corrected: Validation logic
    //     if (isNaN(betAmount) || betAmount <= 0) {
    //       // Check if NOT a number OR zero/negative
    //       return message.channel.send(
    //         "**Usage:** `!coinflip <amount | all> <heads | tails>`"
    //       );
    //     }
    //     const max_bet_limit = 300000;
    //     if (betAmount > max_bet_limit) {
    //       return message.channel.send(
    //         `You cannot bet more than **${formatCurrency(max_bet_limit)}**.`
    //       );
    //     }
    //     // Corrected: Insufficient funds check should be after max bet limit
    //     let currentBalance;
    //     if (betAmount > currentBalance) {
    //       return message.channel.send(
    //         `You don't have enough currency! Your current balance is **${formatCurrency(
    //           currentBalance
    //         )}**.` // Added nexus_coin for consistency
    //       );
    //     }
    //     if (!["heads", "tails"].includes(choice)) {
    //       return message.channel.send(
    //         "**Usage:** `Please choose 'heads' or 'tails' (or 'h'|'t')."
    //       );
    //     }

    //     const initialMessageContent = `${
    //       message.author.username
    //     } spent **${formatCurrency(betAmount)}** and chose **${choice}**.`;
    //     const spinningEmoji = "<a:nexus_coin_spin:1396801480618676395>"; // Custom animated emoji
    //     const sentMessage = await message.channel.send(
    //       `${initialMessageContent}\nThe coin spins... ${spinningEmoji}`
    //     );

    //     await new Promise((resolve) => setTimeout(resolve, 3000));

    //     const result = await coinFlip(userId, betAmount, choice); // Ensure coinFlip is imported
    //     await sentMessage.edit(
    //       `${initialMessageContent}\n${result.finalMessage}`
    //     );
    //     return;
    //   }

    //   // Handle balance command
    //   else if (commandName === "balance" || commandName === "bal") {
    //     return message.channel.send(
    //       `**${message.author.tag}**, you currently have **${formatCurrency(
    //         currentBalance
    //       )}** Nexus coins!`
    //     );
    //   }

    //   // Handle addmoney/removemoney commands
    //   else if (
    //     commandName === "addmoney" ||
    //     commandName === "add" ||
    //     commandName === "removemoney" ||
    //     commandName === "rm"
    //   ) {
    //     // Owner check
    //     if (message.author.id !== process.env.BOT_OWNER_ID) {
    //       // Ensure process.env.OWNER_ID is correct
    //       return message.channel.send(
    //         "You do not have permission to use this command."
    //       );
    //     }
    //     let targetUser = message.mentions.users.first(); // Corrected: 'users'
    //     let targetUserId;
    //     if (targetUser) {
    //       targetUserId = targetUser.id;
    //     } else if (args[0]) {
    //       targetUserId = args[0];
    //       try {
    //         targetUser = await client.users.fetch(targetUserId);
    //       } catch (e) {
    //         targetUser = null; // Invalid ID
    //       }
    //     }

    //     let targetMemberInGuild = null;
    //     try {
    //       // Attempt to fetch the user as a GuildMember from the current guild.
    //       // This will only succeed if the user is in *this* guild.
    //       targetMemberInGuild = await message.guild.members.fetch(targetUserId);
    //     } catch (error) {
    //       // If fetch fails, the user is not in this guild (or invalid ID)
    //       console.error(
    //         `Failed to fetch member ${targetUserId} in guild ${message.guild.id}:`,
    //         error
    //       ); // Optional: for debugging
    //     }

    //     if (!targetMemberInGuild) {
    //       // If they are not found as a member of this guild
    //       return message.channel.send(
    //         "That user is not a member of this server."
    //       );
    //     }
    //     // Bot check for add/remove
    //     if (targetMemberInGuild.user.bot) {
    //       // Check targetUser is not null before .bot
    //       return message.channel.send(
    //         "You cannot add or remove money from a bot!"
    //       );
    //     }
    //     // Validate target user found
    //     if (!targetUserId || !targetUser) {
    //       return message.channel.send(
    //         "Please provide a user to modify (mention or ID)."
    //       );
    //     }

    //     const amount = parseInt(args[1]);
    //     if (isNaN(amount) || amount <= 0) {
    //       return message.channel.send("Please provide a valid positive amount."); // Clarified "positive"
    //     }

    //     let multiplier;
    //     let actionPastVerb;
    //     let preposition;
    //     if (commandName === "addmoney" || commandName === "add") {
    //       multiplier = 1;
    //       actionPastVerb = "added";
    //       preposition = "to";
    //     } else if (commandName === "removemoney" || commandName === "rm") {
    //       multiplier = -1;
    //       actionPastVerb = "removed";
    //       preposition = "from";
    //     } else {
    //       return message.channel.send(
    //         "An unexpected error occurred with the command type."
    //       );
    //     }
    //     await getUserProfile(targetUserId);
    //     await updateUserProfile(targetUserId, amount * multiplier);
    //     const newTargetBalance = await getUserProfile(targetUserId);

    //     return message.channel.send(
    //       `Successfully ${actionPastVerb} **${formatCurrency(
    //         amount
    //       )}** ${preposition} <@${targetUserId}>\nTheir new balance is **${formatCurrency(
    //         newTargetBalance
    //       )}**`
    //     );
    //   }

    //   // Handle transfer command
    //   else if (
    //     commandName === "transfer" ||
    //     commandName === "send" ||
    //     commandName === "give"
    //   ) {
    //     const senderId = userId;
    //     const senderBalance = currentBalance; // Already fetched

    //     let receiverUser = message.mentions.users.first();
    //     let receiverUserId;
    //     if (receiverUser) {
    //       receiverUserId = receiverUser.id;
    //     } else if (args[0]) {
    //       receiverUserId = args[0];
    //       try {
    //         receiverUser = await client.users.fetch(receiverUserId);
    //       } catch (e) {
    //         receiverUser = null; // Invalid ID
    //       }
    //     }

    //     let receiverMemberInGuild = null;
    //     try {
    //       // Attempt to fetch the user as a GuildMember from the current guild.
    //       // This will only succeed if the user is in *this* guild.
    //       receiverMemberInGuild = await message.guild.members.fetch(
    //         receiverUserId
    //       );
    //     } catch (error) {
    //       console.error(
    //         `Failed to fetch member ${receiverUserId} in guild ${message.guild.id}:`,
    //         error
    //       ); // Optional: for debugging
    //     }

    //     if (!receiverMemberInGuild) {
    //       // If they are not found as a member of this guild
    //       return message.channel.send(
    //         "That user is not a member of this server."
    //       );
    //     }
    //     if (!receiverUserId || !receiverUser) {
    //       return message.channel.send(
    //         "Please provide a valid user to transfer to (mention or ID)."
    //       );
    //     }
    //     if (receiverMemberInGuild.user.bot) {
    //       return message.channel.send("You cannot transfer money to a bot!");
    //     }
    //     if (receiverUserId === senderId) {
    //       return message.channel.send(
    //         "You can't transfer the money to yourself!"
    //       );
    //     }

    //     const amount = parseInt(args[1]);
    //     if (isNaN(amount) || amount <= 0) {
    //       return message.channel.send("Please provide a valid positive amount.");
    //     }
    //     if (amount > senderBalance) {
    //       return message.channel.send(
    //         `You don't have enough money for this transfer! Your current balance is **${formatCurrency(
    //           senderBalance
    //         )}**.`
    //       );
    //     }

    //     await updateUserProfile(senderId, -amount);
    //     await updateUserProfile(receiverUserId, amount);

    //     const senderNewBalance = await getUserProfile(senderId);
    //     const receiverNewBalance = await getUserProfile(receiverUserId);

    //     let confirmationMessage = `Successfully transferred **${formatCurrency(
    //       amount
    //     )}** from **${message.author.tag}** to <@${receiverUserId}>.`;
    //     confirmationMessage += `\nYour new balance is **${formatCurrency(
    //       senderNewBalance
    //     )}**.`;
    //     confirmationMessage += `\n**${
    //       receiverUserId.tag
    //     }'s** new balance is **${formatCurrency(receiverNewBalance)}**.`;
    //     return message.channel.send(confirmationMessage);
    //   }

    //   // Handle roulette command
    //   else if (commandName === "roulette" || commandName === "roul") {
    //     const betterId = userId;
    //     const betterBalance = currentBalance; // Use currentBalance from top scope

    //     if (args.length < 2) {
    //       if (args.length === 1 && args[0].toLowerCase() === "help") {
    //         const rouletteHelpEmbed = new EmbedBuilder()
    //           .setColor(0x0099ff)
    //           .setTitle(
    //             "<:rouletteWheel:1397521672243777566> How to Play Roulette"
    //           )
    //           .setDescription(
    //             "**Betting:** Choose a space where you think the ball will land. You can place multiple bets by running the command multiple times.\n" +
    //               "Lower probability bets have higher payouts."
    //           )
    //           .addFields(
    //             {
    //               name: "Command Usage",
    //               value: "`!roulette <amount> <bet_type>`",
    //               inline: false,
    //             },
    //             {
    //               name: "Bet Types & Multipliers",
    //               value: "\u200b",
    //               inline: false,
    //             },
    //             {
    //               name: "Single Number",
    //               value: "`x36` (e.g., `!roulette 100 7`)",
    //               inline: true,
    //             },
    //             // Corrected: Dozens example to '1st'
    //             {
    //               name: "Dozens (1-12, 13-24, 25-36)",
    //               value: "`x3` (e.g., `!roulette 100 1st`)",
    //               inline: true,
    //             },
    //             {
    //               name: "Columns (1st, 2nd, 3rd)",
    //               value: "`x3` (e.g., `!roulette 100 col1`)",
    //               inline: true,
    //             },
    //             {
    //               name: "Halves (1-18, 19-36)",
    //               value: "`x2` (e.g., `!roulette 100 low`)",
    //               inline: true,
    //             },
    //             {
    //               name: "Odd/Even",
    //               value: "`x2` (e.g., `!roulette 100 even`)",
    //               inline: true,
    //             },
    //             {
    //               name: "Colors (Red, Black)",
    //               value: "`x2` (e.g., `!roulette 100 red`)",
    //               inline: true,
    //             } // Corrected !roulette
    //           )
    //           .setFooter({
    //             text: "Remember: 0 is Green and wins only on direct number bets. It is not Odd/Even, High/Low, or part of Dozens/Columns.",
    //           })
    //           .setTimestamp()
    //           .setImage("https://cdn.imgchest.com/files/4jdcv63jbw4.png"); // Your image URL
    //         await message.channel.send({ embeds: [rouletteHelpEmbed] });
    //         return;
    //       } else {
    //         // Not enough arguments, AND they weren't asking for 'help'
    //         return message.channel.send(
    //           "**Usage:** `roulette <amount | all> <bet_type>`\nType `roulette help` for detailed rules."
    //         );
    //       }
    //     }
    //     const now = Date.now();
    //     const cooldownAmount = ROULETTE_COOLDOWN_TIME_MS;
    //     if (userCooldowns.has(betterId)) {
    //       const expirationTime = userCooldowns.get(betterId) + cooldownAmount;
    //       if (now < expirationTime) {
    //         const timeLeft = (expirationTime - now) / 1000;
    //         return message.channel.send(
    //           `Please wait ${timeLeft.toFixed(
    //             0
    //           )} more second(s) before placing another roulette bet.`
    //         );
    //       }
    //     }

    //     let betAmount;
    //     if (args[0] && args[0].toLowerCase() === "all") {
    //       betAmount = betterBalance;
    //     } else {
    //       betAmount = parseInt(args[0]);
    //     }
    //     const betType = args.slice(1).join(" ").toLowerCase();
    //     // Corrected: Validation order and logic for betAmount
    //     if (isNaN(betAmount) || betAmount <= 0) {
    //       // Check if NOT a number OR zero/negative
    //       return message.channel.send(
    //         "**Usage:** `!roulette <amount | all> <bet_type>`"
    //       );
    //     }
    //     const MIN_ROULETTE_BET = 100;
    //     if (betAmount < MIN_ROULETTE_BET) {
    //       return message.channel.send(
    //         `You cannot bet less than **${formatCurrency(
    //           MIN_ROULETTE_BET
    //         )}** on roulette.`
    //       );
    //     }

    //     const MAX_ROULETTE_BET = 300000;
    //     if (betAmount > MAX_ROULETTE_BET) {
    //       return message.channel.send(
    //         `You cannot bet more than **${formatCurrency(
    //           MAX_ROULETTE_BET
    //         )}** on roulette.`
    //       );
    //     }
    //     // Corrected: Insufficient funds check should be after max bet limit
    //     if (betAmount > betterBalance) {
    //       return message.channel.send(
    //         `You don't have enough currency! Your current balance is **${formatCurrency(
    //           betterBalance
    //         )}**.`
    //       ); // Added nexus_coin
    //     }

    //     const validStringBets = [
    //       "red",
    //       "black",
    //       "odd",
    //       "even",
    //       "low",
    //       "high",
    //       "1st",
    //       "2nd",
    //       "3rd",
    //       "col1",
    //       "col2",
    //       "col3",
    //     ];

    //     let isValidBetType = false;
    //     let finalBetTypeForGame = betType;

    //     const numBet = parseInt(betType);
    //     if (
    //       betType === numBet.toString() &&
    //       !isNaN(numBet) &&
    //       numBet >= 0 &&
    //       numBet <= 36
    //     ) {
    //       isValidBetType = true;
    //       finalBetTypeForGame = numBet.toString();
    //     } else if (validStringBets.includes(betType)) {
    //       isValidBetType = true;
    //     }

    //     if (!isValidBetType) {
    //       return message.channel.send(
    //         "Invalid bet type. Please bet on:\n" +
    //           "• A number (0-36)\n" +
    //           "• Color (red/black)\n" +
    //           "• Odd/Even (odd/even)\n" +
    //           "• High/Low (high/low)\n" +
    //           "• Dozen (1st/2nd/3rd)\n" + // Corrected in message
    //           "• Column (col1/col2/col3)"
    //       );
    //     }

    //     await updateUserProfile(betterId, -betAmount);
    //     const channelId = message.channel.id;

    //     if (!activeRouletteGames[channelId]) {
    //       // No active game in this channel, so start a new one!
    //       activeRouletteGames[channelId] = {
    //         bets: [],
    //         initialMessage: null, // To store the embed message we send
    //         timer: null, // To store the setTimeout ID
    //         roundStartTime: now,
    //         winningNumber: null, // Will be set after betting phase
    //       };
    //       const initialEmbed = new EmbedBuilder()
    //         .setColor(0xffa500) // Orange color for betting phase
    //         .setTitle(
    //           "<:rouletteWheel:1397521672243777566> Roulette Betting Round!"
    //         )
    //         .setDescription(
    //           `A new roulette round has started by **${message.author.username}**!` +
    //             `\nPlace your bets using -> \n\`roulette <amount> <bet_type>\``
    //         )
    //         .addFields(
    //           {
    //             name: "Time Remaining - ",
    //             value: `${Math.max(
    //               0,
    //               (activeRouletteGames[channelId].roundStartTime +
    //                 ROULETTE_BETTING_TIME_MS -
    //                 now) /
    //                 1000
    //             ).toFixed(0)} seconds`,
    //             inline: true,
    //           },
    //           {
    //             name: "Current Bets",
    //             value: `No bets placed yet.`,
    //             inline: false,
    //           }
    //         )
    //         .setFooter({ text: `Round started by ${message.author.tag}` })
    //         .setTimestamp();

    //       const sentEmbedMessage = await message.channel.send({
    //         embeds: [initialEmbed],
    //       });
    //       activeRouletteGames[channelId].initialMessage = sentEmbedMessage;

    //       // Set the timer to reveal results
    //       activeRouletteGames[channelId].timer = setTimeout(() => {
    //         revealRouletteResult(channelId);
    //       }, ROULETTE_BETTING_TIME_MS);
    //     } else {
    //       // Game is already active in this channel, just add the bet
    //       const game = activeRouletteGames[channelId];
    //       const timeRemaining = Math.max(
    //         0,
    //         (game.roundStartTime + ROULETTE_BETTING_TIME_MS - now) / 1000
    //       );

    //       message.channel.send(
    //         `**${
    //           message.author.username
    //         }** has placed a bet of **${formatCurrency(
    //           betAmount
    //         )}** on **${betType}** (Time remaining: ${timeRemaining.toFixed(
    //           0
    //         )}s).`
    //       );
    //     }
    //     activeRouletteGames[channelId].bets.push({
    //       userId: betterId,
    //       username: message.author.username, // Store username for display
    //       betAmount: betAmount,
    //       betType: finalBetTypeForGame, // Store the normalized bet type
    //       messageLink: message.url, // Store link to the bet message
    //     });
    //     const game = activeRouletteGames[channelId];
    //     const betCount = game.bets.length;
    //     let currentBetsDescription = `**${betCount}** bet(s) placed so far.`;
    //     if (betCount > 0) {
    //       const topBets = game.bets.slice(0, 5); // Show top 5 recent bets
    //       currentBetsDescription +=
    //         "\n" +
    //         topBets
    //           .map(
    //             (bet) =>
    //               `**${bet.username}**: ${formatCurrency(bet.betAmount)} on ${
    //                 bet.betType
    //               }`
    //           )
    //           .join("\n");
    //       if (betCount > 5) currentBetsDescription += "\n...and more!";
    //     }
    //     const timeRemainingField = {
    //       name: "Time Remaining",
    //       value: `${Math.max(
    //         0,
    //         (activeRouletteGames[channelId].roundStartTime +
    //           ROULETTE_BETTING_TIME_MS -
    //           now) /
    //           1000
    //       ).toFixed(0)} seconds`,
    //       inline: true,
    //     };
    //     const currentBetsField = {
    //       name: "Current Bets",
    //       value: currentBetsDescription,
    //       inline: false,
    //     };

    //     if (game.initialMessage) {
    //       const updatedEmbed = EmbedBuilder.from(
    //         game.initialMessage.embeds[0]
    //       ).setFields(timeRemainingField, currentBetsField);
    //       await game.initialMessage.edit({ embeds: [updatedEmbed] });
    //     }
    //     userCooldowns.set(betterId, now);
    //     setTimeout(() => userCooldowns.delete(betterId), cooldownAmount);

    //     return;
    //   } else if (commandName === "blackjack" || commandName === "bj") {
    //     if (args.length === 0 || args[0].toLowerCase() === "help") {
    //       const blackjackHelpEmbed = new EmbedBuilder()
    //         .setColor(0x0000ff)
    //         .setTitle(`How to Play Bjackjack`)
    //         .setDescription(
    //           "**Goal:** Get your hand value as close to 21 as possible without going over.\n" +
    //             "**Card Values:** Numbers are face value, J/Q/K are 10, Ace is 1 or 11.\n" +
    //             "**Blackjack:** An Ace and a 10-value card on the initial deal (21 total).\n\n" +
    //             "**Game Flow:**\n" +
    //             "1. `!blackjack <amount>` to start a game.\n" +
    //             "2. Type `!hit` to take another card.\n" +
    //             "3. Type `!stand` to end your turn.\n" +
    //             // Add more rules if you implement double down/split later
    //             "• Dealer hits on 16 or less, stands on 17 or more."
    //         )
    //         .addFields(
    //           {
    //             name: "Payouts",
    //             value: "win: `1:1`\nBlackjack: `3:2`\nPush (Tie): Bet returned",
    //             inline: false,
    //           },
    //           {
    //             name: "Commands",
    //             value:
    //               "`!blackjack <amount>` (start game)\n`!hit` (take card)\n`!stand` (end turn)",
    //             inline: false,
    //           }
    //         )
    //         .setFooter({ text: "Good luck!" })
    //         .setTimestamp();
    //       await message.channel.send({ embeds: [blackjackHelpEmbed] });
    //       return;
    //     } //embed bracket
    //     if (activeBlackjackGames[userId]) {
    //       return message.channel.send(
    //         "You are already in an acitve Blackjack game!"
    //       );
    //     }
    //     const betAmount = parseInt(args[0]);
    //     if (isNaN(betAmount) || betAmount <= 0) {
    //       return message.channel.send(
    //         "Please specify a valid amount to bet on Blackjack."
    //       );
    //     }
    //     if (betAmount > currentBalance) {
    //       return message.channel.send("You don't have enough currency!");
    //     }
    //     const BLACKJACK_MAX_BET = 300000;
    //     if (betAmount > BLACKJACK_MAX_BET) {
    //       // Use the new MAX_BET
    //       return message.channel.send(
    //         `You cannot bet more than ${formatCurrency(
    //           BLACKJACK_MAX_BET
    //         )} on Blackjack.`
    //       );
    //     }
    //     await updateUserProfile(userId, -betAmount);

    //     const deck = createDeck();
    //     const playerHand = [drawCard(deck), drawCard(deck)];
    //     const dealerHand = [drawCard(deck), drawCard(deck)];
    //     const playerHandValue = calculateHandValue(playerHand);
    //     const dealerHandValue = calculateHandValue(dealerHand);

    //     activeBlackjackGames[userId] = {
    //       channelId: message.channel.id,
    //       gameMessage: null, // Will store the message object for editing
    //       deck: deck,
    //       playerHand: playerHand,
    //       dealerHand: dealerHand,
    //       betAmount: betAmount,
    //       playerTurn: true, // It's player's turn initially
    //       playerStand: false,
    //       // Player hasn't stood yet
    //     };
    //     let statusMessage = "";
    //     let gameOver = false;
    //     let finalWinner = null;
    //     let revealDealerImmediately = false;
    //     if (playerHandValue.isBlackjack && dealerHandValue.isBlackjack) {
    //       statusMessage = "Both you and the dealer got Blackjack! It's a Push!";
    //       finalWinner = "push";
    //       gameOver = true;
    //       revealDealerImmediately = true;
    //     } else if (playerHandValue.isBlackjack) {
    //       statusMessage = "Blackjack! You win!";
    //       finalWinner = "player";
    //       gameOver = true;
    //       revealDealerImmediately = true;
    //     } else if (dealerHandValue.isBlackjack) {
    //       statusMessage = "Dealer got Blackjack! You lose!";
    //       finalWinner = "dealer";
    //       gameOver = true;
    //       revealDealerImmediately = true;
    //     }
    //     const initialGameEmbed = getBlackjackEmbed(
    //       activeBlackjackGames[userId],
    //       message.author,
    //       false,
    //       statusMessage,
    //       revealDealerImmediately
    //     ); // Dealer card hidden

    //     const sentGameMessage = await message.channel.send({
    //       embeds: [initialGameEmbed],
    //       components: initialGameEmbed.components,
    //     });
    //     activeBlackjackGames[userId].gameMessage = sentGameMessage;

    //     if (gameOver) {
    //       await handleBlackjackPayout(
    //         userId,
    //         finalWinner,
    //         activeBlackjackGames[userId].betAmount,
    //         sentGameMessage,
    //         statusMessage
    //       );
    //       delete activeBlackjackGames[userId]; // Clear game state
    //     }

    //     return;
    //   } else if (commandName === "removeuser" || commandName === "deleteuser") {
    //     // --- 1. Owner-Only Check (CRITICAL) ---
    //     if (message.author.id !== process.env.BOT_OWNER_ID) {
    //       return message.channel.send(
    //         "You do not have permission to use this command."
    //       );
    //     }

    //     // --- 2. Parse Target User ID ---
    //     let targetUser = message.mentions.users.first();
    //     let targetUserId;

    //     if (targetUser) {
    //       targetUserId = targetUser.id;
    //     } else if (args[0]) {
    //       // If not a mention, assume it's a raw ID
    //       targetUserId = args[0];
    //       try {
    //         // Try to fetch the user to get their tag for the confirmation message
    //         targetUser = await client.users.fetch(targetUserId);
    //       } catch (e) {
    //         targetUser = null; // ID not found on Discord
    //       }
    //     }

    //     // --- 3. Validate Target User ---
    //     if (!targetUserId || !targetUser) {
    //       return message.channel.send(
    //         "Please provide a user to remove (mention or ID)."
    //       );
    //     }

    //     // --- 4. Prevent Deleting Bot Itself or Other Bots (Optional but Recommended) ---
    //     if (targetUserId === client.user.id) {
    //       // Prevent deleting the bot's own record
    //       return message.channel.send(
    //         "Ah- sir... why are you removing my data :3"
    //       );
    //     }
    //     if (targetUser.bot) {
    //       return message.channel.send("Please spare my sibling bot's data...");
    //     }
    //     if (targetUserId === message.author.id) {
    //       // Prevent user from deleting their own record via this command
    //       return message.channel.send(
    //         "I am not at the level to remove your data sir."
    //       );
    //     }

    //     // --- 5. Call deleteUser Function ---
    //     const userWasDeleted = await deleteUser(targetUserId);

    //     // --- 6. Send Confirmation ---
    //     if (userWasDeleted) {
    //       return message.channel.send(
    //         `Successfully removed **${
    //           targetUser.tag || targetUserId
    //         }** from the database.`
    //       );
    //     } else {
    //       return message.channel.send(
    //         `User **${
    //           targetUser.tag || targetUserId
    //         }** was not found in the database.`
    //       );
    //     }
    //   }
    //   return;
    // } //messageCreate bracket

    // // --- Gemini AI Integration ---
    // // Corrected: 'else' cannot have a condition, must be 'else if'
    // else if (message.mentions.has(client.user.id)) {
    //   // Extract the message content after the bot's mention
    //   const prompt = message.content
    //     .replace(new RegExp(`<@${client.user.id}>`), "")
    //     .trim();

    //   if (!prompt) {
    //     return message.channel.send(
    //       // Changed to channel.send for consistency
    //       "Hello! How can I help you today? Please ask me a question after mentioning me."
    //     );
    //   }

    //   try {
    //     await message.channel.sendTyping();
    //     const result = await model.generateContent(prompt);
    //     const response = await result.response;
    //     const text = response.text();

    //     message.channel.send(text); // Changed to channel.send for consistency
    //   } catch (error) {
    //     console.error("Error interacting with Gemini API:", error);
    //     message.channel.send(
    //       // Changed to channel.send for consistency
    //       "Sorry, I encountered an error trying to process that. Please try again later."
    //     );
    //   }
  }
});
module.exports = {
  checkExpiredRoles,
};
client.login(process.env.TOKEN);
