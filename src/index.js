require("dotenv").config();
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

client.on("ready", async (c) => {
  console.log(`✅ ${c.user.tag} is online.`);

  // const guild = client.guilds.cache.get(process.env.GUILD_ID);
  // if (!guild) {
  //   console.log("❌ Guild not found! Check your GUILD_ID.");
  //   return;
  // }

  // Initialize with a default status
  // client.user.setActivity({
  //   name: "With my Life",
  //   type: ActivityType.Playing,
  // });

  setInterval(async () => {
    try {
      const fetchedMembers = await guild.members.fetch({
        withPresences: true,
        force: false, // Use cache unless needed
      });

      const totalOnline = fetchedMembers.filter(
        (member) =>
          member.presence?.status === "online" ||
          member.presence?.status === "idle"
      ).size;

      const status = [
        {
          name: "EveOfChaos",
          type: ActivityType.Streaming,
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
        {
          name: `${totalOnline} active members`,
          type: ActivityType.Watching,
        },
        {
          name: "Spotify",
          type: ActivityType.Listening,
        },
      ];

      const randomStatus = status[Math.floor(Math.random() * status.length)];
      client.user.setActivity(randomStatus);
    } catch (error) {
      console.error("Error updating status:", error);
    }
  }, 5000);
});

client.on("interactionCreate", (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    interaction.reply(`Websocket heartbeat: ${client.ws.ping}ms.`);
  }
});

client.login(process.env.TOKEN);
