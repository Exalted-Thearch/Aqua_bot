// src/unregister-command.js
"use strict";
require("dotenv").config();
const { REST, Routes } = require("discord.js");

// Ensure your CLIENT_ID and GUILD_ID are correct in your .env file
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // Only needed for guild commands

if (!CLIENT_ID) {
  console.error("CLIENT_ID is not set in .env!");
  process.exit(1);
}

// Initialize REST API
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

async function unregisterCommands() {
  try {
    console.log("Started unregistering application (/) commands...");

    // --- OPTION 1: REMOVE GUILD-SPECIFIC COMMANDS (Recommended for testing) ---
    // This will clear ALL commands for your bot in the specified GUILD.
    // if (!GUILD_ID) {
    //   console.error("GUILD_ID is not set in .env! Cannot unregister guild commands.");
    //   return;
    // }
    // await rest.put(
    //   Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    //   { body: [] } // <--- Send an empty array to clear all commands in this guild
    // );
    // console.log(`Successfully cleared application (/) commands for guild ${GUILD_ID}.`);

    // --- OPTION 2: REMOVE GLOBAL COMMANDS (Use if you registered globally, can take up to 1 hour) ---
    // Uncomment the line below IF you registered global commands.
    // If you only registered guild commands, you don't need this.
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [] } // <--- Send an empty array to clear all global commands
    );
    console.log("Successfully cleared global application (/) commands.");

  } catch (error) {
    console.error("Error unregistering commands:", error);
  }
}

// Execute the async function
unregisterCommands();