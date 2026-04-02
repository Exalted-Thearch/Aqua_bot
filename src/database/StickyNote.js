const mongoose = require("mongoose");

const stickyNoteSchema = new mongoose.Schema({
  channelId: {
    type: String,
    required: true,
    unique: true,
  },
  message: {
    type: String,
    required: true,
  },
  lastMessageId: {
    type: String,
    default: null,
  },
  delay: {
    type: Number,
    default: 30, // seconds
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("StickyNote", stickyNoteSchema);
