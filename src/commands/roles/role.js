const { SlashCommandBuilder } = require("discord.js");
const UserRole = require("../../database/UserRole");
const { logInfo, logError } = require("../../utils/logger");
const {
  updateRoleColors,
  validateImage,
  formatDiscordError,
} = require("../../utils/roleUtils");

const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Manage your custom role")
    // Subcommand: "/role create"
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create your custom role (Booster only)")
        .addStringOption((o) =>
          o.setName("name").setDescription("Name").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("hex_color").setDescription("Hex color").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("secondary_hex")
            .setDescription("Secondary hex for Gradient Color"),
        ),
    )
    // Subcommand: "/role edit"
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit your custom role details")
        .addStringOption((o) => o.setName("name").setDescription("New Name"))
        .addStringOption((o) =>
          o.setName("hex_color").setDescription("New Color"),
        )
        .addStringOption((o) =>
          o.setName("secondary_hex").setDescription("New Gradient"),
        )
        .addAttachmentOption((o) =>
          o.setName("icon").setDescription("New Icon"),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") {
      const name = interaction.options.getString("name");
      const color = interaction.options.getString("hex_color");
      const secondary = interaction.options.getString("secondary_hex");
      // 1. Auto-detect the role with the "premiumSubscriber" tag
      const boosterRole = interaction.guild.roles.cache.find(
        (role) => role.tags && role.tags.premiumSubscriberRole,
      );
      const isBooster =
        boosterRole ?
          interaction.member.roles.cache.has(boosterRole.id)
        : false;
      const record = await UserRole.findOne({ userId: interaction.user.id });
      const hasPerms = isBooster || (record && record.isTemp);

      if (!hasPerms)
        return interaction.reply({
          content: "You must be a Server Booster to use this command.",
          ephemeral: true,
        });
      if (record && record.roleId)
        return interaction.reply({
          content: "You already have a role. Use `/role edit`.",
          ephemeral: true,
        });

      await interaction.deferReply();

      try {
        // 1. Create Role (Basic)
        const newRole = await interaction.guild.roles.create({
          name: name,
          permissions: [],
          reason: `Custom role for ${interaction.user.tag}`,
        });

        // 2. Apply Colors
        const colorResult = await updateRoleColors(
          interaction.client, // Pass client for REST access
          interaction.guild.id,
          newRole.id,
          color,
          secondary,
        );

        // 3. Position
        if (boosterRole) {
          try {
            console.log(
              `Found Booster Role: ${boosterRole.name} (Position: ${boosterRole.position})`,
            );
            await newRole.setPosition(boosterRole.position + 1);
          } catch (err) {
            console.error("Positioning Error:", err);
            await interaction.followUp({
              content: `⚠️ **Warning:** Role created, but I could not move it above the Booster role. \n**Fix:** Go to Server Settings -> Roles and drag my Bot Role higher than the Booster Role!`,
              ephemeral: true,
            });
          }
        } else {
          console.warn("⚠️ No Booster Role found in this server.");
          await interaction.followUp({
            content: `⚠️ **Notice:** I couldn't find a "Server Booster" role in this server (maybe nobody has boosted yet?). The role was created but not moved.`,
            ephemeral: true,
          });
        }

        // 4. Assign & Save
        await interaction.member.roles.add(newRole);

        if (record) {
          await UserRole.updateOne(
            { userId: interaction.user.id },
            { roleId: newRole.id },
          );
        } else {
          await UserRole.create({
            userId: interaction.user.id,
            roleId: newRole.id,
          });
        }

        let msg = `Role ${newRole} created!`;
        if (colorResult.warning) msg += ` (${colorResult.warning})`;

        await interaction.editReply(msg);
        logInfo(
          interaction.client,
          `✅ **Role Created**: ${interaction.user} created **${name}** in ${interaction.guild.name}`,
        );
      } catch (e) {
        const friendyError = formatDiscordError(e);
        await interaction.editReply(`Error: ${friendyError}`);
        logError(
          interaction.client,
          e,
          `Role Create - ${interaction.user.tag}`,
        );
      }
    } else if (subcommand === "edit") {
      // Cooldown Check
      const lastUsed = cooldowns.get(interaction.user.id);
      if (lastUsed && Date.now() - lastUsed < 60000) {
        const remaining = (60 - (Date.now() - lastUsed) / 1000).toFixed(1);
        return interaction.reply({
          content: `Please wait ${remaining}s.`,
          ephemeral: true,
        });
      }

      // Database Check
      const record = await UserRole.findOne({ userId: interaction.user.id });
      if (!record || !record.roleId)
        return interaction.reply({
          content: "No custom role found.",
          ephemeral: true,
        });

      const role = interaction.guild.roles.cache.get(record.roleId);
      if (!role)
        return interaction.reply({
          content: "Role not found.",
          ephemeral: true,
        });

      // Get Inputs
      const newName = interaction.options.getString("name");
      const newColor = interaction.options.getString("hex_color");
      const newSecondary = interaction.options.getString("secondary_hex");
      const newIcon = interaction.options.getAttachment("icon");

      if (!newName && !newColor && !newIcon && !newSecondary) {
        return interaction.reply({
          content: "No changes provided.",
          ephemeral: true,
        });
      }

      await interaction.deferReply();
      const changes = [];
      let activeChanges = 0;
      let replyMsg = "Role updated!";

      try {
        // Apply Changes
        if (newName) {
          await role.setName(newName);
          changes.push(`Name: **${newName}**`);
          activeChanges++;
          replyMsg = `You have changed your name to **${newName}**`;
        }

        // Color Logic
        if (newColor || newSecondary) {
          const primaryToUse = newColor || role.hexColor;
          const secondaryToUse = newSecondary;

          const result = await updateRoleColors(
            interaction.client,
            interaction.guild.id,
            role.id,
            primaryToUse,
            secondaryToUse,
          );

          if (result.warning) {
            changes.push(
              `Color: **${primaryToUse}** (Solid - ${result.warning})`,
            );
          } else {
            changes.push(
              newSecondary ?
                `Color: Gradient (**${primaryToUse}** & **${secondaryToUse}**)`
              : `Color: **${primaryToUse}**`,
            );
          }
          activeChanges++;
          replyMsg = `You have updated your role color to **${
            secondaryToUse ?
              `${primaryToUse} & ${secondaryToUse}`
            : primaryToUse
          }**`;
        }

        if (newIcon) {
          const check = await validateImage(newIcon.url);
          if (!check.valid)
            return interaction.editReply(`Icon Error: ${check.error}`);

          await role.setIcon(newIcon.url);
          changes.push("Role icon updated");
          activeChanges++;
        }

        if (activeChanges > 1) {
          replyMsg = "Role updated!";
        }

        cooldowns.set(interaction.user.id, Date.now());
        await interaction.editReply(replyMsg);

        if (activeChanges > 0) {
          logInfo(
            interaction.client,
            `<:edit:1459490116585390156> **Role Edited**: ${
              interaction.user
            } edited their role:\n- ${changes.join("\n- ")}`,
          );
        }
      } catch (e) {
        await interaction.editReply(`Error: ${formatDiscordError(e)}`);
        logError(interaction.client, e, `Role Edit - ${interaction.user.tag}`);
      }
    }
  },
};
