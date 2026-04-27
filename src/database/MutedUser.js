const mongoose = require("mongoose");

/**
 * Tracks currently muted users.
 * Stores the role IDs that were stripped so they can be restored on unmute.
 */
const mutedUserSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  // Roles removed from the user (to restore later)
  savedRoleIds: {
    type: [String],
    default: [],
  },
  mutedBy: {
    type: String, // userId of the moderator
    default: null,
  },
  reason: {
    type: String,
    default: "No reason provided",
  },
  // Unix ms timestamp when the mute expires (null = permanent)
  expiresAt: {
    type: Number,
    default: null,
    index: true,
  },
  mutedAt: {
    type: Number,
    default: () => Date.now(),
  },
});

// Compound unique index so we can't double-mute the same user in the same guild
mutedUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("MutedUser", mutedUserSchema);
