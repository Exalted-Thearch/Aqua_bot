require("dotenv").config();
const stringSimilarity = require("string-similarity");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const connectMongo = require("./database/mongo");
const UserRole = require("./database/UserRole");
const { logInfo, logError } = require("./utils/logger");
const {
  Client,
  ActivityType,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  PermissionFlagsBits,
  Routes,
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

const cooldowns = new Map();
// --- DATABASE SETUP ---
// --- DATABASE SETUP ---
// MongoDB handled by connectMongo

client.commands = new Collection();
const prefix = "!";
const { fetchAllForumPosts, clearForumCache } = require("./utils/forumUtils");

const commandsPath = path.join(__dirname, "commands");

// Simple recursive loader or flat loader that checks for folders
const commandItems = fs.readdirSync(commandsPath);

for (const item of commandItems) {
  const itemPath = path.join(commandsPath, item);
  const stat = fs.lstatSync(itemPath);

  if (stat.isDirectory()) {
    // Load commands from subdirectory
    const subFiles = fs
      .readdirSync(itemPath)
      .filter((file) => file.endsWith(".js"));

    for (const file of subFiles) {
      const filePath = path.join(itemPath, file);
      const command = require(filePath);
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
      } else {
        console.warn(`[WARN] ${file} in ${item} missing data or execute`);
      }
    }
  } else if (item.endsWith(".js")) {
    // Load command from root file
    const command = require(itemPath);
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`[WARN] ${item} missing data or execute`);
    }
  }
}

// --- HELPER: FETCH FORUM POSTS (UNLIMITED VERSION) ---

client.on("ready", async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}!`);

  await connectMongo();
  console.log("✅ MongoDB initialized and ready.");

  setInterval(async () => {
    try {
      const status = [
        // {
        //   name: "EveOfChaos",
        //   type: ActivityType.Streaming,
        //   url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        // },
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

      // Log Memory Usage
      // const used = process.memoryUsage().rss / 1024 / 1024;
      // console.log(
      //   `[Status Update] Memory Usage: ${Math.round(used * 100) / 100} MB`
      // );
    } catch (error) {
      console.error("Error updating status:", error);
    }
  }, 60000);
});

client.on("interactionCreate", async (interaction) => {
  // Handle Chat Input Commands (Slash Commands)
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (command) {
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      const errorMsg = {
        content: "There was an error while executing this command!",
        ephemeral: true,
      };

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMsg);
        } else {
          await interaction.reply(errorMsg);
        }
      } catch (sendError) {
        console.error("Could not send error response:", sendError.message);
      }
    }
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const wasBooster = !!oldMember.premiumSince;
  const isBooster = !!newMember.premiumSince;

  if (wasBooster === isBooster) return;
  //  User STARTED (or resumed) boosting

  try {
    if (!wasBooster && isBooster) {
      await UserRole.updateOne(
        { userId: newMember.id, isTemp: true },
        { expiryDate: null, isTemp: false },
      );
      return;
    }

    // User stopped boosting
    if (wasBooster && !isBooster) {
      const record = await UserRole.findOne({ userId: newMember.id });

      // No record → nothing to do
      if (!record) return;

      if (!record.isTemp) {
        await UserRole.updateOne(
          { userId: newMember.id },
          {
            isTemp: true,
            expiryDate: Date.now() + 24 * 60 * 60 * 1000,
          },
        );
        return;
      }
    }
  } catch (error) {
    console.error("Error handling boost state change:", error);
  }
});
// --- BACKGROUND TASK ---
// --- BACKGROUND TASK ---
async function checkExpiredRoles() {
  try {
    console.log("Running expiry sweep at", new Date().toISOString());
    const now = Date.now();
    const expired = await UserRole.find({
      isTemp: true,
      expiryDate: { $lt: now },
    });

    if (!expired.length) {
      console.log("Expiry sweep ran — nothing expired");
      return;
    }
    // const GUILD_ID = process.env.NEXUS_SERVER;
    // const GUILD_ID = process.env.NEXUS_SERVER;
    const guild = client.guilds.cache.get(process.env.NEXUS_SERVER);
    if (!guild) {
      console.error("Server not found for expiry check");
      return;
    }
    for (const row of expired) {
      try {
        // SAFETY: If user is boosting again, cancel expiry
        const member = await guild.members.fetch(row.userId).catch(() => null);
        if (member?.premiumSince) {
          await UserRole.updateOne(
            { userId: row.userId },
            { expiryDate: null, isTemp: false },
          );
          continue;
        }

        // Role may not exist (exception-only)
        if (row.roleId) {
          const role = guild.roles.cache.get(row.roleId);

          if (role) {
            if (!role.editable) {
              console.warn(
                `Cannot delete expired role ${row.roleId} (permission issue)`,
              );
              continue;
            }
            await role.delete("Temporary role expired");
            logInfo(
              client,
              `🗑️ **Role Expired**: Role **${role.name}** for user <@${row.userId}> has expired and was deleted.`,
            );
          }
        } else {
          logInfo(
            client,
            `🗑️ **Role Expired**: Expired record for user <@${row.userId}> removed (Role was already gone).`,
          );
        }

        await UserRole.deleteOne({ userId: row.userId });
      } catch (innerErr) {
        console.error(
          `Error processing expired role for user ${row.userId}:`,
          innerErr,
        );
      }
    }
    console.log(
      `Expiry sweep completed — ${expired.length} record(s) processed`,
    );
  } catch (err) {
    console.error("Expired role sweep error:", err);
  }
}
setInterval(checkExpiredRoles, 12 * 60 * 60 * 1000);
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // --- Start Prefix Command Handling ---
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // --- SEARCH COMMAND ---
    if (commandName === "search" || commandName === "find") {
      const SEARCH_CHANNEL_ID = String(process.env.SEARCH_CHANNEL_ID).trim();
      const SIMILARITY_THRESHOLD = 0.4;
      // A. Guild Check - MUST be first for this command
      if (!message.guild)
        return message.channel.send(
          `<:alert:1435556816267247738> Server only.`,
        );

      // B. Restrict Channel Check
      if (message.channel.id !== SEARCH_CHANNEL_ID)
        return message.channel.send(
          `<:alert:1435556816267247738> Command only works in <#${SEARCH_CHANNEL_ID}>`,
        );

      // C. Prepare the Query
      const query = args.join(" ").trim();
      if (!query)
        return message.channel.send(
          `<:alert:1435556816267247738> Usage: \`${prefix}find Novel_Name\``,
        );
      let searchMsg = null;
      // D. Execute Search Logic
      try {
        searchMsg = await message.channel.send(
          `<:search:1435556273373581364> Searching Epub...`,
        );

        const currentData = await fetchAllForumPosts(message.guild);

        if (!currentData || currentData.length === 0) {
          return searchMsg.edit(
            `<:close:1435556235691954216> No forum posts found in this server.`,
          );
        }

        const normalizedQuery = query.toLowerCase();
        let exactMatch = null;
        let suggestions = [];

        for (const post of currentData) {
          if (!post.name) continue;

          const normalizedPostName = post.name.toLowerCase().trim();

          // 1. Exact Match
          if (normalizedPostName === normalizedQuery) {
            exactMatch = post;
            break;
          }

          // 2. Starts With
          if (normalizedPostName.startsWith(normalizedQuery)) {
            suggestions.push({
              thread: post,
              score:
                0.9 +
                (normalizedQuery.length / normalizedPostName.length) * 0.1,
            });
            continue;
          }

          // 3. Includes
          if (normalizedPostName.includes(normalizedQuery)) {
            suggestions.push({
              thread: post,
              score:
                0.7 +
                (normalizedQuery.length / normalizedPostName.length) * 0.2,
            });
            continue;
          }

          // 4. Fuzzy Similarity
          const similarityScore = stringSimilarity.compareTwoStrings(
            normalizedPostName,
            normalizedQuery,
          );
          if (similarityScore > SIMILARITY_THRESHOLD) {
            suggestions.push({
              thread: post,
              score: similarityScore * 0.6,
            });
          }
        }

        if (exactMatch) {
          const forumChannelName = exactMatch.parentName || "Unknown Forum";
          return searchMsg.edit({
            content: null,
            embeds: [
              new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle(
                  `<a:checkmark:1461047015050973245> ${exactMatch.name}`,
                )
                .setURL(exactMatch.url)
                .setDescription(`Found in **${forumChannelName}**`),
            ],
          });
        }

        if (suggestions.length > 0) {
          suggestions.sort((a, b) => b.score - a.score);
          const topSuggestions = suggestions.slice(0, 5);

          const list = topSuggestions
            .map(
              (item, index) =>
                `${index + 1}. [${item.thread.name}](${item.thread.url}) • **${
                  item.thread.parentName
                }**`,
            )
            .join("\n");

          return searchMsg.edit({
            content: null,
            embeds: [
              new EmbedBuilder()
                .setColor(0x5799f3)
                .setTitle(
                  `<:alert:1435556816267247738> No exact match for "${query}"`,
                )
                .setDescription(`Did you mean:\n\n${list}`)
                .setFooter({ text: `Searched ${currentData.length} epubs` }),
            ],
          });
        }

        return searchMsg.edit(
          `<:close:1435556235691954216> Sorry, no epub found matching **"${query}"**.`,
        );
      } catch (error) {
        console.error("Search command error:", error);
        return message.channel.send(
          "<:close:1435556235691954216> An error occurred while searching for epub",
        );
      }
    } else if (commandName === "refresh" || commandName === "cache") {
      const isAdmin = message.member.permissions.has("Administrator");
      const hasRole = message.member.roles.cache.has("1366687926330851418");
      if (!isAdmin && !hasRole) {
        return message.channel.send(
          `<:alert:1435556816267247738> Only administrators can refresh the cache.`,
        );
      }

      clearForumCache();

      const msg = await message.channel.send(
        "<a:loading:1448687462800035840> Refreshing forum posts cache...",
      );
      const posts = await fetchAllForumPosts(message.guild, true);
      return msg.edit(
        `<a:correct:1459492234834739368> Cache refreshed! Found ${posts.length} forum posts.`,
      );
    }
  }
});

// --- GLOBAL ERROR HANDLERS ---

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  logError(
    client,
    reason instanceof Error ? reason : new Error(String(reason)),
    "Unhandled Rejection",
  );
});

process.on("uncaughtException", async (error) => {
  console.error("Uncaught Exception:", error);
  await logError(client, error, "Uncaught Exception (Fatal)");
  // Give it a moment to send the embed, then exit
  setTimeout(() => process.exit(1), 5000);
});

async function handleShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  // User requested to ONLY log crashes to Discord, not manual shutdowns.
  // We just clean up and exit here.
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

client.login(process.env.TOKEN);
