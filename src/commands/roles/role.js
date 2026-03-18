const {
  SlashCommandBuilder,
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
} = require("discord.js");
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
          o
            .setName("primary")
            .setDescription("Primary hex color (ex: #ffffff)")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("secondary")
            .setDescription("Secondary hex for Gradient Color (ex: #000000)"),
        ),
    )
    // Subcommand: "/role edit"
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit your custom role details")
        .addStringOption((o) => o.setName("name").setDescription("New Name"))
        .addStringOption((o) =>
          o
            .setName("primary")
            .setDescription("New Primary Color (ex: #ffffff)"),
        )
        .addStringOption((o) =>
          o
            .setName("secondary")
            .setDescription("New Secondary Color (ex: #000000)"),
        )
        .addAttachmentOption((o) =>
          o.setName("image").setDescription("New Role Icon (Image)"),
        )
        .addStringOption((o) =>
          o
            .setName("emoji")
            .setDescription("New Role Icon (Emoji) [Image takes priority]"),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") {
      const name = interaction.options.getString("name");
      const color = interaction.options.getString("primary");
      const secondary = interaction.options.getString("secondary");
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
          flags: MessageFlags.Ephemeral,
        });
      if (record && record.roleId)
        return interaction.reply({
          content: "You already have a role. Use `/role edit`.",
          flags: MessageFlags.Ephemeral,
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
              flags: MessageFlags.Ephemeral,
            });
          }
        } else {
          console.warn("⚠️ No Booster Role found in this server.");
          await interaction.followUp({
            content: `⚠️ **Notice:** I couldn't find a "Server Booster" role in this server (maybe nobody has boosted yet?). The role was created but not moved.`,
            flags: MessageFlags.Ephemeral,
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
          flags: MessageFlags.Ephemeral,
        });
      }

      // Database Check
      const record = await UserRole.findOne({ userId: interaction.user.id });
      if (!record || !record.roleId)
        return interaction.reply({
          content: "No custom role found.",
          flags: MessageFlags.Ephemeral,
        });

      const role = interaction.guild.roles.cache.get(record.roleId);
      if (!role)
        return interaction.reply({
          content: "Role not found.",
          flags: MessageFlags.Ephemeral,
        });

      // Get Inputs
      const newName = interaction.options.getString("name");
      const newColor = interaction.options.getString("primary");
      const newSecondary = interaction.options.getString("secondary");
      const newImage = interaction.options.getAttachment("image");
      const newEmoji = interaction.options.getString("emoji");

      if (!newName && !newColor && !newImage && !newSecondary && !newEmoji) {
        return interaction.reply({
          content: "No changes provided.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply();
      const changes = [];
      let activeChanges = 0;
      let replyMsg = "Role updated!";
      let embed = null;

      try {
        // Apply Changes
        if (newName) {
          await role.setName(newName);
          changes.push(`Name: **${newName}**`);
          activeChanges++;
          replyMsg = `✅ Your role name has been updated to **${newName}**!`;
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
          replyMsg = `<a:checkmark:1461047015050973245> Your role color has been updated to **${
            secondaryToUse ?
              `${primaryToUse} & ${secondaryToUse} (Gradient)`
            : primaryToUse
          }**!`;
        }

        if (newImage) {
          const check = await validateImage(newImage.url);
          if (!check.valid)
            return interaction.editReply(`Image Error: ${check.error}`);

          await role.edit({
            icon: newImage.url,
            unicodeEmoji: null,
          });
          changes.push("Role icon updated");
          activeChanges++;
          embed = new ContainerBuilder()
            .setAccentColor(role.color || 0x55e6b0)
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    `**${interaction.user.displayName}'s Role Icon**\nYour role icon has been set to the shown image!`,
                  ),
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(newImage.url)),
            )
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`-# Role: ${role.name}`),
            );
        } else if (newEmoji) {
          const customEmojiMatch = newEmoji.match(/<a?:.+?:(\d+)>/);
          if (customEmojiMatch) {
            const emojiId = customEmojiMatch[1];
            const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png`;
            await role.edit({
              icon: emojiUrl,
              unicodeEmoji: null,
            });
            changes.push("Role icon updated (Custom Emoji)");
            embed = new ContainerBuilder()
              .setAccentColor(role.color || 0x55e6b0)
              .addSectionComponents(
                new SectionBuilder()
                  .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                      `**${interaction.user.displayName}'s Role Icon**\nYour role icon has been set to the shown emoji!`,
                    ),
                  )
                  .setThumbnailAccessory(new ThumbnailBuilder().setURL(emojiUrl)),
              )
              .addSeparatorComponents(new SeparatorBuilder())
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Role: ${role.name}`),
              );
          } else {
            // Treat as Unicode
            await role.edit({
              icon: null,
              unicodeEmoji: newEmoji,
            });
            changes.push(`Role icon updated (Unicode: ${newEmoji})`);
          }
          activeChanges++;
          replyMsg = `<a:checkmark:1461047015050973245> Your role icon has been set to ${newEmoji}!`;
        }

        if (activeChanges > 1) {
          replyMsg =
            "<a:checkmark:1461047015050973245> Your role has been updated!";
        }

        cooldowns.set(interaction.user.id, Date.now());

        if (embed && activeChanges === 1) {
          await interaction.editReply({
            components: [embed],
            flags: MessageFlags.IsComponentsV2,
          });
        } else {
          await interaction.editReply(replyMsg);
        }

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
