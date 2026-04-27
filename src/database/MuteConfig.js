const mongoose = require("mongoose");

/**
 * Stores the configured mute role per guild.
 * Set via /setmuterole slash command.
 */
const muteConfigSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  muteRoleId: {
    type: String,
    required: true,
  },
  setBy: {
    type: String, // userId of the mod who set it
    default: null,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("MuteConfig", muteConfigSchema);
