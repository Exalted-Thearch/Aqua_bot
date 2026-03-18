const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const UserRole = require("../../database/UserRole");
const { logInfo } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("assign_role")
    .setDescription("Mod: Assign an existing role to a user")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator ||
        PermissionFlagsBits.ManageGuild ||
        PermissionFlagsBits.ManageRoles,
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("The user").setRequired(true),
    )
    .addRoleOption((o) =>
      o.setName("role").setDescription("The role to assign").setRequired(true),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getMember("user");
    const targetRole = interaction.options.getRole("role");

    if (!targetRole.editable) {
      return interaction.reply({
        content:
          "<a:crossmark:1461047109536055594> I cannot assign this role due to role hierarchy or permissions.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!targetUser.premiumSince) {
      return interaction.reply({
        content:
          "<:alert:1435556816267247738> The roles can only be assigned to boosters.",
        flags: MessageFlags.Ephemeral,
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
        { upsert: true },
      );

      const embed = new EmbedBuilder()
        .setColor(0x57f287) // Discord green
        .setDescription(
          `<a:checkmark:1461047015050973245> Assigned ${targetRole} to ${targetUser} (booster role).`,
        );

      await interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      logInfo(
        interaction.client,
        `🛡️ **Role Assigned**: ${interaction.user} assigned ${targetRole.id} to ${targetUser}`,
      );
    } catch (e) {
      console.error("Assign role error:", e);

      if (!interaction.replied) {
        await interaction.reply(
          `<a:crossmark:1461047109536055594> Failed to assign ${targetRole} to ${targetUser}.`,
        );
      }
    }
  },
};
