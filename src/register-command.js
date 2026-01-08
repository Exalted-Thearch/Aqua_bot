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

// 2. Define Hardcoded Commands (Role Management) - Intended for Nexus
const nexusCommands = [
  new SlashCommandBuilder()
    .setName("role")
    .setDescription("Manage your custom role")
    // Subcommand: "/role create"
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create your custom role (Booster only)")
        .addStringOption((o) =>
          o.setName("name").setDescription("Name").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("hex_color").setDescription("Hex color").setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName("secondary_hex")
            .setDescription("Secondary hex for Gradient Color")
        )
    )
    // Subcommand: "/role edit"
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit your custom role details")
        .addStringOption((o) => o.setName("name").setDescription("New Name"))
        .addStringOption((o) =>
          o.setName("hex_color").setDescription("New Color")
        )
        .addStringOption((o) =>
          o.setName("secondary_hex").setDescription("New Gradient")
        )
        .addAttachmentOption((o) =>
          o.setName("icon").setDescription("New Icon")
        )
    ),

  new SlashCommandBuilder()
    .setName("grant_exception")
    .setDescription(
      "Admin: Allow non-booster to create a role for certain time"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator || PermissionFlagsBits.ManageGuild
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("The user").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("duration")
        .setDescription("You can use 1min, 1h, 1d, 1w, 1mon, 1y")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("assign_role")
    .setDescription("Admin: Assign an existing role to a user")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator ||
        PermissionFlagsBits.ManageGuild ||
        PermissionFlagsBits.ManageRoles
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("The user").setRequired(true)
    )
    .addRoleOption((o) =>
      o.setName("role").setDescription("The role to assign").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with pong!"),
]
  // IMPORTANT: Convert these builders to JSON for the API
  .map((command) => command.toJSON());

// 3. Load File-Based Commands (General) - Intended for Grimoire?
const generalCommands = []; // This was missing in your code
const commandsPath = path.join(__dirname, "commands");

// Check if folder exists to prevent crash
if (fs.existsSync(commandsPath)) {
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    // Ensure it is a directory before reading
    if (fs.lstatSync(folderPath).isDirectory()) {
      const commandFiles = fs
        .readdirSync(folderPath)
        .filter((file) => file.endsWith(".js"));
      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);
        if ("data" in command && "execute" in command) {
          generalCommands.push(command.data.toJSON());
          console.log(`[INFO] Loaded command from ${filePath}`);
        } else {
          console.log(
            `[WARNING] The command at ${filePath} is missing "data" or "execute".`
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
    if (nexusServerId) {
      console.log(
        `Registering ${nexusCommands.length} commands to Nexus Server...`
      );
      await rest.put(Routes.applicationGuildCommands(clientId, nexusServerId), {
        body: nexusCommands,
      });
    }

    // --- B. Register to GRIMOIRE (File Commands Only) ---
    if (grimoireServerId && generalCommands.length > 0) {
      console.log(
        `Registering ${generalCommands.length} commands to Grimoire Server...`
      );
      await rest.put(
        Routes.applicationGuildCommands(clientId, grimoireServerId),
        { body: generalCommands }
      );
    }

    // --- C. Register to TEST SERVER (Everything) ---
    // We combine the arrays here using spread syntax
    const allTestCommands = [...nexusCommands, ...generalCommands];

    console.log(
      `Registering ALL ${allTestCommands.length} commands to Test Server...`
    );
    await rest.put(Routes.applicationGuildCommands(clientId, testServerId), {
      body: allTestCommands,
    });

    console.log("✅ Successfully reloaded all commands.");
  } catch (error) {
    console.error(error);
  }
})();
