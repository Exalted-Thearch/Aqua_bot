const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const UserRole = require("../../database/UserRole");
const { logInfo, logError } = require("../../utils/logger");
const { parseDuration } = require("../../utils/roleUtils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("grant_exception")
    .setDescription(
      "Admin: Allow non-booster to create a role for certain time",
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator || PermissionFlagsBits.ManageGuild,
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("The user").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("duration")
        .setDescription("You can use 1min, 1h, 1d, 1w, 1mon, 1y")
        .setRequired(true),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const durationInput = interaction.options.getString("duration");

    const parsed = parseDuration(durationInput);
    if (!parsed) {
      return interaction.reply({
        content:
          "<a:crossmark:1461047109536055594> Invalid duration. Use: 1m, 1h, 1d, 1w, 1mon, 1y",
        flags: MessageFlags.Ephemeral,
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
        { upsert: true },
      );

      await interaction.editReply(
        `Exception granted to ${targetUser} for **${parsed.text}**`,
      );
    } catch (err) {
      console.error("Grant exception failed", err);
      // If we deferred, we must editQuery
      await interaction.editReply({
        content: "Failed to grant exception.",
      });
    }

    logInfo(
      interaction.client,
      `🛡️ **Exception Granted**: ${interaction.user} granted exception to ${targetUser} for **${parsed.text}**`,
    );
  },
};
