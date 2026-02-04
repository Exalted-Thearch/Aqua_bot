const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { fetchAllForumPosts } = require("../../utils/forumUtils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("searchtag")
    .setDescription("Search forum posts by tags")
    .addStringOption((option) =>
      option
        .setName("tags")
        .setDescription(
          "Comma-separated list of tags (e.g. completed, translated)",
        )
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("forums")
        .setDescription(
          "Comma-separated list of Forum channels to search (optional)",
        )
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const tagsInput = interaction.options.getString("tags");
    const forumsInput = interaction.options.getString("forums");

    const requiredTags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const targetForums =
      forumsInput ?
        forumsInput
          .split(",")
          .map((f) => f.trim().toLowerCase())
          .filter(Boolean)
      : [];

    console.log(
      `[DEBUG] Tags: ${JSON.stringify(requiredTags)}, Forums: ${JSON.stringify(targetForums)}`,
    );

    if (requiredTags.length === 0) {
      return interaction.editReply({
        content: "Please provide at least one tag.",
      });
    }

    // Fetch all threads using the utility (cached)
    const threads = await fetchAllForumPosts(interaction.guild);

    // 4. Pre-calculate Allowed Channel IDs
    // We do this globally first to handle the "Exact Match vs Partial Match" priority.
    let allowedChannelIds = new Set();

    // User requested explicitly to check after the "stick bar" ┃
    const getRealChannelName = (name) => {
      if (name.includes("┃")) {
        return name.split("┃").pop().trim().toLowerCase();
      }
      return name.trim().toLowerCase();
    };

    if (targetForums.length > 0) {
      const forumChannels = interaction.guild.channels.cache.filter(
        (c) => c.type === 15, // GuildForum
      );

      for (const input of targetForums) {
        const inputClean = input.trim().toLowerCase();

        // Find Exact Matches using the Real Name
        const exactMatches = forumChannels.filter(
          (c) => c.id === input || getRealChannelName(c.name) === inputClean,
        );

        if (exactMatches.size > 0) {
          // Priority: If we have exact matches (e.g. "novels" == "novels"), use ONLY them.
          exactMatches.forEach((c) => allowedChannelIds.add(c.id));
          console.log(
            `[DEBUG] Input '${input}' matched EXACTLY: ${exactMatches.map((c) => c.name).join(", ")}`,
          );
        } else {
          // Fallback: Partial matches (e.g. "web" in "webnovels")
          const partialMatches = forumChannels.filter((c) =>
            getRealChannelName(c.name).includes(inputClean),
          );
          partialMatches.forEach((c) => allowedChannelIds.add(c.id));
          console.log(
            `[DEBUG] Input '${input}' matched PARTIALLY: ${partialMatches.map((c) => c.name).join(", ")}`,
          );
        }
      }

      if (allowedChannelIds.size === 0) {
        return interaction.editReply({
          content: `<:close:1435556235691954216> Could not find any forums matching: **${targetForums.join(", ")}**`,
        });
      }
    }

    // Group results by Channel ID
    const groupedResults = new Map(); // ChannelId -> { channelName, posts: [] }

    for (const thread of threads) {
      if (!thread.parentId) continue;

      // 1. Check Channel Filter (Fast Set Lookup)
      if (targetForums.length > 0 && !allowedChannelIds.has(thread.parentId)) {
        continue;
      }

      // 2. Resolve Channel (needed for name/tags)
      const channel = interaction.guild.channels.cache.get(thread.parentId);
      if (!channel) continue;

      // 3. Resolve & Check Tags
      if (!thread.appliedTags || thread.appliedTags.length === 0) continue;

      // Map tag IDs to Names
      const threadTagNames = thread.appliedTags
        .map((tagId) => {
          const tagDef = channel.availableTags.find((t) => t.id === tagId);
          return tagDef ? tagDef.name.toLowerCase() : null;
        })
        .filter(Boolean);

      // Check if ALL required tags are present
      const hasAllTags = requiredTags.every((req) =>
        threadTagNames.includes(req),
      );

      if (hasAllTags) {
        if (!groupedResults.has(channel.id)) {
          groupedResults.set(channel.id, {
            name: channel.name,
            posts: [],
          });
        }
        groupedResults.get(channel.id).posts.push(thread);
      }
    }

    // No results
    if (groupedResults.size === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c) // Red
        .setDescription(
          `<:close:1435556235691954216> No forum posts found matching tags: **${requiredTags.join(
            ", ",
          )}**`,
        );
      return interaction.editReply({ embeds: [embed] });
    }

    // Build Response Embeds
    const allEmbeds = [];
    const sortedChannels = Array.from(groupedResults.values());

    // Helper: Create an embed for a list of posts
    const createEmbed = (channelName, posts, isContinuation = false) => {
      const description = posts
        .map((p) => `• [${p.name}](${p.url})`)
        .join("\n");

      return new EmbedBuilder()
        .setTitle(
          isContinuation ? `${channelName} (Cont.)` : `# ${channelName}`,
        )
        .setDescription(description)
        .setColor(0x5799f3)
        .setFooter({ text: `Found ${posts.length} matching posts` }); // Note: Footer count is per-embed here for simplicity
    };

    // 1. Convert Groups to Embeds (Splitting by 4096 limit)
    for (const group of sortedChannels) {
      let currentChunk = [];
      let currentLen = 0;
      const MAX_DESC = 4000;

      for (const post of group.posts) {
        const line = `• [${post.name}](${post.url})\n`;

        if (currentLen + line.length > MAX_DESC) {
          allEmbeds.push(
            createEmbed(
              group.name,
              currentChunk,
              allEmbeds.length > 0 && currentChunk.length > 0,
            ),
          ); // simple continuation check logic
          currentChunk = [];
          currentLen = 0;
        }
        currentChunk.push(post);
        currentLen += line.length;
      }

      if (currentChunk.length > 0) {
        // Check if this channel has been split before? Ideally yes, but for now just push it.
        // We can check if the LAST embed has same title to detect continuation if we wanted perfection.
        allEmbeds.push(createEmbed(group.name, currentChunk));
      }
    }

    // 2. Send in Batches (Max 10 embeds OR 6000 chars per message)

    // NEW: Add Header to the first embed
    if (allEmbeds.length > 0) {
      const firstEmbed = allEmbeds[0];
      const header =
        `🏷️ **Search Tags:** ${requiredTags.join(", ")}\n` +
        (targetForums.length > 0 ?
          `📂 **Forums:** ${targetForums.join(", ")}\n`
        : ``) +
        `─────────────────────────────\n`;

      // We chunked description to 4000, so adding a header should fit (limit 4096)
      firstEmbed.setDescription(header + (firstEmbed.data.description || ""));
    }

    let batch = [];
    let batchSize = 0;
    let isFirstBatch = true;
    const MAX_TOTAL_SIZE = 5800; // Safety buffer below 6000

    for (const embed of allEmbeds) {
      // Calculate Embed Size
      const titleLen = embed.data.title ? embed.data.title.length : 0;
      const descLen =
        embed.data.description ? embed.data.description.length : 0;
      const footerLen = embed.data.footer ? embed.data.footer.text.length : 0;
      const embedSize = titleLen + descLen + footerLen;

      // Check if adding this embed fits in current batch
      if (batch.length >= 10 || batchSize + embedSize > MAX_TOTAL_SIZE) {
        // Send current batch
        if (isFirstBatch) {
          await interaction.editReply({
            embeds: batch,
            allowedMentions: { parse: [] },
          });
          isFirstBatch = false;
        } else {
          await interaction.followUp({
            embeds: batch,
            allowedMentions: { parse: [] },
          });
        }
        // Reset
        batch = [];
        batchSize = 0;
      }

      batch.push(embed);
      batchSize += embedSize;
    }

    // Send remaining
    if (batch.length > 0) {
      if (isFirstBatch) {
        await interaction.editReply({
          embeds: batch,
          allowedMentions: { parse: [] },
        });
      } else {
        await interaction.followUp({
          embeds: batch,
          allowedMentions: { parse: [] },
        });
      }
    }
  },
};
