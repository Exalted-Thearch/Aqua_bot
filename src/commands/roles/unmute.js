// Thin re-export so the command loader registers /unmute as its own slash command.
const { unmuteCommand } = require("./mute");

module.exports = {
  data: unmuteCommand.data,
  execute: unmuteCommand.execute,
};
