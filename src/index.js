require("dotenv").config();
const stringSimilarity = require("string-similarity");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const connectMongo = require("./database/mongo");
const UserRole = require("./database/UserRole");
const {
  Client,
  ActivityType,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  PermissionFlagsBits,
  Routes,
} = require("discord.js");
const axios = require("axios");
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
let forumCache = [];
let lastCacheUpdate = 0;
const CACHE_DURATION = 2 * 24 * 60 * 60 * 1000;

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[WARN] ${file} missing data or execute`);
  }
}

// --- HELPER: FETCH FORUM POSTS (UNLIMITED VERSION) ---
async function fetchAllForumPosts(guild) {
  const now = Date.now();

  // 1. Return cached data if valid
  if (forumCache.length > 0 && now - lastCacheUpdate < CACHE_DURATION) {
    return forumCache;
  }

  console.log("🔄 Fetching ALL forum posts (this may take a moment)...");

  const channels = await guild.channels.fetch();
  const forumChannels = channels.filter((channel) => channel.type === 15);

  let allForumPosts = [];
  const seenIds = new Set();

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

          // Fetch the next batch of 100 archived threads
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

        // C. Tag and Add to List, avoiding duplicates
        for (const thread of channelThreads) {
          if (!seenIds.has(thread.id)) {
            thread.parentName = channel.name;
            allForumPosts.push(thread);
            seenIds.add(thread.id);
          }
        }

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

async function getLogChannel(envVarName) {
  const guildId = process.env.TEST_SERVER;
  const channelId = process.env[envVarName];

  if (!guildId || !channelId) {
    console.warn(`Missing env vars: TEST_SERVER or ${envVarName}`);
    return null;
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return null;
    return await guild.channels.fetch(channelId);
  } catch (e) {
    console.error(`Failed to fetch log channel ${envVarName}:`, e);
    return null;
  }
}

async function logInfo(message) {
  const channel = await getLogChannel("INFO_LOG");
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setDescription(message)
    .setColor("#3498db") // Blue
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error("Failed to send INFO log:", e);
  }
}

async function logError(error, context = "General") {
  const channel = await getLogChannel("ERROR_LOG");
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`❌ Error: ${context}`)
    .setDescription(
      `**Message**: ${error.message}\n\`\`\`${
        error.stack ? error.stack.slice(0, 1000) : "No stack"
      }\`\`\``
    )
    .setColor("#e74c3c") // Red
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error("Failed to send ERROR log:", e);
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

function formatDiscordError(error) {
  if (error.message.includes("Invalid Form Body")) {
    if (error.message.includes("name[BASE_TYPE_MAX_LENGTH]")) {
      return "Role name is too long (max 100 characters).";
    }
    // Add other specific mappings here if needed
  }
  return error.message;
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
  if (command) {
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
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
      const record = await UserRole.findOne({ userId: interaction.user.id });
      const hasPerms = isBooster || (record && record.isTemp);

      if (!hasPerms)
        return interaction.reply({
          content: "You must be a Server Booster to use this command.",
          ephemeral: true,
        });
      if (record && record.roleId)
        return interaction.reply({
          content: "You already have a role. Use `/role edit`.",
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
          await UserRole.updateOne(
            { userId: interaction.user.id },
            { roleId: newRole.id }
          );
        } else {
          await UserRole.create({
            userId: interaction.user.id,
            roleId: newRole.id,
          });
        }

        let msg = `Role ${newRole} created!`;
        if (colorResult.warning) msg += ` (${colorResult.warning})`;

        await interaction.editReply(msg);
        // logAction(
        //   interaction.guild,
        //   `✅ **Role Created**: ${interaction.user} created **${name}**`
        // );
        logInfo(
          `✅ **Role Created**: ${interaction.user} created **${name}** in ${interaction.guild.name}`
        );
      } catch (e) {
        const friendyError = formatDiscordError(e);
        await interaction.editReply(`Error: ${friendyError}`);
        logError(e, `Role Create - ${interaction.user.tag}`);
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
      const record = await UserRole.findOne({ userId: interaction.user.id });
      if (!record || !record.roleId)
        return interaction.reply({
          content: "No custom role found.",
          ephemeral: true,
        });

      const role = interaction.guild.roles.cache.get(record.roleId);
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
      let activeChanges = 0;
      let replyMsg = "Role updated!";

      try {
        // Apply Changes
        if (newName) {
          await role.setName(newName);
          changes.push(`Name: **${newName}**`);
          activeChanges++;
          replyMsg = `You have changed your name to **${newName}**`;
        }

        // Color Logic
        if (newColor || newSecondary) {
          const primaryToUse = newColor || role.hexColor;
          const secondaryToUse = newSecondary;

          const result = await updateRoleColors(
            interaction.guild.id,
            role.id,
            primaryToUse,
            secondaryToUse
          );

          if (result.warning) {
            changes.push(
              `Color: **${primaryToUse}** (Solid - ${result.warning})`
            );
          } else {
            changes.push(
              newSecondary
                ? `Color: Gradient (**${primaryToUse}** & **${secondaryToUse}**)`
                : `Color: **${primaryToUse}**`
            );
          }
          activeChanges++;
          replyMsg = `You have updated your role color to **${
            secondaryToUse
              ? `${primaryToUse} & ${secondaryToUse}`
              : primaryToUse
          }**`;
        }

        if (newIcon) {
          const check = await validateImage(newIcon.url);
          if (!check.valid)
            return interaction.editReply(`Icon Error: ${check.error}`);

          await role.setIcon(newIcon.url);
          changes.push("Role icon updated");
          activeChanges++;
        }

        if (activeChanges > 1) {
          replyMsg = "Role updated!";
        }

        cooldowns.set(interaction.user.id, Date.now());
        await interaction.editReply(replyMsg);

        if (activeChanges > 0) {
          logInfo(
            `<:edit:1459490116585390156> **Role Edited**: ${
              interaction.user
            } edited their role:\n- ${changes.join("\n- ")}`
          );
        }
      } catch (e) {
        await interaction.editReply(`Error: ${formatDiscordError(e)}`);
        logError(e, `Role Edit - ${interaction.user.tag}`);
      }
    }

    // --- COMMAND: DELETE ROLE ---
  } else if (commandName === "delete_role") {
    // 1. Permission Check
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
      !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
      !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)
    ) {
      return interaction.reply({
        content:
          "<:alert:1435556816267247738> You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser("user");
    const record = await UserRole.findOne({ userId: targetUser.id });

    if (!record || !record.roleId) {
      return interaction.reply({
        content: `<a:crossmark:1461047109536055594> **${targetUser.tag}** does not have a custom role.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const role = interaction.guild.roles.cache.get(record.roleId);
      let roleName = "Unknown Role";

      if (role) {
        roleName = role.name;
        if (role.editable) {
          await role.delete(
            `${interaction.user.tag} has deleted a custom role`
          );
        } else {
          // We can still delete the DB record if the role is gone or uneditable, but let's warn
          await interaction.followUp({
            content:
              "⚠️ I could not delete the role from Discord (missing permissions?), but I will remove the database record.",
            ephemeral: true,
          });
        }
      }

      await UserRole.deleteOne({ userId: targetUser.id });

      const embed = new EmbedBuilder()
        .setDescription(
          `<a:checkmark:1461047015050973245> Deleted role **${roleName}** and data for ${targetUser}.`
        )
        .setColor(0x57f287);

      await interaction.editReply({ content: null, embeds: [embed] });
      logInfo(
        `🗑️ **Role Deleted**: ${interaction.user} deleted role **${roleName}** belonging to ${targetUser}`
      );
    } catch (e) {
      console.error("Role Delete Error:", e);
      await interaction.editReply(`Error: ${e.message}`);
      logError(e, `Role Delete - ${interaction.user.tag}`);
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
          "<a:crossmark:1461047109536055594> Invalid duration. Use: 1m, 1h, 1d, 1w, 1mon, 1y",
        ephemeral: true,
      });
    }

    const expiry = Date.now() + parsed.ms;

    // Defer to prevent timeout
    await interaction.deferReply();

    try {
      await UserRole.updateOne(
        { userId: targetUser.id },
        {
          $set: { isTemp: true, expiryDate: expiry },
          $setOnInsert: { roleId: null },
        },
        { upsert: true }
      );

      await interaction.editReply(
        `Exception granted to ${targetUser} for **${parsed.text}**`
      );
    } catch (err) {
      console.error("Grant exception failed", err);
      // If we deferred, we must editQuery
      await interaction.editReply({
        content: "Failed to grant exception.",
      });
    }

    logInfo(
      `🛡️ **Exception Granted**: ${interaction.user} granted exception to ${targetUser} for **${parsed.text}**`
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
        content:
          "<a:crossmark:1461047109536055594> I cannot assign this role due to role hierarchy or permissions.",
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

      await UserRole.updateOne(
        { userId: targetUser.id },
        {
          roleId: targetRole.id,
          isTemp: false,
          expiryDate: null,
        },
        { upsert: true }
      );

      const embed = new EmbedBuilder()
        .setColor(0x57f287) // Discord green
        .setDescription(
          `<a:checkmark:1461047015050973245> Assigned ${targetRole} to ${targetUser} (booster role).`
        );

      await interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      logInfo(
        `🛡️ **Role Assigned**: ${interaction.user} assigned ${targetRole.id} to ${targetUser}`
      );
    } catch (e) {
      console.error("Assign role error:", e);

      if (!interaction.replied) {
        await interaction.reply(
          `<a:crossmark:1461047109536055594> Failed to assign ${targetRole} to ${targetUser}.`
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
      await UserRole.updateOne(
        { userId: newMember.id, isTemp: true },
        { expiryDate: null, isTemp: false }
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
          }
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
            { expiryDate: null, isTemp: false }
          );
          continue;
        }

        // Role may not exist (exception-only)
        if (row.roleId) {
          const role = guild.roles.cache.get(row.roleId);

          if (role) {
            if (!role.editable) {
              console.warn(
                `Cannot delete expired role ${row.roleId} (permission issue)`
              );
              continue;
            }
            await role.delete("Temporary role expired");
            logInfo(
              `🗑️ **Role Expired**: Role **${role.name}** for user <@${row.userId}> has expired and was deleted.`
            );
          }
        } else {
          logInfo(
            `🗑️ **Role Expired**: Expired record for user <@${row.userId}> removed (Role was already gone).`
          );
        }

        await UserRole.deleteOne({ userId: row.userId });
      } catch (innerErr) {
        console.error(
          `Error processing expired role for user ${row.userId}:`,
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

        if (!currentData || currentData.length === 0) {
          return searchMsg.edit(
            `<:close:1435556235691954216> No forum posts found in this server.`
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
            normalizedQuery
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
                .setTitle(`<a:checkmark:1461047015050973245> ${exactMatch.name}`)
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
                .setFooter({ text: `Searched ${currentData.length} epubs` }),
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
    } else if (commandName === "refresh" || commandName === "cache") {
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
