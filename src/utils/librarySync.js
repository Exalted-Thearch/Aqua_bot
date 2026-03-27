const { ChannelType, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { logInfo, logError } = require("./logger");
const wait = require("node:timers/promises").setTimeout;

async function runFullSync(client) {
  try {
    const sourceServerId = process.env.SOURCE_SERVER_ID;
    const targetServerId = "1447968719266643999";
    const FAILED_LOG_CHANNEL_ID = "1487113180353401182";

    async function logFailedFile(fileName, threadName, reason) {
      try {
        const logChannel = await client.channels.fetch(FAILED_LOG_CHANNEL_ID);
        await logChannel.send(
          `⚠️ **Failed to transfer file**\n> 📁 File: \`${fileName}\`\n> 🧵 Post: **${threadName}**\n> ❌ Reason: ${reason}\n> *(Re-upload manually when ready)*`,
        );
      } catch (e) {
        console.error(
          "[LibrarySync] Could not send to log channel:",
          e.message,
        );
      }
    }

    if (!sourceServerId) {
      console.error("[LibrarySync] SOURCE_SERVER_ID is not defined in .env!");
      return;
    }

    // Fetch Source Server
    const sourceServer = await client.guilds
      .fetch(sourceServerId)
      .catch(() => null);
    if (!sourceServer) {
      console.error(
        `[LibrarySync] Could not find source server with ID: ${sourceServerId}`,
      );
      return;
    }

    // Fetch Target Server
    const targetServer = await client.guilds
      .fetch(targetServerId)
      .catch(() => null);
    if (!targetServer) {
      console.error(
        `[LibrarySync] Could not find target server with ID: ${targetServerId}`,
      );
      return;
    }

    console.log(
      `[LibrarySync] Starting 24hr sync: ${sourceServer.name} -> ${targetServer.name}`,
    );

    // Get all forum channels in the source server
    const sourceForums = sourceServer.channels.cache.filter(
      (ch) => ch.type === ChannelType.GuildForum,
    );

    if (sourceForums.size === 0) {
      console.log(
        "[LibrarySync] No forum channels found in the source server.",
      );
      return;
    }

    let totalCloned = 0;
    let totalFailed = 0;

    for (const [, sourceChannel] of sourceForums) {
      const targetChannel = targetServer.channels.cache.find(
        (ch) =>
          ch.type === ChannelType.GuildForum && ch.name === sourceChannel.name,
      );

      if (!targetChannel) {
        console.warn(
          `[LibrarySync] Skipping "${sourceChannel.name}" - no matching forum channel found in target server.`,
        );
        continue;
      }

      console.log(`[LibrarySync] Syncing forum: ${sourceChannel.name}`);

      // Fetch Target Threads
      const activeTargetThreads = await targetChannel.threads.fetchActive();
      let allTargetThreads = Array.from(activeTargetThreads.threads.values());

      let archivedTargetThreads = await targetChannel.threads.fetchArchived();
      allTargetThreads = allTargetThreads.concat(
        Array.from(archivedTargetThreads.threads.values()),
      );

      while (
        archivedTargetThreads.hasMore &&
        archivedTargetThreads.threads.size > 0
      ) {
        archivedTargetThreads = await targetChannel.threads.fetchArchived({
          before: archivedTargetThreads.threads.last().id,
        });
        allTargetThreads = allTargetThreads.concat(
          Array.from(archivedTargetThreads.threads.values()),
        );
      }

      const targetThreadNames = new Set(
        allTargetThreads.map((t) => t.name.toLowerCase().trim()),
      );

      // Fetch Source Threads
      const activeSourceThreads = await sourceChannel.threads.fetchActive();
      let allSourceThreads = Array.from(activeSourceThreads.threads.values());

      let archivedSourceThreads = await sourceChannel.threads.fetchArchived();
      allSourceThreads = allSourceThreads.concat(
        Array.from(archivedSourceThreads.threads.values()),
      );

      while (
        archivedSourceThreads.hasMore &&
        archivedSourceThreads.threads.size > 0
      ) {
        archivedSourceThreads = await sourceChannel.threads.fetchArchived({
          before: archivedSourceThreads.threads.last().id,
        });
        allSourceThreads = allSourceThreads.concat(
          Array.from(archivedSourceThreads.threads.values()),
        );
      }

      // Reverse so oldest are cloned first
      allSourceThreads.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      const threadsToClone = allSourceThreads.filter(
        (t) => !targetThreadNames.has(t.name.toLowerCase().trim()),
      );

      if (threadsToClone.length === 0) {
        console.log(
          `[LibrarySync] Forum "${sourceChannel.name}" is fully synced!`,
        );
        continue;
      }

      console.log(
        `[LibrarySync] Found ${threadsToClone.length} missing posts in "${sourceChannel.name}".`,
      );

      for (const thread of threadsToClone) {
        try {
          const starterMessage = await thread.fetchStarterMessage();
          if (!starterMessage) {
            totalFailed++;
            continue;
          }

          const content = starterMessage.content || "*(No text content)*";
          const attachmentList = Array.from(
            starterMessage.attachments.values(),
          );

          // Match source thread tags to target forum's tags by name
          const targetTagMap = new Map(
            targetChannel.availableTags.map((t) => [
              t.name.toLowerCase(),
              t.id,
            ]),
          );
          const appliedTagIds = thread.appliedTags
            .map((srcTagId) => {
              const srcTag = sourceChannel.availableTags.find(
                (t) => t.id === srcTagId,
              );
              return srcTag ?
                  targetTagMap.get(srcTag.name.toLowerCase())
                : null;
            })
            .filter(Boolean);

          const MAX_FILE_SIZE = 10 * 1024 * 1024; // 24 MB

          // Create the thread (always, regardless of file size)
          const firstFile =
            (
              attachmentList.length > 0 &&
              attachmentList[0].size <= MAX_FILE_SIZE
            ) ?
              [
                new AttachmentBuilder(attachmentList[0].url, {
                  name: attachmentList[0].name,
                }),
              ]
            : [];
          const newThread = await targetChannel.threads.create({
            name: thread.name,
            appliedTags: appliedTagIds,
            message: { content: content, files: firstFile },
          });

          // If the first file was too large, log and stop sending anything else in this thread
          if (
            attachmentList.length > 0 &&
            attachmentList[0].size > MAX_FILE_SIZE
          ) {
            console.warn(
              `[LibrarySync] Stopping "${thread.name}" — first file too large (${(attachmentList[0].size / 1024 / 1024).toFixed(1)}MB).`,
            );
            await logFailedFile(
              attachmentList[0].name,
              thread.name,
              `File too large (${(attachmentList[0].size / 1024 / 1024).toFixed(1)}MB > 10MB)`,
            );
            totalCloned++;
            await wait(4000);
            continue;
          }

          // Send remaining starter attachments one by one
          let shouldStop = false;
          for (let i = 1; i < attachmentList.length; i++) {
            const a = attachmentList[i];
            if (a.size > MAX_FILE_SIZE) {
              console.warn(
                `[LibrarySync] Stopping "${thread.name}" — attachment too large (${(a.size / 1024 / 1024).toFixed(1)}MB).`,
              );
              await logFailedFile(
                a.name,
                thread.name,
                `File too large (${(a.size / 1024 / 1024).toFixed(1)}MB > 10MB)`,
              );
              shouldStop = true;
              break;
            }
            await newThread
              .send({ files: [new AttachmentBuilder(a.url, { name: a.name })] })
              .catch(async (err) => {
                console.error(`[LibrarySync] Failed "${a.name}":`, err.message);
                await logFailedFile(a.name, thread.name, err.message);
                shouldStop = true;
              });
            await wait(2000);
            if (shouldStop) break;
          }

          if (!shouldStop) {
            // Fetch and clone additional messages inside the thread
            const threadMessages = await thread.messages.fetch({ limit: 100 });
            const messagesToClone = Array.from(threadMessages.values())
              .filter((m) => m.id !== thread.id && !m.system)
              .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

            for (const msg of messagesToClone) {
              if (shouldStop) break;
              const msgContent = msg.content || "";
              const msgAttachments = Array.from(msg.attachments.values());

              if (msgContent.trim() !== "" || msgAttachments.length > 0) {
                // Check all attachments in this message first
                const oversized = msgAttachments.find(
                  (a) => a.size > MAX_FILE_SIZE,
                );
                if (oversized) {
                  console.warn(
                    `[LibrarySync] Stopping "${thread.name}" — message attachment too large.`,
                  );
                  await logFailedFile(
                    oversized.name,
                    thread.name,
                    `File too large (${(oversized.size / 1024 / 1024).toFixed(1)}MB > 10MB)`,
                  );
                  shouldStop = true;
                  break;
                }

                const firstMsgFile =
                  msgAttachments.length > 0 ?
                    [
                      new AttachmentBuilder(msgAttachments[0].url, {
                        name: msgAttachments[0].name,
                      }),
                    ]
                  : [];
                await newThread
                  .send({ content: msgContent, files: firstMsgFile })
                  .catch(async (err) => {
                    console.error(
                      `[LibrarySync] Failed to send message in ${thread.name}:`,
                      err.message,
                    );
                    if (msgAttachments.length > 0)
                      await logFailedFile(
                        msgAttachments[0].name,
                        thread.name,
                        err.message,
                      );
                    shouldStop = true;
                  });
                await wait(2000);
                if (shouldStop) break;

                for (let i = 1; i < msgAttachments.length; i++) {
                  const a = msgAttachments[i];
                  await newThread
                    .send({
                      files: [new AttachmentBuilder(a.url, { name: a.name })],
                    })
                    .catch(async (err) => {
                      console.error(
                        `[LibrarySync] Failed "${a.name}":`,
                        err.message,
                      );
                      await logFailedFile(a.name, thread.name, err.message);
                      shouldStop = true;
                    });
                  await wait(2000);
                  if (shouldStop) break;
                }
              }
            }
          }

          totalCloned++;
          // 4 seconds delay to respect Discord's rate limits
          await wait(4000);
        } catch (err) {
          console.error(
            `[LibrarySync] Failed to clone ${thread.name} in ${sourceChannel.name}:`,
            err.message,
          );
          totalFailed++;
        }
      }
    }

    console.log(
      `[LibrarySync] Finished full sync! Total Cloned: ${totalCloned}, Total Failed: ${totalFailed}`,
    );
    if (totalCloned > 0 || totalFailed > 0) {
      logInfo(
        client,
        `📚 **Library Auto-Sync Complete!**\nCloned **${totalCloned}** new posts across all forums to ${targetServer.name}. (Failed: ${totalFailed})`,
      );
    }
  } catch (error) {
    console.error("[LibrarySync] Error during full sync:", error);
    logError(client, error, "Library Auto-Sync");
  }
}

function initLibrarySync(client) {
  // Run once on startup (wait 10 seconds to ensure client is fully ready)
  setTimeout(() => runFullSync(client), 10000);

  // Run every 24 hours
  setInterval(() => runFullSync(client), 24 * 60 * 60 * 1000);
}

module.exports = { initLibrarySync, runFullSync };
