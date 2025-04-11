"use strict";
require("dotenv").config();
const {
  REST,
  Routes,
  ApplicationCommandOptionType,
  Options,
} = require("discord.js");

const commands = [
  {
    name: "ping",
    description: "reply with ping",
  },
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
}

// Execute the async function
registerCommands();
