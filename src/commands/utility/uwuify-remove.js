const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const UwuUser = require("../../database/UwuUser");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("uwuify-remove")
    .setDescription("Remove the uwuify effect from a user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option.setName("user")
        .setDescription("The user to remove")
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    
    if (target.id === interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
       return interaction.reply({ content: "Nice try! You cannot remove yourself from the uwuify silly! Maybe try asking other Mods to do it for you?", ephemeral: true });
    }

    await interaction.deferReply();

    try {
      const existingUser = await UwuUser.findOne({ userId: target.id });
      if (!existingUser) {
        return interaction.editReply({ content: `<a:crossmark:1461047109536055594> <@${target.id}> is not currently on the uwuify list.` });
      }

      await UwuUser.deleteOne({ userId: target.id });

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription(`<a:checkmark:1461047015050973245> Successfully removed <@${target.id}> from the **uwuify** list! They can speak normally again.`);

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      return interaction.editReply({ content: "<:close:1435556235691954216> There was an error while removing the user from the database." });
    }
  },
};
