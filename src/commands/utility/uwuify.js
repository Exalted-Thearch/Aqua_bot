const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const UwuUser = require("../../database/UwuUser");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("uwuify")
    .setDescription("Force a user's messages to be uwuified automatically! <3")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((option) =>
      option.setName("user")
        .setDescription("The user to uwuify")
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getMember("user");
    
    if (!target) {
      return interaction.reply({ content: "I couldn't find that user in this server. T-T", ephemeral: true });
    }

    // Role Hierarchy Checks
    const botMember = interaction.guild.members.me;
    
    // Check if target is Server Owner
    if (target.id === interaction.guild.ownerId) {
      return interaction.reply({ content: "You cannot uwuify the server owner, silly!", ephemeral: true });
    }

    // Check if target's role is higher or equal to bot's role
    if (target.roles.highest.position >= botMember.roles.highest.position) {
      return interaction.reply({ content: "I cannot uwuify this user because their highest role is equal to or higher than mine lah!", ephemeral: true });
    }

    await interaction.deferReply();

    try {
      const existingUser = await UwuUser.findOne({ userId: target.id });
      if (existingUser) {
        return interaction.editReply({ content: `<@${target.id}> is already being uwuified! (  •̀ - •́  )` });
      }

      await UwuUser.create({
        userId: target.id,
        addedBy: interaction.user.tag,
      });

      const embed = new EmbedBuilder()
        .setColor(0xffb6c1)
        .setDescription(`<a:checkmark:1461047015050973245> Successfully added <@${target.id}> to the **uwuify** list! All their messages will now be uwuified.`);

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      return interaction.editReply({ content: "There was an error while adding the user to the database. T-T" });
    }
  },
};
