const mongoose = require("mongoose");

const serverConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  prefix: { type: String, default: "!" },
});

module.exports = mongoose.model("ServerConfig", serverConfigSchema);
