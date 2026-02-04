const { EmbedBuilder } = require("discord.js");

async function getLogChannel(client, envVarName) {
  const guildId = process.env.TEST_SERVER;
  const channelId = process.env[envVarName];

  if (!guildId || !channelId) {
    console.warn(`Missing env vars: TEST_SERVER or ${envVarName}`);
    return null;
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return null;
    return await guild.channels.fetch(channelId);
  } catch (e) {
    console.error(`Failed to fetch log channel ${envVarName}:`, e);
    return null;
  }
}

async function logInfo(client, message) {
  const channel = await getLogChannel(client, "INFO_LOG");
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setDescription(message)
    .setColor("#3498db") // Blue
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error("Failed to send INFO log:", e);
  }
}

async function logError(client, error, context = "General") {
  const channel = await getLogChannel(client, "ERROR_LOG");
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`❌ Error: ${context}`)
    .setDescription(
      `**Message**: ${error.message}\n\`\`\`${
        error.stack ? error.stack.slice(0, 1000) : "No stack"
      }\`\`\``,
    )
    .setColor("#e74c3c") // Red
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error("Failed to send ERROR log:", e);
  }
}

module.exports = { getLogChannel, logInfo, logError };
