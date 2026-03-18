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
const nexusCommands = []; // Roles (Nexus Server)
const generalCommands = []; // SearchTag (Grimoire Server)
const globalCommands = []; // Utility (Global)
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
          const commandData = command.data.toJSON();

          if (folder === "roles") {
            nexusCommands.push(commandData);
          } else if (folder === "utility") {
            if (file === "searchTag.js") {
              generalCommands.push(commandData); // Grimoire only
            } else {
              globalCommands.push(commandData); // Global (ping, roll, stickynote)
            }
          } else {
            // Default behavior for other folders (if any added later)
            // For now, let's assume they are global unless specified otherwise?
            // Or maybe safe default is global?
            globalCommands.push(commandData);
          }

          // SPECIAL CASE: 'roll' command check is no longer needed if roll.js exists in utility
          // but if we are keeping the logic consistent with previous behavior...
          // roll.js IS in utility, so it went to globalCommands above.

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

// 4. Deploy Logic
const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`Started refreshing application (/) commands.`);

    // --- A. Register to NEXUS (Role Commands Only) ---
    if (nexusServerId && nexusCommands.length > 0) {
      console.log(
        `Registering ${nexusCommands.length} commands to Nexus Server...`,
      );
      await rest.put(Routes.applicationGuildCommands(clientId, nexusServerId), {
        body: nexusCommands,
      });
    }

    // --- B. Register to GRIMOIRE (SearchTag Only) ---
    if (grimoireServerId && generalCommands.length > 0) {
      console.log(
        `Registering ${generalCommands.length} commands to Grimoire Server...`,
      );
      await rest.put(
        Routes.applicationGuildCommands(clientId, grimoireServerId),
        { body: generalCommands },
      );
    }

    // --- C. Register GLOBAL Commands ---
    if (globalCommands.length > 0) {
      console.log(`Registering ${globalCommands.length} GLOBAL commands...`);
      await rest.put(Routes.applicationCommands(clientId), {
        body: globalCommands, // No guild ID needed for global
      });
    }

    // --- D. Register to TEST SERVER (Everything) ---
    // We combine the arrays here using spread syntax and deduplicate by name
    const allTestCommands = [
      ...new Map(
        [...nexusCommands, ...generalCommands, ...globalCommands].map((c) => [
          c.name,
          c,
        ]),
      ).values(),
    ];

    if (testServerId) {
      console.log(
        `Registering ALL ${allTestCommands.length} commands to Test Server...`,
      );
      await rest.put(Routes.applicationGuildCommands(clientId, testServerId), {
        body: allTestCommands,
      });
    }

    console.log("✅ Successfully reloaded all commands.");
  } catch (error) {
    console.error(error);
  }
})();
