const {
  parseDice,
  rollDice,
  largeDiceTable,
  smallDiceTable,
} = require("../utils/dice");
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll dice like 1d20, 1d20+5 adv")
    .addStringOption((option) =>
      option.setName("dice").setDescription("Dice notation").setRequired(true)
    ),

  async execute(interaction) {
    const input = interaction.options.getString("dice");
    const parsed = parseDice(input);
    if (!parsed) {
      return interaction.reply({
        content:
          "<:close:1435556235691954216> Invalid format. Examples: `1d20`, `1d20 adv`, `1d20+5 dis`",
        ephemeral: true,
      });
    }
    if (parsed.count > 50) {
      return interaction.reply({
        content: "<:close:1435556235691954216> Maximum dice count is 50.",
        ephemeral: true,
      });
    }

    if (parsed.sides > 1000) {
      return interaction.reply({
        content: "<:close:1435556235691954216> Maximum dice sides is 1000.",
        ephemeral: true,
      });
    }

    if (parsed.mode && parsed.count !== 1) {
      return interaction.reply({
        content:
          "<:close:1435556235691954216> Advantage/Disadvantage only works with 1 die.",
        ephemeral: true,
      });
    }

    const result = rollDice(parsed);

    const table =
      parsed.count <= 3
        ? smallDiceTable(parsed, result)
        : largeDiceTable(parsed, result);
    await interaction.reply({
      content: "```text\n" + table + "\n```",
      allowedMentions: { parse: [] },
    });
  },
};
