const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const UwuUser = require("../../database/UwuUser");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("uwuify-list")
    .setDescription("List all currently uwuified users and easily remove them.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const users = await UwuUser.find();

      if (users.length === 0) {
        return interaction.editReply({
          content: "Nobody is currently being uwuified!",
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xffb6c1)
        .setTitle(`Uwuified Users List (${users.length})`);

      // Use a single Select Menu (Dropdown) instead of buttons
      const displayUsers = users.slice(0, 25);

      let description = "";
      for (let i = 0; i < displayUsers.length; i++) {
        const u = displayUsers[i];
        description += `${i + 1}. <@${u.userId}> (Added by: \`${u.addedBy}\`)\n`;
      }

      const {
        StringSelectMenuBuilder,
        StringSelectMenuOptionBuilder,
      } = require("discord.js");
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("remove_uwu_select")
        .setPlaceholder("Select one or multiple users")
        .setMinValues(1)
        .setMaxValues(displayUsers.length + 2)
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Select all")
            .setValue("all")
            .setEmoji("✅"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Cancel")
            .setValue("cancel")
            .setEmoji("❌"),
        );

      // We need user objects to get displayName if possible, but UwuUser only has userId.
      // We can fetch them or just use <@id> format. The image shows names though.
      // Let's try fetching the members to get their display names.
      for (let i = 0; i < displayUsers.length; i++) {
        const u = displayUsers[i];
        let displayName = `User ${u.userId}`;
        try {
          const member = await interaction.guild.members.fetch(u.userId);
          displayName =
            member ?
              `${member.displayName} | @${member.user.username}`
            : `<@${u.userId}>`;
        } catch (e) {
          // Member might have left the server
          displayName = `<@${u.userId}>`;
        }

        selectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(`${i + 1}. ${displayName.replace(/<@|>/g, "")}`)
            .setDescription(u.userId)
            .setValue(u.userId),
        );
      }

      const actionRow = new ActionRowBuilder().addComponents(selectMenu);
      const components = [actionRow];

      if (users.length > 25) {
        description += `\n*...and ${users.length - 25} more limited by Discord API limits.*`;
      }

      embed.setDescription(description);

      return interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      console.error(error);
      return interaction.editReply({
        content: "There was an error fetching the list.",
      });
    }
  },
};
