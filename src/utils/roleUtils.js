const axios = require("axios");
const { Routes } = require("discord.js");

async function validateImage(url) {
  try {
    const head = await axios.head(url);

    if (parseInt(head.headers["content-length"], 10) > 256000) {
      return {
        valid: false,
        error: "Image too large. **Max 256KB**.",
      };
    }

    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: "Failed to reach the image URL. Ensure it is a valid Image.",
    };
  }
}

function resolveColor(hex) {
  if (!hex) return null;
  // Remove hash and parse
  const cleanHex = hex.replace("#", "");
  const val = parseInt(cleanHex, 16);
  return isNaN(val) ? null : val;
}

function formatDiscordError(error) {
  if (error.message.includes("Invalid Form Body")) {
    if (error.message.includes("name[BASE_TYPE_MAX_LENGTH]")) {
      return "Role name is too long (max 100 characters).";
    }
    // Add other specific mappings here if needed
  }
  return error.message;
}

async function updateRoleColors(
  client,
  guildId,
  roleId,
  primaryHex,
  secondaryHex,
) {
  const primaryInt = resolveColor(primaryHex);
  const secondaryInt = resolveColor(secondaryHex);

  // Construct body based on whether secondary color is present
  const body = {};
  if (secondaryInt !== null) {
    body.colors = {
      primary_color: primaryInt,
      secondary_color: secondaryInt,
    };
  } else {
    body.color = primaryInt; // Fallback to standard
  }

  try {
    // Send Raw Patch Request
    await client.rest.patch(Routes.guildRole(guildId, roleId), { body });
    return { success: true };
  } catch (error) {
    console.error("Gradient API Error:", error);

    // Fallback attempt if gradient fails
    if (secondaryInt !== null) {
      try {
        await client.rest.patch(Routes.guildRole(guildId, roleId), {
          body: { color: primaryInt },
        });
        return {
          success: true,
          warning: "Could not apply gradient. Applied solid color.",
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return { success: false, error: error.message };
  }
}

function parseDuration(input) {
  const match = input.match(/^(\d+)\s*(m|min|h|d|w|mon|y)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const units = {
    m: { ms: 60 * 1000, label: "minute" },
    min: { ms: 60 * 1000, label: "minute" },
    h: { ms: 60 * 60 * 1000, label: "hour" },
    d: { ms: 24 * 60 * 60 * 1000, label: "day" },
    w: { ms: 7 * 24 * 60 * 60 * 1000, label: "week" },
    mon: { ms: 30 * 24 * 60 * 60 * 1000, label: "month" },
    y: { ms: 365 * 24 * 60 * 60 * 1000, label: "year" },
  };

  const data = units[unit];
  if (!data) return null;

  return {
    ms: value * data.ms,
    text: `${value} ${data.label}${value > 1 ? "s" : ""}`,
  };
}

module.exports = {
  validateImage,
  resolveColor,
  formatDiscordError,
  updateRoleColors,
  parseDuration,
};
