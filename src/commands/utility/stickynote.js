const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require("discord.js");
const stickyManager = require("../../utils/stickyManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stickynote")
    .setDescription("Manage sticky notes for channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new sticky note for a channel")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription(
              "The message content (skip this to use a popup for multi-line)",
            )
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName("delay")
            .setDescription(
              "Delay in seconds after last message before resending the stickynote (default: 30)",
            )
            .setMinValue(5)
            .setMaxValue(3600)
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription(
              "The channel to set the sticky note in (defaults to current)",
            )
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit an existing sticky note")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription(
              "The new message content (skip this to use a popup for multi-line)",
            )
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName("delay")
            .setDescription(
              "Delay in seconds after last message before resending the stickynote",
            )
            .setMinValue(5)
            .setMaxValue(3600)
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to edit (defaults to current)")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a sticky note from a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to delete from (defaults to current)")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all active sticky notes in this server"),
    ),

  async execute(interaction) {
    // Permission Check
    const hasPerms = interaction.member.permissions.has(
      PermissionFlagsBits.ManageMessages,
    );
    const hasRole = interaction.member.roles.cache.has("1366687926330851418"); // Bot Mod/Trusted Role

    if (!hasPerms && !hasRole) {
      return interaction.reply({
        content:
          "<:alert:1435556816267247738> You do not have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const channel =
      interaction.options.getChannel("channel") || interaction.channel;
    const messageContent = interaction.options.getString("message");
    const delay = interaction.options.getInteger("delay") ?? interaction.options.getInteger("time");
    console.log(`[StickyNote Debug] Raw options:`, JSON.stringify(interaction.options.data));
    console.log(`[StickyNote Debug] delay=${delay}`);

    try {
      if (subcommand === "create" || subcommand === "edit") {
        const isEdit = subcommand === "edit";
        const existing = await stickyManager.getSticky(channel.id);

        if (isEdit && !existing) {
          return interaction.reply({
            content: `❌ No sticky note found in ${channel}. Use \`/stickynote create\` first.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!isEdit && existing) {
          return interaction.reply({
            content: `❌ A sticky note already exists in ${channel}. Use \`/stickynote edit\` to change it.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        // --- HANDLE MODAL (Multi-line) ---
        if (!messageContent) {
          const modal = new ModalBuilder()
            .setCustomId(`stickynote:${subcommand}:${channel.id}`)
            .setTitle(isEdit ? "Edit Sticky Note" : "Create Sticky Note");

          const messageInput = new TextInputBuilder()
            .setCustomId("messageInput")
            .setLabel("Message Content")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder("Enter your sticky note message here...");

          if (isEdit && existing) {
            messageInput.setValue(existing.message);
          }

          const delayInput = new TextInputBuilder()
            .setCustomId("delayInput")
            .setLabel("Delay (seconds) — min 5, max 3600, default 30")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder("30")
            .setValue(String(delay ?? existing?.delay ?? 30));

          const firstActionRow = new ActionRowBuilder().addComponents(messageInput);
          const secondActionRow = new ActionRowBuilder().addComponents(delayInput);
          modal.addComponents(firstActionRow, secondActionRow);

          await interaction.showModal(modal);
          return;
        }

        // --- HANDLE DIRECT INPUT ---
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const success = await stickyManager.addSticky(
          channel.id,
          messageContent,
          interaction.client,
          delay,
        );

        if (!success) {
          return interaction.editReply({
            content: `❌ Failed to ${isEdit ? "update" : "send"} sticky message in ${channel}. Check bot permissions.`,
          });
        }

        const delayText = delay ? ` (delay: ${delay}s)` : '';
        return interaction.editReply({
          content: `✅ Sticky note ${isEdit ? "updated" : "created"} in ${channel}!${delayText}`,
        });
      }

      if (subcommand === "delete") {
        const existing = await stickyManager.getSticky(channel.id);
        if (!existing) {
          return interaction.reply({
            content: `❌ No sticky note found in ${channel}.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await stickyManager.removeSticky(channel.id, interaction.client);

        return interaction.editReply({
          content: `✅ Sticky note deleted from ${channel}.`,
        });
      }

      if (subcommand === "list") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const allStickies = await stickyManager.getAllStickies();

        // Filter for current guild only (sticky notes are global in DB but we only show for this guild)
        // Wait, DB has channel IDs. We need to check which ones belong to this guild.
        const guildStickies = [];
        for (const sticky of allStickies) {
          const ch = interaction.guild.channels.cache.get(sticky.channelId);
          if (ch) {
            guildStickies.push({ channel: ch, message: sticky.message, delay: sticky.delay || 30 });
          }
        }

        if (guildStickies.length === 0) {
          return interaction.editReply(
            "No active sticky notes in this server.",
          );
        }

        const embed = new EmbedBuilder()
          .setTitle("📌 Active Sticky Notes")
          .setColor("#FFD700");

        const description = guildStickies
          .map(
            (s, i) =>
              `**${i + 1}.** ${s.channel} ⏱️ ${s.delay}s\n> ${s.message.substring(0, 100)}${s.message.length > 100 ? "..." : ""}`,
          )
          .join("\n\n");

        embed.setDescription(description);

        return interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("Error executing /stickynote:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "❌ An error occurred while processing your request.",
        });
      } else {
        await interaction.reply({
          content: "❌ An error occurred while processing your request.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },

  async handleModal(interaction) {
    // CustomId: stickynote:create|edit:channelId
    const parts = interaction.customId.split(":");
    const mode = parts[1];
    const channelId = parts[2];

    const messageContent =
      interaction.fields.getTextInputValue("messageInput");

    // Parse delay from modal input
    const delayRaw = interaction.fields.getTextInputValue("delayInput");
    let parsedDelay = delayRaw ? parseInt(delayRaw, 10) : null;
    if (parsedDelay !== null && (isNaN(parsedDelay) || parsedDelay < 5 || parsedDelay > 3600)) {
      parsedDelay = null; // Invalid input, use existing/default
    }
    console.log(`[StickyNote Modal] mode=${mode}, channelId=${channelId}, delay=${parsedDelay}`);

    const channel = interaction.guild.channels.cache.get(channelId);

    // Defer FIRST (must respond within 3 seconds)
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (err) {
      console.error("[StickyNote Modal] Failed to defer:", err.message);
      return; // Can't respond, bail out
    }

    if (!channel) {
      return interaction.editReply("❌ Channel not found.");
    }

    try {
      const success = await stickyManager.addSticky(
        channelId,
        messageContent,
        interaction.client,
        parsedDelay,
      );

      if (!success) {
        return interaction.editReply({
          content: `❌ Failed to ${mode === "edit" ? "update" : "send"} sticky message in ${channel}. Check bot permissions.`,
        });
      }

      const delayText = parsedDelay ? ` (delay: ${parsedDelay}s)` : '';
      return interaction.editReply({
        content: `✅ Sticky note ${mode === "edit" ? "updated" : "created"} in ${channel}!${delayText}`,
      });
    } catch (error) {
      console.error("[StickyNote Modal] Error:", error);
      await interaction.editReply("❌ An error occurred processing the modal.").catch(() => {});
    }
  },
};
