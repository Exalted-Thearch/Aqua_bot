const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const MuteConfig = require("../../database/MuteConfig");
const { logInfo } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setmuterole")
    .setDescription("Mod: Set the mute role for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption((o) =>
      o
        .setName("role")
        .setDescription("The role to use as the mute role")
        .setRequired(true),
    ),

  async execute(interaction) {
    const targetRole = interaction.options.getRole("role");

    // Sanity: bot must be able to manage that role
    if (!targetRole.editable) {
      return interaction.reply({
        content:
          "<a:crossmark:1461047109536055594> I can't manage that role due to role hierarchy. Please move my role above it.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await MuteConfig.updateOne(
      { guildId: interaction.guild.id },
      {
        muteRoleId: targetRole.id,
        setBy: interaction.user.id,
        updatedAt: new Date(),
      },
      { upsert: true },
    );

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("Mute Role Set!")
      .setDescription(
        `The mute role has been set to ${targetRole}.\n\n` +
          `-# All future \`!mute\` & \`/mute\` actions will assign this role and strip all other manageable roles from the target user.`,
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    logInfo(
      interaction.client,
      `**Mute Role Set**: ${interaction.user} set the mute role to **${targetRole.name}** (\`${targetRole.id}\`) in **${interaction.guild.name}**`,
    );
  },
};
