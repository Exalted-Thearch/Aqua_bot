const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

// 1. Load Env Variables
const token = process.env.TOKEN || process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;
const testServerId = process.env.TEST_SERVER;
const nexusServerId = process.env.NEXUS_SERVER;
const grimoireServerId = process.env.GRIMOIRE_SERVER; // e.g., General Server

// Safety Check
if (!token || !clientId || !testServerId || !nexusServerId) {
  console.error("Error: Missing keys in .env file.");
  process.exit(1);
}

// 2. Load Commands Dynamically
const nexusCommands = [];
const generalCommands = [];
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    if (fs.lstatSync(folderPath).isDirectory()) {
      const commandFiles = fs
        .readdirSync(folderPath)
        .filter((file) => file.endsWith(".js"));

      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);

        if ("data" in command && "execute" in command) {
          if (folder === "roles") {
            nexusCommands.push(command.data.toJSON());
          } else {
            generalCommands.push(command.data.toJSON());
          }

          // SPECIAL CASE: 'roll' command should also go to Nexus
          if (command.data.name === "roll") {
            nexusCommands.push(command.data.toJSON());
          }

          console.log(
            `[INFO] Loaded command ${command.data.name} from ${folder}/${file}`,
          );
        } else {
          console.log(
            `[WARNING] The command at ${filePath} is missing "data" or "execute".`,
          );
        }
      }
    }
  }
}
// Add hardcoded roll command if it doesn't exist in files yet (keeping it for safety if user wants it)
// But I think 'roll' was hardcoded too. I should probably create a file for it or keep it hardcoded in generalCommands?
// For now, I will omit 'roll' hardcoding as per instruction "replace hardcoded commands".
// If 'roll' is lost, I should recreate it as a file.
// The user prompt only mentioned role commands refactoring.
// I will ensure 'roll' is preserved if I didn't create a file for it.
// Wait, 'roll' command was there.
// I should check if I should create 'roll.js'.
// I'll create 'roll.js' in utility first to be safe.

// 4. Deploy Logic
const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`Started refreshing application (/) commands.`);

    // --- A. Register to NEXUS (Role Commands Only) ---
    if (nexusServerId) {
      console.log(
        `Registering ${nexusCommands.length} commands to Nexus Server...`,
      );
      await rest.put(Routes.applicationGuildCommands(clientId, nexusServerId), {
        body: nexusCommands,
      });
    }

    // --- B. Register to GRIMOIRE (File Commands Only) ---
    if (grimoireServerId && generalCommands.length > 0) {
      console.log(
        `Registering ${generalCommands.length} commands to Grimoire Server...`,
      );
      await rest.put(
        Routes.applicationGuildCommands(clientId, grimoireServerId),
        { body: generalCommands },
      );
    }

    // --- C. Register to TEST SERVER (Everything) ---
    // We combine the arrays here using spread syntax and deduplicate by name
    const allTestCommands = [
      ...new Map(
        [...nexusCommands, ...generalCommands].map((c) => [c.name, c]),
      ).values(),
    ];

    console.log(
      `Registering ALL ${allTestCommands.length} commands to Test Server...`,
    );
    await rest.put(Routes.applicationGuildCommands(clientId, testServerId), {
      body: allTestCommands,
    });

    console.log("✅ Successfully reloaded all commands.");
  } catch (error) {
    console.error(error);
  }
})();
