// bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');
const fetch = require('node-fetch');
const sharp = require('sharp');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const CONFIG = {
  token: process.env.BOT_TOKEN,
  logChannelId: process.env.LOG_CHANNEL_ID || null,
  cooldownMs: 60_000,
  dbPath: path.join(__dirname, 'roles.db'),
  sweepIntervalMs: 60 * 60 * 1000,
  exceptionDefaultMs: 6 * 30 * 24 * 60 * 60 * 1000,
  customAnchorRoleName: process.env.CUSTOM_ANCHOR_ROLE_NAME || 'Personal Roles Anchor'
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember]
});

const db = new sqlite3.Database(CONFIG.dbPath);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS user_roles (
    guild_id TEXT,
    user_id TEXT,
    role_id TEXT,
    created_at INTEGER,
    PRIMARY KEY (guild_id, user_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS exceptions (
    guild_id TEXT,
    user_id TEXT,
    granted_by TEXT,
    granted_at INTEGER,
    expires_at INTEGER,
    reason TEXT,
    PRIMARY KEY (guild_id, user_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    user_id TEXT,
    role_id TEXT,
    action TEXT,
    before TEXT,
    after TEXT,
    ts INTEGER
  )`);
});

const cooldown = new Map();

function isMemberBoosting(member) {
  return !!member?.premiumSince;
}
function keyFor(guildId, userId) { return `${guildId}:${userId}`; }

async function validateAttachmentOrUrl(attachmentUrl) {
  // Fetch file
  const head = await fetch(attachmentUrl, { method: 'HEAD' }).catch(() => null);
  if (head && head.ok && head.headers.has('content-length')) {
    const len = parseInt(head.headers.get('content-length') || '0', 10);
    if (len > 256 * 1024) throw new Error('Icon file too large (>256 KB).');
  }
  const res = await fetch(attachmentUrl);
  if (!res.ok) throw new Error('Failed to download image');
  const buffer = await res.buffer();
  if (buffer.length > 256 * 1024) throw new Error('Icon file too large (>256 KB).');
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error('Invalid image.');
  if (meta.width !== meta.height) throw new Error('Icon must be square (width===height).');
  if (meta.width < 64 || meta.height < 64) throw new Error('Icon must be at least 64x64 pixels.');
  return buffer;
}

// DB helpers (same as earlier)
function getUserRole(guildId, userId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT role_id FROM user_roles WHERE guild_id = ? AND user_id = ?`, [guildId, userId], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.role_id : null);
    });
  });
}
function setUserRole(guildId, userId, roleId) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT OR REPLACE INTO user_roles (guild_id, user_id, role_id, created_at) VALUES (?, ?, ?, ?)`,
      [guildId, userId, roleId, Date.now()], (err) => { if (err) return reject(err); resolve(); });
  });
}
function removeUserRole(guildId, userId) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM user_roles WHERE guild_id = ? AND user_id = ?`, [guildId, userId], (err) => { if (err) return reject(err); resolve(); });
  });
}
function getException(guildId, userId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT granted_by, granted_at, expires_at, reason FROM exceptions WHERE guild_id = ? AND user_id = ?`, [guildId, userId], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}
function addException(guildId, userId, grantedBy, msDuration, reason = null) {
  const now = Date.now();
  const expires = now + msDuration;
  return new Promise((resolve, reject) => {
    db.run(`INSERT OR REPLACE INTO exceptions (guild_id, user_id, granted_by, granted_at, expires_at, reason) VALUES (?, ?, ?, ?, ?, ?)`,
      [guildId, userId, grantedBy, now, expires, reason], function (err) { if (err) return reject(err); resolve({ granted_at: now, expires_at: expires }); });
  });
}
function removeException(guildId, userId) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM exceptions WHERE guild_id = ? AND user_id = ?`, [guildId, userId], (err) => { if (err) return reject(err); resolve(); });
  });
}
function listExceptionsForGuild(guildId) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT user_id, granted_by, granted_at, expires_at, reason FROM exceptions WHERE guild_id = ?`, [guildId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}
function writeLog({ guildId, userId, roleId, action, before = null, after = null }) {
  const ts = Date.now();
  db.run(`INSERT INTO logs (guild_id, user_id, role_id, action, before, after, ts) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [guildId, userId, roleId, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, ts]);
  if (CONFIG.logChannelId) {
    const ch = client.channels.cache.get(CONFIG.logChannelId);
    if (ch && ch.isTextBased()) ch.send(`[${new Date(ts).toISOString()}] ${action} — guild:${guildId} user:${userId} role:${roleId}`);
  }
}

async function mayCreateRole(guild, member) {
  if (!member) return false;
  if (isMemberBoosting(member)) return true;
  const ex = await getException(guild.id, member.id);
  if (!ex) return false;
  if (ex.expires_at && Date.now() > ex.expires_at) return false;
  return true;
}

/**
 * Create personal role placed between boosterRole and customAnchorRole if possible.
 * Tries to place at booster.position - 1. If that fails, tries custom.position + 1.
 * Fallback: no explicit positioning.
 */
async function createPersonalRole(guild, user) {
  const boosterRole = guild.roles.premiumSubscriberRole || null;
  const customAnchor = guild.roles.cache.find(r => r.name === CONFIG.customAnchorRoleName) || null;

  const newRole = await guild.roles.create({
    name: `${user.username}'s role`,
    permissions: 0,
    reason: `Personal role created by ${user.tag}`
  });

  // Attempt to set position intelligently
  const botHighest = guild.members.me.roles.highest;
  try {
    if (boosterRole && botHighest.position > boosterRole.position) {
      // try to place just below booster (booster.position - 1)
      const targetPos = Math.max(1, boosterRole.position - 1);
      await newRole.setPosition(targetPos);
    } else if (customAnchor && botHighest.position > customAnchor.position) {
      // place above custom anchor
      await newRole.setPosition(customAnchor.position + 1);
    }
  } catch (err) {
    // fallback: try alternative ordering or ignore
    try {
      if (customAnchor && botHighest.position > customAnchor.position) {
        await newRole.setPosition(customAnchor.position + 1);
      }
    } catch (e) {
      console.warn('Could not set role position precisely:', e?.message);
    }
  }
  return newRole;
}

// Command handlers (interactionCreate)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const guild = interaction.guild;
  const member = interaction.member;
  const cmd = interaction.commandName;

  if (!guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return interaction.reply({ ephemeral: true, content: 'I need Manage Roles permission to do that.' });
  }

  if (cmd === 'create-myrole') {
    await interaction.deferReply({ ephemeral: true });
    if (!await mayCreateRole(guild, member)) return interaction.editReply('You are not allowed to create a personal role. You must be boosting or have an admin-granted exception.');
    const existing = await getUserRole(guild.id, interaction.user.id);
    if (existing) return interaction.editReply('You already have a personal role created (one role per user).');

    // anchor checks: attempt but don't strictly require both anchors (fallbacks handled)
    const boosterRole = guild.roles.premiumSubscriberRole || null;
    if (boosterRole) {
      const botHighest = guild.members.me.roles.highest;
      if (botHighest.position <= boosterRole.position) {
        return interaction.editReply('My role is not high enough to place personal roles above the booster role. Have an admin move my role up.');
      }
    }
    try {
      const newRole = await createPersonalRole(guild, interaction.user);
      await setUserRole(guild.id, interaction.user.id, newRole.id);
      writeLog({ guildId: guild.id, userId: interaction.user.id, roleId: newRole.id, action: 'create', after: { name: newRole.name }});
      return interaction.editReply(`Created your personal role <@&${newRole.id}>. Use /edit-myrole to update it. Edits limited to once per minute.`);
    } catch (err) {
      console.error('create fail', err);
      return interaction.editReply(`Failed to create role: ${err.message}`);
    }
  }

  if (cmd === 'edit-myrole') {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString('name', false);
    const iconUrl = interaction.options.getString('icon_url', false);
    const pColor = interaction.options.getString('primary', false);
    const sColor = interaction.options.getString('secondary', false);
    const tColor = interaction.options.getString('tertiary', false);

    // attachment support: check attachments on the command message (the user should attach while invoking)
    // Note: With slash commands, attachments are not direct options; users attach the file in the modal or the file upload field, but many clients attach files with the command message context.
    // We'll check interaction.options.getAttachment if available, otherwise fall back to interaction.channel.lastMessage (best-effort).
    let attachmentBuffer = null;
    // Preferred: interaction has an attachment option when registered as "attachment" type; since we didn't register that,
    // try alternative: if the user attached in the reply, we can check interaction.options.getAttachment if it exists.
    try {
      const att = interaction.options.getAttachment ? interaction.options.getAttachment('icon') : null;
      if (att) {
        // validate via att.url
        attachmentBuffer = await validateAttachmentOrUrl(att.url);
      } else {
        // Try checking the interaction's message attachments (best-effort) - note: slash commands usually don't carry attachments.
        // We'll instead rely on user to attach via message just before calling command OR provide icon_url as fallback.
      }
    } catch (err) {
      return interaction.editReply(`Icon validation failed: ${err.message}`);
    }

    // fallback: if no attachment, use icon_url option
    if (!attachmentBuffer && iconUrl) {
      try {
        attachmentBuffer = await validateAttachmentOrUrl(iconUrl);
      } catch (err) {
        return interaction.editReply(`Icon URL validation failed: ${err.message}`);
      }
    }

    const k = keyFor(guild.id, interaction.user.id);
    const next = cooldown.get(k) || 0;
    if (Date.now() < next) return interaction.editReply('You are on cooldown. Please wait before editing again.');

    const roleId = await getUserRole(guild.id, interaction.user.id);
    if (!roleId) return interaction.editReply('No personal role recorded. Use /create-myrole first.');
    const role = guild.roles.cache.get(roleId);
    if (!role) return interaction.editReply('Your role was not found in this server (maybe deleted). Contact an admin.');

    const botHighest = guild.members.me.roles.highest;
    if (botHighest.position <= role.position) return interaction.editReply('I cannot edit your role because it is equal/higher than my top role. Move my role higher.');

    const before = { name: role.name, colors: role.colors || null, iconURL: role.iconURL() || null };
    try {
      if (attachmentBuffer) {
        await role.setIcon(attachmentBuffer, `Requested by ${interaction.user.tag}`);
      }
      if (name) await role.setName(name, `Requested by ${interaction.user.tag}`);
      if (pColor || sColor || tColor) {
        const colors = {};
        if (pColor) colors.primaryColor = pColor.startsWith('#') ? pColor : `#${pColor}`;
        if (sColor) colors.secondaryColor = sColor.startsWith('#') ? sColor : `#${sColor}`;
        if (tColor) colors.tertiaryColor = tColor.startsWith('#') ? tColor : `#${tColor}`;
        await role.setColors(colors, `Requested by ${interaction.user.tag}`);
      }

      cooldown.set(k, Date.now() + CONFIG.cooldownMs);
      const after = { name: role.name, colors: role.colors || null, iconURL: role.iconURL() || null };
      writeLog({ guildId: guild.id, userId: interaction.user.id, roleId: role.id, action: 'edit', before, after });
      return interaction.editReply('Role updated successfully. (1-min cooldown enforced.)');
    } catch (err) {
      console.error('edit fail', err);
      return interaction.editReply(`Failed to update role: ${err.message}`);
    }
  }

  // Admin commands: grant-exception, revoke-exception, list-exceptions, revoke-role, my-role-info
  if (cmd === 'grant-exception') {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.editReply('You need Manage Roles to grant exceptions.');
    const target = interaction.options.getUser('user', true);
    const months = interaction.options.getInteger('months', false) || 6;
    const reason = interaction.options.getString('reason', false) || null;
    const ms = months * 30 * 24 * 60 * 60 * 1000;
    try {
      const info = await addException(guild.id, target.id, interaction.user.id, ms, reason);
      writeLog({ guildId: guild.id, userId: target.id, roleId: null, action: 'exception_granted', after: { expires_at: info.expires_at, reason }});
      return interaction.editReply(`Granted exception to <@${target.id}> until <t:${Math.floor(info.expires_at/1000)}:F>.`);
    } catch (err) {
      console.error('grant fail', err);
      return interaction.editReply(`Failed to grant exception: ${err.message}`);
    }
  }

  if (cmd === 'revoke-exception') {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.editReply('You need Manage Roles to revoke exceptions.');
    const target = interaction.options.getUser('user', true);
    try {
      await removeException(guild.id, target.id);
      writeLog({ guildId: guild.id, userId: target.id, roleId: null, action: 'exception_revoked' });
      return interaction.editReply(`Exception revoked for <@${target.id}>.`);
    } catch (err) {
      console.error('revoke exception fail', err);
      return interaction.editReply(`Failed to revoke exception: ${err.message}`);
    }
  }

  if (cmd === 'list-exceptions') {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.editReply('You need Manage Roles to view exceptions.');
    try {
      const rows = await listExceptionsForGuild(guild.id);
      if (!rows.length) return interaction.editReply('No exceptions found.');
      const lines = rows.map(r => `<@${r.user_id}> expires: <t:${Math.floor(r.expires_at/1000)}:F> by <@${r.granted_by}>${r.reason ? ' — ' + r.reason : ''}`);
      return interaction.editReply(lines.join('\n'));
    } catch (err) {
      console.error('list fail', err);
      return interaction.editReply(`Failed to list exceptions: ${err.message}`);
    }
  }

  if (cmd === 'revoke-role') {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.editReply('You need Manage Roles to revoke personal roles.');
    const target = interaction.options.getUser('user', true);
    const roleId = await getUserRole(guild.id, target.id);
    if (!roleId) return interaction.editReply('That user has no recorded personal role.');
    const role = guild.roles.cache.get(roleId);
    try {
      if (role) await role.delete(`Revoked by ${interaction.user.tag}`);
      await removeUserRole(guild.id, target.id);
      writeLog({ guildId: guild.id, userId: target.id, roleId, action: 'role_revoked' });
      return interaction.editReply(`Deleted personal role for <@${target.id}>.`);
    } catch (err) {
      console.error('revoke role fail', err);
      return interaction.editReply(`Failed to revoke role: ${err.message}`);
    }
  }

  if (cmd === 'my-role-info') {
    const roleId = await getUserRole(guild.id, interaction.user.id);
    if (!roleId) return interaction.reply({ ephemeral: true, content: 'No personal role recorded.' });
    const role = guild.roles.cache.get(roleId);
    if (!role) return interaction.reply({ ephemeral: true, content: 'Role recorded but not found in guild.' });
    return interaction.reply({ ephemeral: true, content: `Your role: ${role.name} (<@&${role.id}>)\nColor data: ${JSON.stringify(role.colors)}\nIcon: ${role.iconURL()}` });
  }
});

// Watch booster status changes
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const guild = newMember.guild;
    const wasBoosting = !!oldMember.premiumSince;
    const nowBoosting = !!newMember.premiumSince;
    if (wasBoosting && !nowBoosting) {
      const ex = await getException(guild.id, newMember.id);
      if (ex && ex.expires_at && Date.now() < ex.expires_at) return;
      const roleId = await getUserRole(guild.id, newMember.id);
      if (!roleId) return;
      const role = guild.roles.cache.get(roleId);
      const botHighest = guild.members.me.roles.highest;
      if (role && botHighest.position > role.position) {
        await role.delete(`User stopped boosting and has no valid exception`);
      }
      await removeUserRole(guild.id, newMember.id);
      writeLog({ guildId: guild.id, userId: newMember.id, roleId, action: 'deleted_on_unboost' });
      try { await newMember.send(`Your personal role in ${guild.name} was deleted because you are no longer boosting and do not have an active exception.`); } catch {}
    }
  } catch (err) { console.error('guildMemberUpdate err', err); }
});

// Sweep (expired exceptions + stale roles)
async function sweepAllGuilds() {
  try {
    const now = Date.now();
    db.all(`SELECT guild_id, user_id FROM exceptions WHERE expires_at IS NOT NULL AND expires_at <= ?`, [now], async (err, rows) => {
      if (err) return console.error('sweep exceptions select err', err);
      for (const r of rows) {
        await removeException(r.guild_id, r.user_id);
        writeLog({ guildId: r.guild_id, userId: r.user_id, roleId: null, action: 'exception_expired' });
      }
    });

    db.all(`SELECT guild_id, user_id, role_id FROM user_roles`, async (err, rows) => {
      if (err) return console.error('sweep user_roles select err', err);
      for (const r of rows) {
        try {
          const g = client.guilds.cache.get(r.guild_id);
          if (!g) continue;
          const member = await g.members.fetch(r.user_id).catch(() => null);
          const ex = await getException(r.guild_id, r.user_id);
          const validException = ex && (!ex.expires_at || ex.expires_at > Date.now());
          const boosting = member ? isMemberBoosting(member) : false;
          if (!boosting && !validException) {
            const role = g.roles.cache.get(r.role_id);
            const botHighest = g.members.me.roles.highest;
            if (role && botHighest.position > role.position) {
              await role.delete(`Periodic sweep: user not boosting and no valid exception`);
            }
            await removeUserRole(r.guild_id, r.user_id);
            writeLog({ guildId: r.guild_id, userId: r.user_id, roleId: r.role_id, action: 'deleted_on_sweep' });
            if (member) { try { await member.send(`Your personal role in ${g.name} was deleted because you're not boosting and have no active exception.`); } catch {} }
          }
        } catch (errInner) { console.error('sweep per-row error', errInner); }
      }
    });
  } catch (e) { console.error('sweepAllGuilds error', e); }
}

client.once('ready', () => {
  console.log('Bot ready', client.user.tag);
  setInterval(sweepAllGuilds, CONFIG.sweepIntervalMs);
  setTimeout(sweepAllGuilds, 10_000);
});

client.login(CONFIG.token);
