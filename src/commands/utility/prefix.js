const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const ServerConfig = require("../../database/ServerConfig");

async function executePrefixChange(guildId, newPrefix, moderator, client) {
  if (newPrefix.length > 5) {
    return { success: false, error: "<:alert:1435556816267247738> Prefix must be 5 characters or less." };
  }
  
  await ServerConfig.findOneAndUpdate(
    { guildId },
    { prefix: newPrefix },
    { upsert: true }
  );

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Prefix Updated")
    .setDescription(`The server prefix has been successfully changed to \`${newPrefix}\`\n\nAll prefix commands will now require this new prefix.`);

  return { success: true, embed, newPrefix };
}

const prefixCommand = {
  data: new SlashCommandBuilder()
    .setName("prefix")
    .setDescription("Mod: Change the server's command prefix")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("new_prefix")
        .setDescription("The new prefix for the server")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    }

    const newPrefix = interaction.options.getString("new_prefix");
    await interaction.deferReply();

    const result = await executePrefixChange(interaction.guild.id, newPrefix, interaction.user, interaction.client);
    
    if (!result.success) {
      return interaction.editReply({ content: result.error });
    }
    
    // Update the cache if we can access it. But we can't cleanly access prefixCache from index.js here without an event or export.
    // The easiest way is to let index.js update the cache, or export prefixCache from index.js.
    // Alternatively, emit an event on client, e.g. client.emit('prefixChange', guildId, newPrefix);
    interaction.client.emit("prefixChange", interaction.guild.id, newPrefix);

    return interaction.editReply({ embeds: [result.embed] });
  },
};

module.exports = {
  data: prefixCommand.data,
  execute: prefixCommand.execute,
  executePrefixChange
};
