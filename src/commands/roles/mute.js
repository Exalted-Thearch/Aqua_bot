const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
} = require("discord.js");
const MuteConfig = require("../../database/MuteConfig");
const MutedUser = require("../../database/MutedUser");
const { logInfo } = require("../../utils/logger");
const { parseDuration } = require("../../utils/roleUtils");

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

/** Format ms into a readable string like "2 hours 30 minutes". */
function formatDuration(ms) {
  if (!ms) return "Permanent";
  const parts = [];
  const d = Math.floor(ms / 86_400_000);
  if (d) parts.push(`${d} day${d > 1 ? "s" : ""}`);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (h) parts.push(`${h} hour${h > 1 ? "s" : ""}`);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (m) parts.push(`${m} minute${m > 1 ? "s" : ""}`);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (s) parts.push(`${s} second${s > 1 ? "s" : ""}`);
  return parts.join(" ") || "0 seconds";
}

// ─────────────────────────────────────────────────────────────
//  Core shared logic
// ─────────────────────────────────────────────────────────────

/**
 * Core mute logic — shared between slash and prefix handlers.
 * @param {{ guild, target, moderator, client, durationMs: number|null, reason: string }}
 * @returns {{ success: boolean, embed?: EmbedBuilder, error?: string }}
 */
async function executeMute({
  guild,
  target,
  moderator,
  client,
  durationMs,
  reason,
}) {
  // 1. Fetch mute role config
  const config = await MuteConfig.findOne({ guildId: guild.id });
  if (!config) {
    return {
      success: false,
      error:
        "No mute role is configured for this server. An admin must run `/setmuterole` first.",
    };
  }

  const muteRole = guild.roles.cache.get(config.muteRoleId);
  if (!muteRole) {
    return {
      success: false,
      error:
        "The configured mute role no longer exists. Please run `/setmuterole` again.",
    };
  }

  // 2. Already muted?
  const existing = await MutedUser.findOne({
    guildId: guild.id,
    userId: target.id,
  });
  if (existing) {
    return { success: false, error: `<@${target.id}> is already muted.` };
  }

  // 3. Collect all roles that can be removed
  const rolesToRemove = target.roles.cache.filter(
    (r) =>
      r.id !== guild.id && // skip @everyone
      r.id !== muteRole.id && // skip mute role itself
      r.editable, // bot can manage it
  );

  const savedRoleIds = rolesToRemove.map((r) => r.id);

  // Calculate new roles for the single batch API call
  const newRoleIds = target.roles.cache
    .filter((r) => r.id === guild.id || r.id === muteRole.id || !r.editable)
    .map((r) => r.id);

  if (!newRoleIds.includes(muteRole.id)) {
    newRoleIds.push(muteRole.id);
  }

  // 4. Apply changes in a single API call
  try {
    await target.roles.set(newRoleIds, `Muted by ${moderator.tag}`);
  } catch (err) {
    console.error("[Mute] Role mutation error:", err);
    return {
      success: false,
      error:
        "Failed to apply mute roles. Check the bot's role hierarchy and permissions.",
    };
  }

  // 5. Persist to DB
  const expiresAt = durationMs ? Date.now() + durationMs : null;
  await MutedUser.create({
    guildId: guild.id,
    userId: target.id,
    savedRoleIds,
    mutedBy: moderator.id,
    reason,
    expiresAt,
  });

  // 6. Build compact Components V2 response
  const durationLine =
    durationMs ?
      `> Duration: ${formatDuration(durationMs)}`
    : `> Duration: Permanent`;
  const reasonLine =
    reason !== "No reason provided" ? `\n> Reason: ${reason}` : "";

  const unsavedRoles = target.roles.cache
    .filter((r) => r.id !== guild.id && r.id !== muteRole.id && !r.editable)
    .map((r) => r.id);

  let rolesLine = "";
  if (unsavedRoles.length > 0) {
    rolesLine = `\n-# Could not remove: ${unsavedRoles.map((id) => `<@&${id}>`).join(", ")}`;
  } else if (savedRoleIds.length > 0) {
    rolesLine = `\n-# All ${savedRoleIds.length} roles successfully removed & saved.`;
  }

  const embed = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**<@${target.id}> muted!**\n${durationLine}${reasonLine}${rolesLine}`,
      ),
    );

  logInfo(
    client,
    `**Muted**: <@${moderator.id}> muted <@${target.id}> for **${formatDuration(durationMs)}** — ${reason}`,
  );

  return { success: true, embed };
}

/**
 * Core unmute logic — shared between slash and prefix handlers.
 * @param {{ guild, target, moderator, client, reason: string }}
 * @returns {{ success: boolean, embed?: EmbedBuilder, error?: string }}
 */
async function executeUnmute({ guild, target, moderator, client, reason }) {
  const config = await MuteConfig.findOne({ guildId: guild.id });
  const muteRoleId = config?.muteRoleId;

  const record = await MutedUser.findOne({
    guildId: guild.id,
    userId: target.id,
  });
  if (!record) {
    return { success: false, error: `<@${target.id}> is not currently muted.` };
  }

  // Calculate new roles for a single batch API call
  const newRoleIds = target.roles.cache
    .filter((r) => r.id !== muteRoleId)
    .map((r) => r.id);

  // Restore saved roles
  const restoredRoles = [];
  const failedRoles = [];

  for (const roleId of record.savedRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role || !role.editable) {
      failedRoles.push(roleId);
      continue;
    }
    if (!newRoleIds.includes(roleId)) {
      newRoleIds.push(roleId);
    }
    restoredRoles.push(roleId);
  }

  // Apply all role changes at once
  try {
    await target.roles.set(newRoleIds, `Unmuted by ${moderator.tag}`);
  } catch (err) {
    console.error("[Unmute] Role mutation error:", err);
    // If the batch update fails, all roles failed to restore
    failedRoles.push(...restoredRoles);
    restoredRoles.length = 0;
  }

  await MutedUser.deleteOne({ guildId: guild.id, userId: target.id });

  let rolesLine = "";
  if (failedRoles.length > 0) {
    rolesLine = `\n-# Could not restore: ${failedRoles.map((id) => `<@&${id}>`).join(", ")}`;
  }

  const reasonLine =
    reason !== "No reason provided" ? `\n> Reason: ${reason}` : "";

  const embed = new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `<a:checkmark:1461047015050973245> **<@${target.id}> unmuted!**${reasonLine}${rolesLine}`,
      ),
    );

  logInfo(
    client,
    `**Unmuted**: <@${moderator.id}> unmuted <@${target.id}> — ${reason}`,
  );

  return { success: true, embed };
}

// ─────────────────────────────────────────────────────────────
//  Guard helpers (reused by both slash modules)
// ─────────────────────────────────────────────────────────────
function hierarchyGuard(interaction, targetMember) {
  if (targetMember.id === interaction.user.id) {
    return "<a:crossmark:1461047109536055594> You cannot mute yourself.";
  }
  if (targetMember.id === interaction.client.user.id) {
    return "<a:crossmark:1461047109536055594> I cannot mute myself.";
  }
  if (
    targetMember.roles.highest.position >=
    interaction.member.roles.highest.position
  ) {
    return "<a:crossmark:1461047109536055594> You cannot mute someone with an equal or higher role.";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  /mute  slash command
// ─────────────────────────────────────────────────────────────
const muteCommand = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mod: Mute a user (removes all roles + assigns mute role)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("target").setDescription("User to mute").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("duration")
        .setDescription(
          "Duration: 10m | 2h | 1d | 1w (leave blank = permanent)",
        )
        .setRequired(false),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for mute").setRequired(false),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content:
          "<:alert:1435556816267247738> This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetMember = interaction.options.getMember("target");
    if (!targetMember) {
      return interaction.reply({
        content:
          "<:alert:1435556816267247738> Could not find that member in this server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const guardMsg = hierarchyGuard(interaction, targetMember);
    if (guardMsg) {
      return interaction.reply({
        content: guardMsg,
        flags: MessageFlags.Ephemeral,
      });
    }

    const durationStr = interaction.options.getString("duration");
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    let durationMs = null;
    if (durationStr) {
      const parsed = parseDuration(durationStr);
      if (!parsed) {
        return interaction.reply({
          content:
            "<:alert:1435556816267247738> Invalid duration format. Use `10m`, `2h`, `1d`, `1w`, etc.",
          flags: MessageFlags.Ephemeral,
        });
      }
      durationMs = parsed.ms;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await executeMute({
      guild: interaction.guild,
      target: targetMember,
      moderator: interaction.user,
      client: interaction.client,
      durationMs,
      reason,
    });

    if (!result.success) return interaction.editReply(result.error);
    return interaction.editReply({
      components: [result.embed],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};

// ─────────────────────────────────────────────────────────────
//  /unmute  slash command
// ─────────────────────────────────────────────────────────────
const unmuteCommand = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Mod: Unmute a user (restores their roles)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("target").setDescription("User to unmute").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Reason for unmute")
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content:
          "<:alert:1435556816267247738> This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetMember = interaction.options.getMember("target");
    if (!targetMember) {
      return interaction.reply({
        content:
          "<:alert:1435556816267247738> Could not find that member in this server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const reason =
      interaction.options.getString("reason") || "No reason provided";

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await executeUnmute({
      guild: interaction.guild,
      target: targetMember,
      moderator: interaction.user,
      client: interaction.client,
      reason,
    });

    if (!result.success) return interaction.editReply(result.error);
    return interaction.editReply({
      components: [result.embed],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};

// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────

// Primary export is the /mute command (loaded by the command handler)
// /unmute is exported as a sibling and registered separately in register-command.js
module.exports = {
  // /mute slash command
  data: muteCommand.data,
  execute: muteCommand.execute,

  // /unmute slash command (exported for the loader to also register)
  unmuteCommand,

  // Core logic exposed for prefix handler & expiry sweep in index.js
  executeMute,
  executeUnmute,
  parseDuration, // re-export so index.js doesn't need a separate import
};
