require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require("discord.js");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const express = require("express");
const axios = require("axios");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const INACTIVITY_MS = parseInt(process.env.INACTIVITY_MS) || 20 * 60 * 1000;

if (!TOKEN || !CHANNEL_ID || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Variables de entorno faltantes");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
});

const rolePermissions = new Map();
const commandCooldowns = new Map();
const activeSorteos = new Map();
const sorteoTimers = new Map();
const pausedSorteos = new Map();
const userMessages = new Map();
const mutedUsers = new Map();
const autoMessageTimers = new Map();
const scheduledUnbans = new Map();

const COOLDOWN_MS = 3000;
const GIVEAWAY_EMOJI = "🎉";
const AUTO_MESSAGE_MIN_INTERVAL = 5 * 60 * 1000;
const AUTO_MESSAGE_MAX_INTERVAL = 15 * 60 * 1000;

const mensajes = {
  middleman: {
    title: "📢 Servicio de Middleman 🛠️",
    descriptionES: "En este servidor contamos con middleman confiables para que tus tradeos sean 100% seguros.\nPide a través de tickets: https://discord.com/channels/1418586395672449107/1419067482450165952",
    descriptionEN: "On this server we have reliable middlemen so your trades are 100% safe.\nRequested through tickets: https://discord.com/channels/1418586395672449107/1419067482450165952"
  },
  tiktok: {
    title: "🎵 Síguenos en TikTok",
    descriptionES: "https://www.tiktok.com/@venta.brainbrots0 🇪🇸",
    descriptionEN: "https://www.tiktok.com/@venta.brainbrots0 🇺🇸"
  },
  advertencia: {
    title: "🚨 Advertencia",
    descriptionES: "Recuerden no unirse a links de desconocidos.",
    descriptionEN: "Remember not to join unknown links."
  },
  inventario: {
    title: "🗃️ INVENTARIO",
    descriptionES: "Si les interesa algo de <#1419062034586140732>, creen ticket: https://discord.com/channels/1418586395672449107/1419067482450165952",
    descriptionEN: "If you're interested in something from <#1419062034586140732>, create a ticket."
  }
};

function getRandomDelay(min = 2000, max = 8000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomInterval() {
  return Math.floor(Math.random() * (AUTO_MESSAGE_MAX_INTERVAL - AUTO_MESSAGE_MIN_INTERVAL + 1)) + AUTO_MESSAGE_MIN_INTERVAL;
}

function hasPermission(member, guildId, commandType) {
  const isOwner = member.user.id === member.guild.ownerId;
  const isAdmin = member.permissions ? member.permissions.has(PermissionsBitField.Flags.Administrator) : false;
  if (isOwner || isAdmin) return true;
  const guildPerms = rolePermissions.get(guildId) || new Map();
  for (const roleId of member.roles.cache.keys()) {
    const rolePerms = guildPerms.get(roleId);
    if (rolePerms && rolePerms.includes(commandType)) return true;
  }
  return false;
}

async function sendDecoratedMessage(channelId, tipo) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    const data = mensajes[tipo];

    const embed = new EmbedBuilder()
      .setTitle("✅ USUARIO DESBANEADO")
      .setColor(0xFF0000)
      .setThumbnail(avatarURL || "https://i.imgur.com/Qr0ZpWQ.png")
      .addFields(
        { name: "👤 Usuario", value: `${userTag} (${userId})`, inline: true },
        { name: "🛡️ Moderador", value: `${interaction.user}`, inline: true },
        { name: "📄 Razón", value: reason || "No especificada" }
      )
      .setFooter({ text: `ID: ${userId} • ${new Date().toLocaleString("es-ES")}` })
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });

  } catch (err) {
    console.error(`Error enviando mensaje decorado: ${err.message}`);
  }
}


async function sendMessage(channelId, message, delay = 0) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    if (typeof message === "string") {
      await channel.send(message);
    } else {
      await channel.send(message);
    }
  } catch (err) {
    console.error(`Error enviando mensaje: ${err.message}`);
  }
}

function checkSpam(userId, content) {
  const now = Date.now();
  const userKey = userId;
  if (!userMessages.has(userKey)) {
    userMessages.set(userKey, []);
  }
  const messages = userMessages.get(userKey);
  const validMessages = messages.filter(msg => now - msg.timestamp < 1000);
  const repeatedMessages = validMessages.filter(msg => msg.content === content);
  validMessages.push({ content, timestamp: now });
  userMessages.set(userKey, validMessages);
  return repeatedMessages.length >= 2;
}

async function muteUser(guild, userId, duration = 60 * 1000) {
  try {
    const member = await guild.members.fetch(userId);
    let muteRole = guild.roles.cache.find(role => role.name === "Muted");
    if (!muteRole) {
      muteRole = await guild.roles.create({ name: "Muted", color: "#808080", permissions: [] });
      for (const [, channel] of guild.channels.cache) {
        try {
          await channel.permissionOverwrites.edit(muteRole, { SendMessages: false, AddReactions: false });
        } catch {}
      }
    }
    await member.roles.add(muteRole);
    mutedUsers.set(userId, Date.now() + duration);
    setTimeout(async () => {
      try {
        await member.roles.remove(muteRole);
        mutedUsers.delete(userId);
      } catch (err) {
        console.error(`Error removiendo mute: ${err.message}`);
      }
    }, duration);
    return true;
  } catch (err) {
    console.error(`Error muteando usuario: ${err.message}`);
    return false;
  }
}

function scheduleRandomMessage(channelId) {
  if (autoMessageTimers.has(channelId)) {
    clearTimeout(autoMessageTimers.get(channelId));
  }
  const interval = getRandomInterval();
  const timer = setTimeout(async () => {
    const messageTypes = ['tiktok', 'inventario', 'middleman', 'advertencia'];
    const randomType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
    const stagger = getRandomDelay(0, 5000);
    await sendDecoratedMessage(channelId, randomType);
    scheduleRandomMessage(channelId);
  }, interval);
  autoMessageTimers.set(channelId, timer);
}

let timers = {};

function resetTimer(channelId = CHANNEL_ID) {
  if (timers[channelId]) clearTimeout(timers[channelId]);
  timers[channelId] = setTimeout(async () => {
    const order = ['middleman', 'tiktok', 'advertencia'];
    for (const tipo of order) {
      const delay = getRandomDelay(0, 8000);
      setTimeout(() => sendDecoratedMessage(channelId, tipo), delay);
    }
  }, INACTIVITY_MS);
}

function parseDurationString(input) {
  if (!input) return null;
  const s = input.trim();
  const regex = /^(\d+)\s*([Dd]|[Ss]|[Hh]|[Mm]in|[Mm]es)$/i;
  const m = s.match(regex);
  if (!m) return null;
  const value = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const now = Date.now();
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  if (unit === 's') return value * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  if (unit === 'min') return value * 60 * 1000;
  if (unit === 'mes') return value * 30 * 24 * 60 * 60 * 1000;
  return null;
}

async function pauseGiveaway(messageId) {
  const giveaway = activeSorteos.get(messageId);
  if (!giveaway || giveaway.ended) return false;
  if (sorteoTimers.has(messageId)) {
    clearTimeout(sorteoTimers.get(messageId));
    sorteoTimers.delete(messageId);
  }
  const remainingTime = giveaway.endTime - Date.now();
  pausedSorteos.set(messageId, { remainingTime, pausedAt: Date.now() });
  giveaway.paused = true;
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);
    const embed = message.embeds[0];
    const pausedEmbed = new EmbedBuilder()
      .setTitle(embed.title)
      .setDescription(embed.description + "\n\n⏸️ **SORTEO PAUSADO**")
      .setColor(0xFFFF00)
      .setImage(embed.image?.url)
      .setFooter({ text: "Sorteo pausado • " + embed.footer?.text });
    await message.edit({ embeds: [pausedEmbed] });
    return true;
  } catch (err) {
    console.error(`Error pausando sorteo: ${err.message}`);
    return false;
  }
}

async function resumeGiveaway(messageId) {
  const giveaway = activeSorteos.get(messageId);
  const pausedData = pausedSorteos.get(messageId);
  if (!giveaway || !pausedData || giveaway.ended) return false;
  const newEndTime = Date.now() + pausedData.remainingTime;
  giveaway.endTime = newEndTime;
  giveaway.paused = false;
  pausedSorteos.delete(messageId);
  const timeoutId = setTimeout(() => {
    endGiveaway(messageId);
  }, pausedData.remainingTime);
  sorteoTimers.set(messageId, timeoutId);
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);
    const embed = message.embeds[0];
    const resumedEmbed = new EmbedBuilder()
      .setTitle(embed.title)
      .setDescription(embed.description.replace("\n\n⏸️ **SORTEO PAUSADO**", "") + `\n\n**Termina:** <t:${Math.floor(newEndTime / 1000)}:R>`)
      .setColor(0x00FF00)
      .setImage(embed.image?.url)
      .setFooter({ text: `Termina el ${new Date(newEndTime).toLocaleString('es-ES')} • REANUDADO` })
      .setTimestamp(new Date(newEndTime));
    await message.edit({ embeds: [resumedEmbed] });
    return true;
  } catch (err) {
    console.error(`Error reanudando sorteo: ${err.message}`);
    return false;
  }
}

async function cancelGiveaway(messageId) {
  const giveaway = activeSorteos.get(messageId);
  if (!giveaway) return false;
  if (sorteoTimers.has(messageId)) {
    clearTimeout(sorteoTimers.get(messageId));
    sorteoTimers.delete(messageId);
  }
  giveaway.ended = true;
  giveaway.cancelled = true;
  pausedSorteos.delete(messageId);
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);
    const embed = message.embeds[0];
    const cancelledEmbed = new EmbedBuilder()
      .setTitle(embed.title)
      .setDescription(embed.description + "\n\n❌ **SORTEO CANCELADO**")
      .setColor(0xFF0000)
      .setImage(embed.image?.url)
      .setFooter({ text: "Sorteo cancelado • " + new Date().toLocaleString('es-ES') });
    await message.edit({ embeds: [cancelledEmbed] });
    await channel.send(`❌ Sorteo **${giveaway.objeto}** cancelado por administrador.`);
    activeSorteos.delete(messageId);
    return true;
  } catch (err) {
    console.error(`Error cancelando sorteo: ${err.message}`);
    return false;
  }
}

async function endGiveaway(messageId) {
  const giveaway = activeSorteos.get(messageId);
  if (!giveaway || giveaway.ended) return;
  giveaway.ended = true;
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);
    const reaction = message.reactions.cache.get(GIVEAWAY_EMOJI);
    if (!reaction) {
      await channel.send(`🎉 Sorteo **${giveaway.objeto}** terminado\n❌ Sin participantes válidos.`);
      activeSorteos.delete(messageId);
      return;
    }
    const users = await reaction.users.fetch();
    const participants = users.filter(u => !u.bot);
    if (participants.size === 0) {
      await channel.send(`🎉 Sorteo **${giveaway.objeto}** terminado\n❌ Sin participantes válidos.`);
      activeSorteos.delete(messageId);
      return;
    }
    const winner = participants.random();
    const winnerEmbed = new EmbedBuilder()
      .setTitle("🎉 ¡SORTEO TERMINADO!")
      .setDescription(`**Ganador:** ${winner}\n**Premio:** ${giveaway.objeto}`)
      .setColor(0x00FF00)
      .setFooter({ text: `Participantes: ${participants.size}` })
      .setTimestamp();
    await channel.send({ embeds: [winnerEmbed] });
    const embed = message.embeds[0];
    const endedEmbed = new EmbedBuilder()
      .setTitle(embed.title)
      .setDescription(embed.description + `\n\n🏆 **GANADOR:** ${winner}`)
      .setColor(0x00FF00)
      .setImage(embed.image?.url)
      .setFooter({ text: `Sorteo terminado • ${participants.size} participantes` });
    await message.edit({ embeds: [endedEmbed] });
    activeSorteos.delete(messageId);
  } catch (err) {
    console.error(`Error terminando sorteo: ${err.message}`);
    activeSorteos.delete(messageId);
  }
}

async function handleAlertaCommand(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownEnd = commandCooldowns.get(userId) || 0;
  if (now < cooldownEnd) {
    return await interaction.reply({ content: `⏰ Espera ${Math.ceil((cooldownEnd - now) / 1000)}s antes de usar este comando.`, flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  commandCooldowns.set(userId, now + COOLDOWN_MS);
  if (!interaction.guild) {
    return await interaction.editReply({ content: "❌ Este comando solo funciona en servidores." });
  }
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  if (!hasPermission(member, guild.id, "alerta")) {
    return await interaction.editReply({ content: "❌ No tienes permisos para usar este comando." });
  }
  const tipo = interaction.options.getString("tipo");
  if (!mensajes[tipo]) {
    return await interaction.editReply({ content: "❌ Tipo de alerta inválido." });
  }
  await sendDecoratedMessage(CHANNEL_ID, tipo);
  await interaction.editReply({ content: "✅ Mensaje de alerta enviado correctamente." });
  resetTimer(CHANNEL_ID);
}

async function handleSorteoCommand(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownEnd = commandCooldowns.get(`sorteo_${userId}`) || 0;
  if (now < cooldownEnd) {
    return await interaction.reply({ content: `⏰ Espera ${Math.ceil((cooldownEnd - now) / 1000)}s antes de crear otro sorteo.`, flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  commandCooldowns.set(`sorteo_${userId}`, now + 10000);
  if (!interaction.guild) {
    return await interaction.editReply({ content: "❌ Este comando solo funciona en servidores." });
  }
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  if (!hasPermission(member, guild.id, "sorteo")) {
    return await interaction.editReply({ content: "❌ No tienes permisos para crear sorteos." });
  }
  const objeto = interaction.options.getString("objeto");
  const descripcion = interaction.options.getString("descripcion");
  const imagenAttachment = interaction.options.getAttachment("imagen");
  const imagenUrlOption = interaction.options.getString("imagen_url");
  const duracionStr = interaction.options.getString("duracion");
  const durationMs = parseDurationString(duracionStr);
  if (!durationMs) {
    return await interaction.editReply({ content: "❌ Duración inválida. Usa formatos: 1D 1H 1Min 1S 1Mes" });
  }
  const maxMs = 30 * 24 * 60 * 60 * 1000;
  if (durationMs < 1000 || durationMs > maxMs) {
    return await interaction.editReply({ content: "❌ La duración debe estar entre 1S y 30Mes(es) aproximados." });
  }
  let imageUrl = null;
  if (imagenAttachment && imagenAttachment.url) imageUrl = imagenAttachment.url;
  else if (imagenUrlOption && /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(imagenUrlOption)) imageUrl = imagenUrlOption;
  if (!imageUrl) {
    return await interaction.editReply({ content: "❌ Debes subir una imagen válida (archivo o URL terminado en jpg/png/gif/webp)." });
  }
  const channel = interaction.channel;
  const endTime = new Date(Date.now() + durationMs);
  const embed = new EmbedBuilder()
    .setTitle(`🎉 SORTEO: ${objeto}`)
    .setDescription(`${descripcion}\n\nReacciona con ${GIVEAWAY_EMOJI} para participar\n**Termina:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n\nOrganizado por ${interaction.user}`)
    .setColor(0x5865F2)
    .setImage(imageUrl)
    .setFooter({ text: `Termina el ${endTime.toLocaleString('es-ES')}` })
    .setTimestamp(endTime);
  const giveawayMessage = await channel.send({ embeds: [embed] });
  await giveawayMessage.react(GIVEAWAY_EMOJI);
  activeSorteos.set(giveawayMessage.id, {
    messageId: giveawayMessage.id,
    channelId: channel.id,
    guildId: guild.id,
    objeto,
    descripcion,
    createdBy: interaction.user.id,
    endTime: endTime.getTime(),
    ended: false,
    paused: false,
    cancelled: false
  });
  const timeoutId = setTimeout(() => {
    endGiveaway(giveawayMessage.id);
  }, durationMs);
  sorteoTimers.set(giveawayMessage.id, timeoutId);
  await interaction.editReply({ content: `✅ Sorteo creado correctamente.\n**ID del sorteo:** \`${giveawayMessage.id}\`\n**Duración:** ${duracionStr}` });
}

async function handleExtenderCommand(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownEnd = commandCooldowns.get(`extend_${userId}`) || 0;
  if (now < cooldownEnd) {
    return await interaction.reply({ content: `⏰ Espera ${Math.ceil((cooldownEnd - now) / 1000)}s antes de extender otro sorteo.`, flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  commandCooldowns.set(`extend_${userId}`, now + 5000);
  if (!interaction.guild) {
    return await interaction.editReply({ content: "❌ Este comando solo funciona en servidores." });
  }
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  if (!hasPermission(member, guild.id, "extender")) {
    return await interaction.editReply({ content: "❌ No tienes permisos para extender sorteos." });
  }
  const messageId = interaction.options.getString("mensaje_id");
  const tiempoStr = interaction.options.getString("tiempo");
  const tiempoMs = parseDurationString(tiempoStr);
  if (!activeSorteos.has(messageId)) {
    return await interaction.editReply({ content: "❌ No se encontró un sorteo activo con ese ID." });
  }
  const giveaway = activeSorteos.get(messageId);
  if (giveaway.ended || giveaway.cancelled) {
    return await interaction.editReply({ content: "❌ Este sorteo ya terminó o fue cancelado." });
  }
  if (giveaway.paused) {
    return await interaction.editReply({ content: "❌ No puedes extender un sorteo pausado. Reanúdalo primero." });
  }
  if (!tiempoMs) {
    return await interaction.editReply({ content: "❌ Tiempo inválido. Usa formatos: 1D 1H 1Min 1S 1Mes" });
  }
  if (sorteoTimers.has(messageId)) {
    clearTimeout(sorteoTimers.get(messageId));
    sorteoTimers.delete(messageId);
  }
  const newEndTime = giveaway.endTime + tiempoMs;
  giveaway.endTime = newEndTime;
  activeSorteos.set(messageId, giveaway);
  const timeoutId = setTimeout(() => {
    endGiveaway(messageId);
  }, newEndTime - Date.now());
  sorteoTimers.set(messageId, timeoutId);
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);
    const embed = message.embeds[0];
    const newEmbed = new EmbedBuilder()
      .setTitle(embed.title)
      .setDescription(embed.description.replace(/\*\*Termina:\*\* <t:\d+:R>/, `**Termina:** <t:${Math.floor(newEndTime / 1000)}:R>`))
      .setColor(0x00FF00)
      .setImage(embed.image?.url)
      .setFooter({ text: `Termina el ${new Date(newEndTime).toLocaleString('es-ES')} • EXTENDIDO` })
      .setTimestamp(new Date(newEndTime));
    await message.edit({ embeds: [newEmbed] });
    await channel.send(`⏰ Sorteo **${giveaway.objeto}** extendido por ${tiempoStr} adicionales por ${interaction.user}`);
    await interaction.editReply({ content: `✅ Sorteo extendido correctamente por ${tiempoStr}.` });
  } catch (err) {
    console.error(`Error extendiendo sorteo: ${err.message}`);
    await interaction.editReply({ content: "⚠️ Error al procesar la extensión del sorteo." });
  }
}

async function handleControlSorteoCommand(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownEnd = commandCooldowns.get(`control_${userId}`) || 0;
  if (now < cooldownEnd) {
    return await interaction.reply({ content: `⏰ Espera ${Math.ceil((cooldownEnd - now) / 1000)}s antes de controlar otro sorteo.`, flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });
  commandCooldowns.set(`control_${userId}`, now + 3000);
  if (!interaction.guild) {
    return await interaction.editReply({ content: "❌ Este comando solo funciona en servidores." });
  }
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  if (!hasPermission(member, guild.id, "sorteo")) {
    return await interaction.editReply({ content: "❌ No tienes permisos para controlar sorteos." });
  }
  const accion = interaction.options.getString("accion");
  const messageId = interaction.options.getString("mensaje_id");
  if (!activeSorteos.has(messageId)) {
    return await interaction.editReply({ content: "❌ No se encontró un sorteo activo con ese ID." });
  }
  const giveaway = activeSorteos.get(messageId);
  let result = false;
  let message = "";
  switch (accion) {
    case "pausar":
      if (giveaway.paused) {
        message = "❌ Este sorteo ya está pausado.";
      } else if (giveaway.ended || giveaway.cancelled) {
        message = "❌ No puedes pausar un sorteo que ya terminó.";
      } else {
        result = await pauseGiveaway(messageId);
        message = result ? `✅ Sorteo **${giveaway.objeto}** pausado correctamente.` : "❌ Error al pausar el sorteo.";
      }
      break;
    case "reanudar":
      if (!giveaway.paused) {
        message = giveaway.ended ? "❌ Este sorteo ya terminó." : "❌ Este sorteo no está pausado.";
      } else {
        result = await resumeGiveaway(messageId);
        message = result ? `✅ Sorteo **${giveaway.objeto}** reanudado correctamente.` : "❌ Error al reanudar el sorteo.";
      }
      break;
    case "cancelar":
      if (giveaway.cancelled) {
        message = "❌ Este sorteo ya fue cancelado.";
      } else if (giveaway.ended) {
        message = "❌ Este sorteo ya terminó.";
      } else {
        result = await cancelGiveaway(messageId);
        message = result ? `✅ Sorteo **${giveaway.objeto}** cancelado correctamente.` : "❌ Error al cancelar el sorteo.";
      }
      break;
    default:
      message = "❌ Acción no válida.";
  }
  await interaction.editReply({ content: message });
}

async function handlePermisosCommand(interaction) {
  try {
    if (interaction.replied || interaction.deferred) return;
    await interaction.deferReply({ flags: 64 });
    if (!interaction.guild) {
      return await interaction.editReply({ content: "❌ Este comando solo funciona en servidores." });
    }
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);
    const isOwner = interaction.user.id === guild.ownerId;
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!isOwner && !isAdmin) {
      return await interaction.editReply({ content: "❌ Solo administradores pueden gestionar permisos." });
    }
    const accion = interaction.options.getString("accion");
    const rol = interaction.options.getRole("rol");
    const comando = interaction.options.getString("comando");
    const guildId = guild.id;
    const roleId = rol.id;
    if (!rolePermissions.has(guildId)) {
      rolePermissions.set(guildId, new Map());
    }
    const guildPerms = rolePermissions.get(guildId);
    if (accion === "dar") {
      if (!guildPerms.has(roleId)) {
        guildPerms.set(roleId, []);
      }
      const rolePerms = guildPerms.get(roleId);
      if (rolePerms.includes(comando)) {
        return await interaction.editReply({ content: `❌ El rol ${rol} ya tiene permisos para /${comando}` });
      }
      rolePerms.push(comando);
      guildPerms.set(roleId, rolePerms);
      return await interaction.editReply({ content: `✅ El rol ${rol} ahora puede usar /${comando}` });
    } else if (accion === "quitar") {
      if (!guildPerms.has(roleId)) {
        return await interaction.editReply({ content: `❌ El rol ${rol} no tiene permisos asignados.` });
      }
      const rolePerms = guildPerms.get(roleId);
      const index = rolePerms.indexOf(comando);
      if (index === -1) {
        return await interaction.editReply({ content: `❌ El rol ${rol} no tiene permisos para /${comando}` });
      }
      rolePerms.splice(index, 1);
      if (rolePerms.length === 0) {
        guildPerms.delete(roleId);
      } else {
        guildPerms.set(roleId, rolePerms);
      }
      return await interaction.editReply({ content: `✅ El rol ${rol} ya no puede usar /${comando}` });
    }
  } catch (err) {
    console.error(`Error en comando permisos: ${err.message}`);
    if (!interaction.replied) {
      await interaction.reply({ content: "⚠️ Error procesando el comando de permisos.", flags: 64 });
    }
  }
}

async function handleListarSorteosCommand(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });
    if (!interaction.guild) {
      return await interaction.editReply({ content: "❌ Este comando solo funciona en servidores." });
    }
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);
    if (!hasPermission(member, guild.id, "sorteo")) {
      return await interaction.editReply({ content: "❌ No tienes permisos para ver la lista de sorteos." });
    }
    const activeSorteosArray = Array.from(activeSorteos.entries())
      .filter(([_, giveaway]) => giveaway.guildId === guild.id && !giveaway.ended && !giveaway.cancelled);
    if (activeSorteosArray.length === 0) {
      return await interaction.editReply({ content: "📋 No hay sorteos activos en este servidor." });
    }
    const embed = new EmbedBuilder()
      .setTitle("📋 Sorteos Activos")
      .setColor(0x00FF00)
      .setTimestamp();
    let description = "";
    for (const [messageId, giveaway] of activeSorteosArray) {
      const status = giveaway.paused ? "⏸️ PAUSADO" : "🎉 ACTIVO";
      const timeLeft = giveaway.paused ? "PAUSADO" : `<t:${Math.floor(giveaway.endTime / 1000)}:R>`;
      description += `**${giveaway.objeto}**\n`;
      description += `ID: \`${messageId}\`\n`;
      description += `Estado: ${status}\n`;
      description += `Termina: ${timeLeft}\n`;
      description += `Canal: <#${giveaway.channelId}>\n\n`;
    }
    embed.setDescription(description);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error(`Error listando sorteos: ${err.message}`);
    await interaction.editReply({ content: "⚠️ Error al obtener la lista de sorteos." });
  }
}

async function handleBanCommand(interaction) {
  await interaction.deferReply({ flags: 64 });
  if (!interaction.guild) return await interaction.editReply({ content: "❌ Este comando solo funciona en servidores." });
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  if (!hasPermission(member, guild.id, "ban")) return await interaction.editReply({ content: "❌ No tienes permisos para banear." });
  const target = interaction.options.getUser("usuario");
  const reason = interaction.options.getString("razon") || "Sin razón especificada";
  const durationStr = interaction.options.getString("duracion");
  let durationMs = null;
  if (durationStr) {
    durationMs = parseDurationString(durationStr);
    if (!durationMs) return await interaction.editReply({ content: "❌ Duración inválida. Usa formatos: 1D 1H 1Min 1S 1Mes" });
  }
  try {
    await guild.members.ban(target.id, { reason });
    const embed = new EmbedBuilder()
      .setTitle("🔨 USUARIO BANEADO")
      .setColor(0xFF0000) // rojo
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "👤 Usuario", value: `${target} (${target.tag})`, inline: true },
        { name: "🛡️ Moderador", value: `${interaction.user}`, inline: true },
        { name: "⏰ Duración", value: durationStr || "Permanente", inline: true },
        { name: "📄 Razón", value: reason || "No especificada" }
      )
      .setFooter({ text: `ID: ${target.id} • ${new Date().toLocaleString("es-ES")}` })
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });

    await interaction.editReply({ content: `✅ Usuario ${target.tag} baneado correctamente.` });
    if (durationMs) {
      const timeoutId = setTimeout(async () => {
        try {
          await guild.bans.remove(target.id, "Unban automático por tiempo cumplido");
          scheduledUnbans.delete(target.id);
        } catch (err) {
          console.error(`Error en unban programado: ${err.message}`);
        }
      }, durationMs);
      scheduledUnbans.set(target.id, timeoutId);
    }
  } catch (err) {
    console.error(`Error baneando usuario: ${err.message}`);
    await interaction.editReply({ content: "⚠️ Error al banear al usuario." });
  }
}

async function handleUnbanCommand(interaction) {
  await interaction.deferReply({ flags: 64 });
  if (!interaction.guild) return await interaction.editReply({ content: "❌ Este comando solo funciona en servidores." });
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  if (!hasPermission(member, guild.id, "ban")) return await interaction.editReply({ content: "❌ No tienes permisos para desbanear." });
  const userId = interaction.options.getString("usuario_id");
  const reason = interaction.options.getString("razon") || "Sin razón especificada";
  try {
    await guild.bans.remove(userId, reason);
    if (scheduledUnbans.has(userId)) {
      clearTimeout(scheduledUnbans.get(userId));
      scheduledUnbans.delete(userId);
    }
    let userTag = userId;
    let avatarURL = null;
    try {
      const fetched = await client.users.fetch(userId);
      userTag = fetched.tag;
      avatarURL = fetched.displayAvatarURL({ dynamic: true });
    } catch {}
    const embed = new EmbedBuilder()
      .setTitle("✅ USUARIO DESBANEADO")
      .setColor(0xFF0000) // rojo
      .setThumbnail(avatarURL || "https://i.imgur.com/Qr0ZpWQ.png")
      .addFields(
        { name: "👤 Usuario", value: `${userTag} (${userId})`, inline: true },
        { name: "🛡️ Moderador", value: `${interaction.user}`, inline: true },
        { name: "📄 Razón", value: reason || "No especificada" }
      )
      .setFooter({ text: `ID: ${userId} • ${new Date().toLocaleString("es-ES")}` })
      .setTimestamp();
    await interaction.channel.send({ embeds: [embed] });
    await interaction.editReply({ content: `✅ Usuario ${userTag} desbaneado correctamente.` });
  } catch (err) {
    console.error(`Error desbaneando usuario: ${err.message}`);
    await interaction.editReply({ content: "⚠️ Error al desbanear al usuario. Asegúrate de usar la ID correcta." });
  }
}

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (mutedUsers.has(msg.author.id)) {
    const muteEnd = mutedUsers.get(msg.author.id);
    if (Date.now() < muteEnd) {
      try {
        await msg.delete();
        return;
      } catch (err) {
        console.error(`Error eliminando mensaje de usuario silenciado: ${err.message}`);
      }
    } else {
      mutedUsers.delete(msg.author.id);
    }
  }
  if (checkSpam(msg.author.id, msg.content)) {
    try {
      await msg.delete();
      const success = await muteUser(msg.guild, msg.author.id, 60 * 1000);
      if (success) {
        const warningMsg = await msg.channel.send({ content: `⚠️ ${msg.author}, has sido silenciado por 1 minuto debido a spam (mensajes repetidos).` });
        setTimeout(async () => {
          try {
            await warningMsg.delete();
          } catch (err) {
            console.error(`Error eliminando mensaje de advertencia: ${err.message}`);
          }
        }, 10000);
      }
    } catch (err) {
      console.error(`Error manejando spam: ${err.message}`);
    }
    return;
  }
  if (msg.channelId === CHANNEL_ID) {
    resetTimer(CHANNEL_ID);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    switch (interaction.commandName) {
      case "alerta":
        await handleAlertaCommand(interaction);
        break;
      case "sorteo":
        await handleSorteoCommand(interaction);
        break;
      case "extender":
        await handleExtenderCommand(interaction);
        break;
      case "control-sorteo":
        await handleControlSorteoCommand(interaction);
        break;
      case "listar-sorteos":
        await handleListarSorteosCommand(interaction);
        break;
      case "permisos":
        await handlePermisosCommand(interaction);
        break;
      case "ban":
        await handleBanCommand(interaction);
        break;
      case "unban":
        await handleUnbanCommand(interaction);
        break;
      default:
        await interaction.reply({ content: "❌ Comando no reconocido.", flags: 64 });
    }
  } catch (err) {
    console.error(`Error manejando interacción: ${err.message}`);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: "⚠️ Error procesando el comando." });
    } else if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "⚠️ Error procesando el comando.", flags: 64 });
    }
  }
});

client.on("guildMemberAdd", async (member) => {
  userMessages.delete(member.user.id);
  mutedUsers.delete(member.user.id);
});

client.on("guildMemberRemove", async (member) => {
  userMessages.delete(member.user.id);
  mutedUsers.delete(member.user.id);
  commandCooldowns.delete(member.user.id);
});

client.once("ready", async (readyClient) => {
  console.log(`✅ Bot conectado como ${readyClient.user.tag}`);
  const commands = [
    new SlashCommandBuilder()
      .setName("alerta")
      .setDescription("Enviar mensaje de alerta al canal principal")
      .addStringOption(option =>
        option.setName("tipo")
          .setDescription("Tipo de alerta a enviar")
          .setRequired(true)
          .addChoices(
            { name: "🎵 TikTok", value: "tiktok" },
            { name: "🛠️ Middleman", value: "middleman" },
            { name: "⚠️ Advertencia", value: "advertencia" },
            { name: "📦 Inventario", value: "inventario" }
          ))
      .toJSON(),
    new SlashCommandBuilder()
      .setName("sorteo")
      .setDescription("Crear un nuevo sorteo")
      .addStringOption(option =>
        option.setName("objeto")
          .setDescription("Objeto o premio del sorteo")
          .setRequired(true))
      .addStringOption(option =>
        option.setName("descripcion")
          .setDescription("Descripción del sorteo")
          .setRequired(true))
      .addStringOption(option =>
        option.setName("duracion")
          .setDescription("Duración (ej: 1D 2H 30Min 45S 1Mes)")
          .setRequired(true))
      .addAttachmentOption(option =>
        option.setName("imagen")
          .setDescription("Imagen del premio (archivo)"))
      .addStringOption(option =>
        option.setName("imagen_url")
          .setDescription("URL de imagen del premio (jpg/png/gif/webp)"))
      .toJSON(),
    new SlashCommandBuilder()
      .setName("extender")
      .setDescription("Extender la duración de un sorteo")
      .addStringOption(option =>
        option.setName("mensaje_id")
          .setDescription("ID del mensaje del sorteo")
          .setRequired(true))
      .addStringOption(option =>
        option.setName("tiempo")
          .setDescription("Tiempo adicional (ej: 10Min, 1H)")
          .setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName("control-sorteo")
      .setDescription("Controlar sorteos (pausar, reanudar, cancelar)")
      .addStringOption(option =>
        option.setName("accion")
          .setDescription("Acción a realizar")
          .setRequired(true)
          .addChoices(
            { name: "⏸️ Pausar", value: "pausar" },
            { name: "▶️ Reanudar", value: "reanudar" },
            { name: "❌ Cancelar", value: "cancelar" }
          ))
      .addStringOption(option =>
        option.setName("mensaje_id")
          .setDescription("ID del mensaje del sorteo")
          .setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName("listar-sorteos")
      .setDescription("Ver todos los sorteos activos del servidor")
      .toJSON(),
    new SlashCommandBuilder()
      .setName("permisos")
      .setDescription("Gestionar permisos de roles para comandos")
      .addStringOption(option =>
        option.setName("accion")
          .setDescription("Acción a realizar")
          .setRequired(true)
          .addChoices(
            { name: "➕ Dar", value: "dar" },
            { name: "➖ Quitar", value: "quitar" }
          ))
      .addRoleOption(option =>
        option.setName("rol")
          .setDescription("Rol a modificar")
          .setRequired(true))
      .addStringOption(option =>
        option.setName("comando")
          .setDescription("Comando para el permiso")
          .setRequired(true)
          .addChoices(
            { name: "🎉 Sorteo", value: "sorteo" },
            { name: "⏰ Extender", value: "extender" },
            { name: "📢 Alerta", value: "alerta" },
            { name: "🔨 Ban/Unban", value: "ban" }
          ))
      .toJSON(),
    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Banear a un usuario con razón y duración opcional")
      .addUserOption(option =>
        option.setName("usuario")
          .setDescription("Usuario a banear")
          .setRequired(true))
      .addStringOption(option =>
        option.setName("razon")
          .setDescription("Razón del baneo"))
      .addStringOption(option =>
        option.setName("duracion")
          .setDescription("Duración del baneo (opcional, ej: 1D 1H 30Min)"))
      .toJSON(),
    new SlashCommandBuilder()
      .setName("unban")
      .setDescription("Desbanear a un usuario por ID")
      .addStringOption(option =>
        option.setName("usuario_id")
          .setDescription("ID del usuario a desbanear")
          .setRequired(true))
      .addStringOption(option =>
        option.setName("razon")
          .setDescription("Razón del unban"))
      .toJSON()
  ];

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
  } catch (error) {
    console.error("❌ Error registrando comandos:", error);
  }

  resetTimer(CHANNEL_ID);
  scheduleRandomMessage(CHANNEL_ID);
});

setInterval(() => {
  const now = Date.now();
  for (const [userId, messages] of userMessages.entries()) {
    const validMessages = messages.filter(msg => now - msg.timestamp < 5 * 60 * 1000);
    if (validMessages.length === 0) {
      userMessages.delete(userId);
    } else {
      userMessages.set(userId, validMessages);
    }
  }
  for (const [userId, muteEnd] of mutedUsers.entries()) {
    if (now > muteEnd) {
      mutedUsers.delete(userId);
    }
  }
  for (const [key, cooldownEnd] of commandCooldowns.entries()) {
    if (now > cooldownEnd) {
      commandCooldowns.delete(key);
    }
  }
}, 60 * 60 * 1000);

const app = express();

app.get("/", (req, res) => {
  const stats = {
    status: "active",
    bot: client.user ? client.user.tag : "connecting",
    uptime: process.uptime(),
    activeSorteos: activeSorteos.size,
    mutedUsers: mutedUsers.size,
    guilds: client.guilds.cache.size,
    users: client.users.cache.size
  };
  res.json(stats);
});

app.get("/stats", (req, res) => {
  res.json({
    activeSorteos: Array.from(activeSorteos.values()).map(g => ({
      objeto: g.objeto,
      channelId: g.channelId,
      endTime: g.endTime,
      paused: g.paused,
      ended: g.ended
    })),
    mutedUsersCount: mutedUsers.size,
    messageCache: userMessages.size,
    uptime: process.uptime()
  });
});

const port = process.env.PORT || 3000;
app.listen(port);

if (process.env.RENDER_EXTERNAL_URL) {
  const keepAliveInterval = 14 * 60 * 1000;
  setInterval(async () => {
    try {
      await axios.get(process.env.RENDER_EXTERNAL_URL);
    } catch (err) {
      console.error("❌ Error en keep alive:", err.message);
    }
  }, keepAliveInterval);
}

client.login(TOKEN).catch(err => {
  console.error("❌ Error conectando el bot:", err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception thrown:', err);
  process.exit(1);
});
