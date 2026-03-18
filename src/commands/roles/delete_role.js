const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const UserRole = require("../../database/UserRole");
const { logInfo, logError } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delete_role")
    .setDescription("Delete a user's custom role and data record")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator ||
        PermissionFlagsBits.ManageGuild ||
        PermissionFlagsBits.ManageRoles,
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("The user").setRequired(true),
    ),

  async execute(interaction) {
    // 1. Permission Check
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
      !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
      !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)
    ) {
      return interaction.reply({
        content:
          "<:alert:1435556816267247738> You do not have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser("user");
    const record = await UserRole.findOne({ userId: targetUser.id });

    if (!record || !record.roleId) {
      return interaction.reply({
        content: `<a:crossmark:1461047109536055594> **${targetUser.tag}** does not have a custom role.`,
        flags: MessageFlags.Ephemeral,
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
            `${interaction.user.tag} has deleted a custom role`,
          );
        } else {
          // We can still delete the DB record if the role is gone or uneditable, but let's warn
          await interaction.followUp({
            content:
              "⚠️ I could not delete the role from Discord (missing permissions?), but I will remove the database record.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      await UserRole.deleteOne({ userId: targetUser.id });

      const embed = new EmbedBuilder()
        .setDescription(
          `<a:checkmark:1461047015050973245> Deleted role **${roleName}** and data for ${targetUser}.`,
        )
        .setColor(0x57f287);

      await interaction.editReply({ content: null, embeds: [embed] });
      logInfo(
        interaction.client,
        `🗑️ **Role Deleted**: ${interaction.user} deleted role **${roleName}** belonging to ${targetUser}`,
      );
    } catch (e) {
      console.error("Role Delete Error:", e);
      await interaction.editReply(`Error: ${e.message}`);
      logError(interaction.client, e, `Role Delete - ${interaction.user.tag}`);
    }
  },
};
