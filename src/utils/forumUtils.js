const { ChannelType } = require("discord.js");

let forumCache = [];
let lastCacheUpdate = 0;
const CACHE_DURATION = 2 * 24 * 60 * 60 * 1000;

async function fetchAllForumPosts(guild, forceRefresh = false) {
  const now = Date.now();

  // 1. Return cached data if valid and not forced
  if (
    !forceRefresh &&
    forumCache.length > 0 &&
    now - lastCacheUpdate < CACHE_DURATION
  ) {
    return forumCache;
  }

  if (forceRefresh) {
    console.log("🔄 Force refreshing forum cache...");
  } else {
    console.log("🔄 Fetching ALL forum posts (this may take a moment)...");
  }

  const channels = await guild.channels.fetch();
  // ChannelType.GuildForum is 15
  const forumChannels = channels.filter((channel) => channel.type === 15);

  let allForumPosts = [];
  const seenIds = new Set();

  // 2. Process each forum channel SEQUENTIALLY to avoid SocketError
  for (const channel of forumChannels.values()) {
    try {
      // A. Get Active Threads (Always instant)
      const active = await channel.threads.fetchActive();
      let channelThreads = [...active.threads.values()];

      // B. Get Archived Threads (LOOP to get ALL of them)
      let lastThreadId = null;
      let hasMore = true;

      while (hasMore) {
        const options = { limit: 100 };
        if (lastThreadId) options.before = lastThreadId;

        // Fetch the next batch of 100 archived threads
        // Add a small delay to be safe
        await new Promise((res) => setTimeout(res, 500));
        const archived = await channel.threads.fetchArchived(options);
        const fetchedThreads = [...archived.threads.values()];

        if (fetchedThreads.length > 0) {
          channelThreads.push(...fetchedThreads);
          // Prepare for next loop: grab the ID of the oldest thread we just found
          lastThreadId = fetchedThreads[fetchedThreads.length - 1].id;
        }

        // If we got fewer than 100, we have reached the end
        if (fetchedThreads.length < 100) {
          hasMore = false;
        }
      }

      // C. Tag and Add to List, avoiding duplicates
      for (const thread of channelThreads) {
        if (!seenIds.has(thread.id)) {
          // Store lightweight object
          allForumPosts.push({
            id: thread.id,
            name: thread.name,
            parentId: channel.id, // Ensure we have parentId
            parentName: channel.name,
            appliedTags: thread.appliedTags,
            url: thread.url,
            createdAt: thread.createdAt,
          });
          seenIds.add(thread.id);
        }
      }

      console.log(
        `📚 Fetched ${channelThreads.length} threads from ${channel.name}`,
      );
    } catch (err) {
      console.warn(`⚠️ Error fetching ${channel.name}:`, err.message);
    }
  }

  // 3. Update Cache
  forumCache = allForumPosts;
  lastCacheUpdate = now;

  console.log(`✅ Total Cached: ${allForumPosts.length} epubs.`);
  return allForumPosts;
}

function clearForumCache() {
  forumCache = [];
  lastCacheUpdate = 0;
}

module.exports = { fetchAllForumPosts, clearForumCache };
