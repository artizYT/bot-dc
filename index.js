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

const SPAM_THRESHOLD = 2;
const SPAM_WINDOW = 1000;
const MUTE_DURATION = 60 * 1000;

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

const COOLDOWN_MS = 3000;
const GIVEAWAY_EMOJI = "🎉";
const AUTO_MESSAGE_MIN_INTERVAL = 5 * 60 * 1000;
const AUTO_MESSAGE_MAX_INTERVAL = 15 * 60 * 1000;

const mensajes = {
  middleman: `
# 📢 Servicio de Middleman 🛠️ - 🇪🇸
> ***En este servidor contamos con middleman confiables para que tus tradeos sean 100% seguros.***
> **Se pide a través de tickets** https://discord.com/channels/1418586395672449107/1419067482450165952

# 📢 Middleman Service 🛠️ - 🇺🇸
> ***On this server we have reliable middlemen so your trades are 100% safe.***
> **Requested through tickets** https://discord.com/channels/1418586395672449107/1419067482450165952
> <@&1418601634417606707>
`,
  tiktok: `
**Chicos recuerden seguirnos en tiktok:**    
https://www.tiktok.com/@venta.brainbrots0 🇪🇸

**Guys, remember to follow us on TikTok:**    
https://www.tiktok.com/@venta.brainbrots0 🇺🇸
> <@&1418601634417606707>
`,
  advertencia: `
# 🚨 Recuerden no unirse a links de desconocidos 🚨 
> <@&1418601634417606707>
`,
  inventario: `
# 🗃️ INVENTARIO 🗃️ - :flag_es:
> Chicos si les interesa algo de <#1419062034586140732> , crean ticket en https://discord.com/channels/1418586395672449107/1419067482450165952. 
> **En inventario pueden encontrar para comprar o tradear brainbrots**

# 🗃️ INVENTORY 🗃️ - :flag_us:
> Guys, if you're interested in anything from <#1419062034586140732>, create a ticket at https://discord.com/channels/1418586395672449107/1419067482450165952.
> **In inventory you can find brainbrots to buy or trade**
> <@&1418601634417606707>
`
};

const keywordTriggers = {
  'trada': 'middleman',
  'trade': 'middleman',
  'trading': 'middleman',
  'middleman': 'middleman',
  'server': 'advertencia',
  'servidor': 'advertencia',
  'link': 'advertencia',
  'enlace': 'advertencia'
};

let timers = {};

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

async function sendMessage(channelId, message, delay = 0) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    await channel.send(message);
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
  
  const validMessages = messages.filter(msg => now - msg.timestamp < SPAM_WINDOW);
  
  const repeatedMessages = validMessages.filter(msg => msg.content === content);
  
  validMessages.push({ content, timestamp: now });
  userMessages.set(userKey, validMessages);
  
  return repeatedMessages.length >= SPAM_THRESHOLD;
}

async function muteUser(guild, userId, duration = MUTE_DURATION) {
  try {
    const member = await guild.members.fetch(userId);
    const muteRole = guild.roles.cache.find(role => role.name === "Muted") || 
                    await guild.roles.create({
                      name: "Muted",
                      color: "#808080",
                      permissions: []
                    });
    
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
    const messageTypes = ['tiktok', 'inventario'];
    const randomType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
    await sendMessage(channelId, mensajes[randomType]);
    scheduleRandomMessage(channelId);
  }, interval);
  
  autoMessageTimers.set(channelId, timer);
}

function resetTimer(channelId = CHANNEL_ID) {
  if (timers[channelId]) clearTimeout(timers[channelId]);
  
  timers[channelId] = setTimeout(async () => {
    // Enviar mensajes con delays aleatorios
    const delays = [0, getRandomDelay(), getRandomDelay(5000, 10000)];
    await sendMessage(channelId, mensajes.middleman, delays[0]);
    await sendMessage(channelId, mensajes.tiktok, delays[1]);
    await sendMessage(channelId, mensajes.advertencia, delays[2]);
  }, INACTIVITY_MS);
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
    return await interaction.reply({ 
      content: `⏰ Espera ${Math.ceil((cooldownEnd - now) / 1000)}s antes de usar este comando.`, 
      flags: 64 
    });
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
  
  await sendMessage(CHANNEL_ID, mensajes[tipo], getRandomDelay(1000, 3000));
  await interaction.editReply({ content: "✅ Mensaje de alerta enviado correctamente." });
  resetTimer(CHANNEL_ID);
}

async function handleSorteoCommand(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownEnd = commandCooldowns.get(`sorteo_${userId}`) || 0;
  
  if (now < cooldownEnd) {
    return await interaction.reply({ 
      content: `⏰ Espera ${Math.ceil((cooldownEnd - now) / 1000)}s antes de crear otro sorteo.`, 
      flags: 64 
    });
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
  const imagen = interaction.options.getAttachment("imagen");
  const duracion = interaction.options.getInteger("duracion");
  
  if (!imagen) {
    return await interaction.editReply({ content: "❌ Debes subir una imagen para el sorteo." });
  }
  
  if (duracion < 1 || duracion > 10080) {
    return await interaction.editReply({ content: "❌ La duración debe estar entre 1 y 10080 minutos (1 semana)." });
  }
  
  const channel = interaction.channel;
  const endTime = new Date(Date.now() + duracion * 60 * 1000);
  
  const embed = new EmbedBuilder()
    .setTitle(`🎉 SORTEO: ${objeto}`)
    .setDescription(`${descripcion}\n\nReacciona con ${GIVEAWAY_EMOJI} para participar\n**Termina:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n\nOrganizado por ${interaction.user}`)
    .setColor(0x00FF00)
    .setImage(imagen.url)
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
  }, duracion * 60 * 1000);
  
  sorteoTimers.set(giveawayMessage.id, timeoutId);
  
  await interaction.editReply({ 
    content: `✅ Sorteo creado correctamente.\n**ID del sorteo:** \`${giveawayMessage.id}\`\n**Duración:** ${duracion} minutos` 
  });
}

async function handleExtenderCommand(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownEnd = commandCooldowns.get(`extend_${userId}`) || 0;
  
  if (now < cooldownEnd) {
    return await interaction.reply({ 
      content: `⏰ Espera ${Math.ceil((cooldownEnd - now) / 1000)}s antes de extender otro sorteo.`, 
      flags: 64 
    });
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
  const tiempoExtra = interaction.options.getInteger("tiempo");
  
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
  
  if (sorteoTimers.has(messageId)) {
    clearTimeout(sorteoTimers.get(messageId));
    sorteoTimers.delete(messageId);
  }
  
  const newEndTime = giveaway.endTime + (tiempoExtra * 60 * 1000);
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
    await channel.send(`⏰ Sorteo **${giveaway.objeto}** extendido por ${tiempoExtra} minutos adicionales por ${interaction.user}`);
    
    await interaction.editReply({ content: `✅ Sorteo extendido correctamente por ${tiempoExtra} minutos.` });
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
    return await interaction.reply({ 
      content: `⏰ Espera ${Math.ceil((cooldownEnd - now) / 1000)}s antes de controlar otro sorteo.`, 
      flags: 64 
    });
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


client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  
  // Verificar si el usuario está silenciado
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
      const success = await muteUser(msg.guild, msg.author.id, MUTE_DURATION);
      
      if (success) {
        const warningMsg = await msg.channel.send({
          content: `⚠️ ${msg.author}, has sido silenciado por 1 minuto debido a spam (mensajes repetidos).`
        });
        
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
  
  const content = msg.content.toLowerCase();
  for (const [keyword, messageType] of Object.entries(keywordTriggers)) {
    if (content.includes(keyword)) {
      if (msg.channelId === CHANNEL_ID || hasPermission(msg.member, msg.guild.id, "alerta")) {
        setTimeout(async () => {
          await sendMessage(msg.channelId, mensajes[messageType]);
        }, getRandomDelay(2000, 5000));
      }
      break;
    }
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
      default:
        await interaction.reply({ content: "❌ Comando no reconocido.", flags: 64 });
    }
  } catch (err) {
    console.error(`Error manejando interacción: ${err.message}`);
    if (!interaction.replied && !interaction.deferred) {
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
  console.log(`🔧 Versión mejorada con anti-spam y control avanzado de sorteos`);
  
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
      .addAttachmentOption(option =>
        option.setName("imagen")
          .setDescription("Imagen del premio")
          .setRequired(true))
      .addIntegerOption(option =>
        option.setName("duracion")
          .setDescription("Duración en minutos (1-10080)")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(10080))
      .toJSON(),
      
    new SlashCommandBuilder()
      .setName("extender")
      .setDescription("Extender la duración de un sorteo")
      .addStringOption(option =>
        option.setName("mensaje_id")
          .setDescription("ID del mensaje del sorteo")
          .setRequired(true))
      .addIntegerOption(option =>
        option.setName("tiempo")
          .setDescription("Tiempo adicional en minutos (1-1440)")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(1440))
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
            { name: "📢 Alerta", value: "alerta" }
          ))
      .toJSON()
  ];
  
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  
  try {
    console.log("🔄 Registrando comandos slash...");
    
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    
    console.log("✅ Comandos slash registrados correctamente");
  } catch (error) {
    console.error("❌ Error registrando comandos:", error);
  }
  
  resetTimer(CHANNEL_ID);
  scheduleRandomMessage(CHANNEL_ID);
  
  console.log("🚀 Bot completamente inicializado");
  console.log(`📊 Funcionalidades activas:`);
  console.log(`   • Sistema anti-spam activado`);
  console.log(`   • Mensajes automáticos aleatorios`);
  console.log(`   • Triggers por palabras clave`);
  console.log(`   • Control avanzado de sorteos`);
  console.log(`   • Gestión de permisos por roles`);
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
  
  console.log("🧹 Limpieza de datos completada");
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
    users: client.users.cache.size,
    features: [
      "Anti-spam system",
      "Random auto messages", 
      "Keyword triggers",
      "Advanced giveaway control",
      "Role permission management"
    ]
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
app.listen(port, () => {
  console.log(`🌐 Servidor HTTP ejecutándose en puerto ${port}`);
});

if (process.env.RENDER_EXTERNAL_URL) {
  const keepAliveInterval = 14 * 60 * 1000;
  
  setInterval(async () => {
    try {
      await axios.get(process.env.RENDER_EXTERNAL_URL);
      console.log("💓 Keep alive ping enviado");
    } catch (err) {
      console.error("❌ Error en keep alive:", err.message);
    }
  }, keepAliveInterval);
  
  console.log("🔄 Keep alive activado para Render");
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
