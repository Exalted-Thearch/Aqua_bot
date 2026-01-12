require("dotenv").config();
const stringSimilarity = require("string-similarity");
const { GoogleGenerativeAI } = require("@google/generative-ai");

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
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const axios = require("axios");
const fs = require("node:fs");
const path = require("node:path");
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
let forumCache = [];
let lastCacheUpdate = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[WARN] ${file} missing data or execute`);
  }
}
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
function simpleSimilarity(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = [];
  const bigramsB = [];
  for (let i = 0; i < a.length - 1; i++) bigramsA.push(a.substring(i, i + 2));
  for (let i = 0; i < b.length - 1; i++) bigramsB.push(b.substring(i, i + 2));

  let intersections = 0;
  for (const gramA of bigramsA) {
    const index = bigramsB.indexOf(gramA);
    if (index > -1) {
      intersections++;
      bigramsB.splice(index, 1);
    }
  }
  return (
    (2.0 * intersections) /
    (bigramsA.length + bigramsB.length + 2 * intersections)
  );
}
// --- HELPER: FETCH FORUM POSTS (UNLIMITED VERSION) ---
async function fetchAllForumPosts(guild) {
  const now = Date.now();

  // 1. Return cached data if valid
  if (forumCache.length > 0 && now - lastCacheUpdate < CACHE_DURATION) {
    console.log("⚡ Using cached forum posts");
    return forumCache;
  }

  console.log("🔄 Fetching ALL forum posts (this may take a moment)...");

  const channels = await guild.channels.fetch();
  let allForumPosts = [];
  const forumChannels = channels.filter((channel) => channel.type === 15);

  // 2. Process each forum channel
  await Promise.all(
    forumChannels.map(async (channel) => {
      try {
        // A. Get Active Threads (Always instant)
        const active = await channel.threads.fetchActive();
        let channelThreads = [...active.threads.values()];

        // B. Get Archived Threads (LOOP to get ALL of them)
        let lastThreadId = null;
        let hasMore = true;

        while (hasMore) {
          const options = { limit: 100 };
          if (lastThreadId) options.before = lastThreadId;

          // Fetch the next batch of 100
          const archived = await channel.threads.fetchArchived(options);
          const fetchedThreads = [...archived.threads.values()];

          if (fetchedThreads.length > 0) {
            channelThreads.push(...fetchedThreads);
            // Prepare for next loop: grab the ID of the oldest thread we just found
            lastThreadId = fetchedThreads[fetchedThreads.length - 1].id;
          }

          // If we got fewer than 100, we have reached the end
          if (fetchedThreads.length < 100) {
            hasMore = false;
          }
        }

        // C. Tag and Add to List
        channelThreads.forEach((t) => (t.parentName = channel.name));
        allForumPosts = allForumPosts.concat(channelThreads);
        console.log(
          `📚 Fetched ${channelThreads.length} threads from ${channel.name}`
        );
      } catch (err) {
        console.warn(`⚠️ Error fetching ${channel.name}:`, err.message);
      }
    })
  );

  // 3. Update Cache
  forumCache = allForumPosts;
  lastCacheUpdate = now;

  console.log(`✅ Total Cached: ${allForumPosts.length} epubs.`);
  return allForumPosts;
}
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
  console.log("Database initialized and ready.");

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

function parseDuration(input) {
  const match = input.match(/^(\d+)\s*(m|min|h|d|w|mon|y)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const units = {
    m: { ms: 60 * 1000, label: "minute" },
    min: { ms: 60 * 1000, label: "minute" },
    h: { ms: 60 * 60 * 1000, label: "hour" },
    d: { ms: 24 * 60 * 60 * 1000, label: "day" },
    w: { ms: 7 * 24 * 60 * 60 * 1000, label: "week" },
    mon: { ms: 30 * 24 * 60 * 60 * 1000, label: "month" },
    y: { ms: 365 * 24 * 60 * 60 * 1000, label: "year" },
  };

  const data = units[unit];
  if (!data) return null;

  return {
    ms: value * data.ms,
    text: `${value} ${data.label}${value > 1 ? "s" : ""}`,
  };
}

client.on("interactionCreate", async (interaction) => {
  // Handle Chat Input Commands (Slash Commands)
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }

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
          content: "You already have a role. Use `/role`.",
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
      if (lastUsed && Date.now() - lastUsed < 30000) {
        const remaining = (30 - (Date.now() - lastUsed) / 1000).toFixed(1);
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
          `<:edit:1459490116585390156> **Role Edited**: ${
            interaction.user
          } - ${changes.join(", ")}`
        );
      } catch (e) {
        await interaction.editReply(`Error: ${e.message}`);
      }
    }
  }
  // --- COMMAND: GRANT EXCEPTION ---
  else if (commandName === "grant_exception") {
    const targetUser = interaction.options.getUser("user");
    const durationInput = interaction.options.getString("duration");

    const parsed = parseDuration(durationInput);
    if (!parsed) {
      return interaction.reply({
        content:
          "<:close:1435556235691954216> Invalid duration. Use: 1m, 1h, 1d, 1w, 1mon, 1y",
        ephemeral: true,
      });
    }

    const expiry = Date.now() + parsed.ms;
    try {
      await db.run(
        `INSERT INTO user_roles(user_id, role_id, is_temp, expiry_date) 
        VALUES (?, NULL, 1, ?)
        ON CONFLICT(user_id)
        DO UPDATE SET is_temp = 1, expiry_date = ?`,
        [targetUser.id, expiry, expiry]
      );

      await interaction.reply(
        `Exception granted to ${targetUser} for **${durationInput}**`
      );
    } catch (err) {
      console.error("Grant exception failed", err);
      await interaction.reply({
        content: "Failed to grant exception.",
        ephemeral: true,
      });
    }
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
        content:
          "<:close:1435556235691954216> I cannot assign this role due to role hierarchy or permissions.",
        ephemeral: true,
      });
    }

    if (!targetUser.premiumSince) {
      return interaction.reply({
        content:
          "<:alert:1435556816267247738> The roles can only be assigned to boosters.",
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

      const embed = new EmbedBuilder()
        .setColor(0x57f287) // Discord green
        .setDescription(
          `<a:correct:1459492234834739368> Assigned ${targetRole} to ${targetUser} (booster role).`
        );

      await interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    } catch (e) {
      console.error("Assign role error:", e);

      if (!interaction.replied) {
        await interaction.reply(
          `<:close:1435556235691954216> Failed to assign ${targetRole} to ${targetUser}.`
        );
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
      await db.run(
        "UPDATE user_roles SET expiry_date = NULL WHERE user_id = ? AND is_temp = 1",
        [newMember.id]
      );
      return;
    }

    // User stopped boosting
    if (wasBooster && !isBooster) {
    
      const record = await db.get(
        "SELECT * FROM user_roles WHERE user_id = ?",
        [newMember.id]
      );

      // No record → nothing to do
      if (!record) return;

      
      if (record.is_temp === 1) {
        await db.run(
          "UPDATE user_roles SET expiry_date = ? WHERE user_id = ? AND is_temp = 1",
          [Date.now() + 24 * 60 * 60 * 1000, newMember.id]
        );
        return;
      }
    }
    } catch (error) {
      console.error("Error handling boost state change:", error);
    }
});
// --- BACKGROUND TASK ---
async function checkExpiredRoles() {
  try {
    console.log("Running expiry sweep at", new Date().toISOString());
    const now = Date.now();
    const expired = await db.all(
      "SELECT * FROM user_roles WHERE is_temp = 1 AND expiry_date < ?",
      [now]
    );

     if (!expired.length) {
      console.log("Expiry sweep ran — nothing expired");
      return;
    }
    // const GUILD_ID = process.env.NEXUS_SERVER;
    const guild = client.guilds.cache.get(process.env.NEXUS_SERVER);
    if (!guild) {
      console.error("Server not found for expiry check");
      return;
    }
    for (const row of expired) {
      try {
        // SAFETY: If user is boosting again, cancel expiry
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member?.premiumSince) {
          await db.run(
            "UPDATE user_roles SET expiry_date = NULL WHERE user_id = ?",
            [row.user_id]
          );
          continue;
        }

        // Role may not exist (exception-only)
        if (row.role_id) {
          const role = guild.roles.cache.get(row.role_id);

          if (role) {
            if (!role.editable) {
              console.warn(
                `Cannot delete expired role ${row.role_id} (permission issue)`
              );
              continue;
            }
            await role.delete("Temporary role expired");
          }
        }

        await db.run(
          "DELETE FROM user_roles WHERE user_id = ?",
          [row.user_id]
        );
      } catch (innerErr) {
        console.error(
          `Error processing expired role for user ${row.user_id}:`,
          innerErr
        );
      }
    }
    console.log(
      `Expiry sweep completed — ${expired.length} record(s) processed`
    );
  } catch (err) {
    console.error("Expired role sweep error:", err);
  }
}
setInterval(checkExpiredRoles,6 * 60 * 60 * 1000);
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // --- Start Prefix Command Handling ---
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // --- SEARCH COMMAND ---
    if (commandName === "search" || commandName === "find") {
      // Define search constants
      const SEARCH_CHANNEL_ID = String(process.env.SEARCH_CHANNEL_ID).trim();
      const SIMILARITY_THRESHOLD = 0.4;
      // A. Guild Check - MUST be first for this command
      if (!message.guild)
        return message.channel.send(
          `<:alert:1435556816267247738> Server only.`
        );

      // B. Restrict Channel Check
      if (message.channel.id !== SEARCH_CHANNEL_ID)
        return message.channel.send(
          `<:alert:1435556816267247738> Command only works in <#${SEARCH_CHANNEL_ID}>`
        );

      // C. Prepare the Query
      const query = args.join(" ").trim();
      if (!query)
        return message.channel.send(
          `<:alert:1435556816267247738> Usage: \`${prefix}find Novel_Name\``
        );
      let searchMsg = null;
      // D. Execute Search Logic
      try {
        searchMsg = await message.channel.send(
          `<:search:1435556273373581364> Searching Epub...`
        );

        const currentData = await fetchAllForumPosts(message.guild);

        // Update our local reference to the global cache
        forumCache = currentData;
        if (!forumCache || forumCache.length === 0) {
          return searchMsg.edit(
            `<:close:1435556235691954216> No forum posts found in this server.`
          );
        }
        const normalizedQuery = query.toLowerCase();
        let exactMatch = null;
        let suggestions = [];
        const seenIds = new Set(); //Prevents duplicates
        for (const post of forumCache) {
          if (!post.name) continue;

          const normalizedPostName = post.name.toLowerCase().trim();
          if (normalizedPostName === normalizedQuery) {
            exactMatch = post;
            break;
          }
          // Use cached data
          if (seenIds.has(post.id)) continue;
          if (normalizedPostName.startsWith(normalizedQuery)) {
            suggestions.push({
              thread: post,
              score:
                0.9 +
                (normalizedQuery.length / normalizedPostName.length) * 0.1,
            });
            seenIds.add(post.id);
            continue;
          }
          if (normalizedPostName.includes(normalizedQuery)) {
            suggestions.push({
              thread: post,
              score:
                0.5 +
                (normalizedQuery.length / normalizedPostName.length) * 0.4,
            });
            seenIds.add(post.id);
            continue; // skip fuzzy
          }
          if (suggestions.length < 10) {
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
                suggestions.push({
                  thread: post,
                  score: similarityScore * 0.5,
                });
                seenIds.add(post.id);
              }
            }
          }
        }
        if (exactMatch) {
          const forumChannelName = exactMatch.parentName || "Unknown Forum";
          return searchMsg.edit({
            content: null,
            embeds: [
              new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle(`<a:correct:1459492234834739368> ${exactMatch.name}`)
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
                }**`
            )
            .join("\n");

          return searchMsg.edit({
            content: null,
            embeds: [
              new EmbedBuilder()
                .setColor(0x5799f3)
                .setTitle(
                  `<:alert:1435556816267247738> No exact match for "${query}"`
                )
                .setDescription(`Did you mean:\n\n${list}`)
                .setFooter({ text: `Searched ${forumCache.length} epubs` }),
            ],
          });
        }

        return searchMsg.edit(
          `<:close:1435556235691954216> Sorry, no epub found matching **"${query}"**.`
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

      forumCache = [];
      lastCacheUpdate = 0;

      const msg = await message.channel.send(
        "<a:loading:1448687462800035840> Refreshing forum posts cache..."
      );
      await fetchAllForumPosts(message.guild);
      return msg.edit(
        `<a:correct:1459492234834739368> Cache refreshed! Found ${forumCache.length} forum posts.`
      );
    }
  }
});

module.exports = {
  checkExpiredRoles,
};
client.login(process.env.TOKEN);
