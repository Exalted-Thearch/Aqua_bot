const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the websocket latency"),
  async execute(interaction) {
    await interaction.reply(
      `Websocket latency: **${interaction.client.ws.ping}ms**.`,
    );
  },
};
