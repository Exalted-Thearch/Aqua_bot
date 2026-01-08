require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const { Client, ActivityType, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Privileged intent
    GatewayIntentBits.GuildPresences, // Privileged intent
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

const PREFIX = "!";

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const [cmd, ...args] = message.content
    .trim()
    .substring(PREFIX.length)
    .split(/\s+/);

  if (cmd === "downloadpfps") {
    await message.reply("Downloading avatars...");

    const members = await message.guild.members.fetch();

    const avatarDir = "./avatars";
    if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir);

    for (const member of members.values()) {
      if (member.user.bot) continue;

      const avatarURL = member.user.displayAvatarURL({
        extension: "png",
        size: 1024,
      });

      const filePath = path.join(
        avatarDir,
        `${member.user.username}_${member.user.id}.png`
      );

      try {
        const response = await axios.get(avatarURL, { responseType: "stream" });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        console.log(`Downloaded: ${member.user.tag}`);
      } catch (err) {
        console.error(`Failed for ${member.user.tag}:`, err.message);
      }
    }

    await message.reply("✅ All profile pictures downloaded!");
  }
});

client.login(process.env.TOKEN);
