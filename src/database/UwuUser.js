const mongoose = require("mongoose");

const uwuUserSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    addedBy: {
      type: String,
      required: true,
    },
    addedAt: {
      type: String,
      default: () =>
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

module.exports = mongoose.model("UwuUser", uwuUserSchema);
