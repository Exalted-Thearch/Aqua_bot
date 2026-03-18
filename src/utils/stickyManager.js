const StickyNote = require("../database/StickyNote");
const { logInfo, logError } = require("./logger");

class StickyManager {
  constructor() {
    this.cache = new Set(); // Stores channel IDs with active stickies
    this.timers = new Map(); // Stores timeout IDs: channelId -> timeout
  }

  /**
   * Initialize the manager by loading active sticky channels from DB into cache
   */
  async init() {
    try {
      const stickies = await StickyNote.find({}, { channelId: 1 });
      for (const note of stickies) {
        this.cache.add(note.channelId);
      }
      console.log(
        `[StickyManager] Loaded ${this.cache.size} sticky channels into cache.`,
      );
    } catch (error) {
      console.error("[StickyManager] Failed to initialize cache:", error);
    }
  }

  /**
   * Handle incoming messages to trigger sticky logic
   * @param {Message} message
   */
  async handleMessage(message) {
    if (!message.guild || message.author.bot) return;

    // Quick check against cache to avoid DB calls
    if (!this.cache.has(message.channel.id)) return;

    const channelId = message.channel.id;

    // Clear existing timer if any (debounce)
    if (this.timers.has(channelId)) {
      clearTimeout(this.timers.get(channelId));
      this.timers.delete(channelId);
    }

    // Set new timer for 30 seconds
    const timer = setTimeout(() => {
      this.resendSticky(message.channel);
      this.timers.delete(channelId);
    }, 30000);

    this.timers.set(channelId, timer);
  }

  /**
   * Resend the sticky message for a channel
   * @param {TextChannel} channel
   */
  async resendSticky(channel) {
    try {
      const note = await StickyNote.findOne({ channelId: channel.id });

      // If note was deleted from DB in the meantime
      if (!note) {
        this.cache.delete(channel.id);
        return false;
      }

      // Try to delete the old message
      if (note.lastMessageId) {
        try {
          // Verify message exists before trying to delete to avoid errors
          // Use fetch to check if it's fetchable, or just delete and catch error
          // Deleting by ID directly is efficient
          await channel.messages.delete(note.lastMessageId).catch((err) => {
            // Ignore "Unknown Message" error (10008), log others
            if (err.code !== 10008) {
              console.log(
                `[StickyManager] Failed to delete old message: ${err.message}`,
              );
            }
          });
        } catch (ignored) {
          // Fallback catch
        }
      }

      // Send new message
      const newMessage = await channel.send({
        content: note.message,
        allowedMentions: { parse: [] }, // Disable all mentions
      });

      // Update DB with new message ID
      note.lastMessageId = newMessage.id;
      await note.save();
      return true;
    } catch (error) {
      // Handle specific errors like Missing Access or Channel Deleted
      if (error.code === 50013 || error.code === 50001) {
        console.warn(
          `[StickyManager] Missing permissions in channel ${channel.id}, disabling sticky.`,
        );
        await this.removeSticky(channel.id);
      } else if (error.code === 10003) {
        console.warn(
          `[StickyManager] Channel ${channel.id} deleted, removing sticky.`,
        );
        await this.removeSticky(channel.id);
      } else {
        logError(channel.client, error, `Sticky Resend in ${channel.name}`);
      }
      return false;
    }
  }

  /**
   * Add or Update a sticky note
   * @param {string} channelId
   * @param {string} message
   * @param {Client} client
   * @returns {Promise<boolean>} Success
   */
  async addSticky(channelId, message, client) {
    // Upsert the sticky note
    let note = await StickyNote.findOne({ channelId });

    if (!note) {
      note = new StickyNote({ channelId, message });
    } else {
      note.message = message;
    }

    // Save initial state to DB
    await note.save();

    // Add to cache
    this.cache.add(channelId);

    // Trigger immediate send logic (or just send directly and set ID)
    const channel = client.channels.cache.get(channelId);
    if (channel) {
      // Clear any pending timer
      if (this.timers.has(channelId)) {
        clearTimeout(this.timers.get(channelId));
        this.timers.delete(channelId);
      }
      // Force immediate resend which handles deletion of old message if it exists in DB
      return await this.resendSticky(channel);
    }
    return false; // Channel not found
  }

  /**
   * Remove a sticky note
   * @param {string} channelId
   */
  async removeSticky(channelId, client = null) {
    const note = await StickyNote.findOne({ channelId });
    if (note) {
      // Try to delete last message if possible
      if (client && note.lastMessageId) {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          await channel.messages.delete(note.lastMessageId).catch(() => {});
        }
      }
      await StickyNote.deleteOne({ channelId });
    }

    this.cache.delete(channelId);

    if (this.timers.has(channelId)) {
      clearTimeout(this.timers.get(channelId));
      this.timers.delete(channelId);
    }
  }

  async getSticky(channelId) {
    return await StickyNote.findOne({ channelId });
  }

  async getAllStickies() {
    return await StickyNote.find({});
  }
}

module.exports = new StickyManager();
