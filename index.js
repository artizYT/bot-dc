require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionsBitField } = require("discord.js");
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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const rolePermissions = new Map();

const mensajeMiddleman = `
# 📢 Servicio de Middleman 🛠️ - 🇪🇸
> ***En este servidor contamos con middleman confiables para que tus tradeos sean 100% seguros.***
> **Se pide a través de tickets** https://discord.com/channels/1418586395672449107/1419067482450165952

# 📢 Middleman Service 🛠️ - 🇺🇸
> ***On this server we have reliable middlemen so your trades are 100% safe.***
> **Requested through tickets** https://discord.com/channels/1418586395672449107/1419067482450165952
> <@&1418601634417606707>
`;

const mensajeTikTok = `
**Chicos recuerden seguirnos en tiktok:**    
https://www.tiktok.com/@venta.brainbrots0 🇪🇸

**Guys, remember to follow us on TikTok:**    
https://www.tiktok.com/@venta.brainbrots0 🇺🇸
> <@&1418601634417606707>
`;

const mensajeAdvertencia = `
# 🚨 Recuerden no unirse a links de desconocidos 🚨 
> <@&1418601634417606707>
`;

const mensajeInventario = `
# 🗃️ INVENTARIO 🗃️ - :flag_es:
> Chicos si les interesa algo de <#1419062034586140732> , crean ticket en https://discord.com/channels/1418586395672449107/1419067482450165952. 
> **En inventario pueden encontrar para comprar o tradear brainbrots**

# 🗃️ INVENTORY 🗃️ - :flag_us:
> Guys, if you're interested in anything from <#1419062034586140732>, create a ticket at https://discord.com/channels/1418586395672449107/1419067482450165952.
> **In inventory you can find brainbrots to buy or trade**
> <@&1418601634417606707>
`;

let timers = {};
const commandCooldowns = new Map();
const COOLDOWN_MS = 3000;
const activeSorteos = new Map();
const GIVEAWAY_EMOJI = "🎉";
const sorteoTimers = new Map();

async function sendBothMessages() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    await channel.send(mensajeMiddleman);
    await new Promise(r => setTimeout(r, 1000));
    await channel.send(mensajeTikTok);
    await new Promise(r => setTimeout(r, 1000));
    await channel.send(mensajeAdvertencia);
  } catch (err) {
    console.error(err.message);
  }
}

function resetTimer(channelId = CHANNEL_ID) {
  if (timers[channelId]) clearTimeout(timers[channelId]);
  timers[channelId] = setTimeout(async () => {
    await sendBothMessages();
  }, INACTIVITY_MS);
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

client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  if (msg.channelId === CHANNEL_ID) resetTimer(CHANNEL_ID);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "alerta") await handleAlertaCommand(interaction);
  else if (interaction.commandName === "sorteo") await handleSorteoCommand(interaction);
  else if (interaction.commandName === "extender") await handleExtenderCommand(interaction);
  else if (interaction.commandName === "permisos") await handlePermisosCommand(interaction);
});

async function handlePermisosCommand(interaction) {
  try {
    if (interaction.replied || interaction.deferred) return;
    await interaction.deferReply({ flags: 64 });
    if (!interaction.guild) return await interaction.editReply({ content: "❌ Solo en servidores." });
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);
    const isOwner = interaction.user.id === guild.ownerId;
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!isOwner && !isAdmin) return await interaction.editReply({ content: "❌ Solo administradores pueden gestionar permisos." });
    const accion = interaction.options.getString("accion");
    const rol = interaction.options.getRole("rol");
    const comando = interaction.options.getString("comando");
    const guildId = guild.id;
    const roleId = rol.id;
    if (!rolePermissions.has(guildId)) rolePermissions.set(guildId, new Map());
    const guildPerms = rolePermissions.get(guildId);
    if (accion === "dar") {
      if (!guildPerms.has(roleId)) guildPerms.set(roleId, []);
      const rolePerms = guildPerms.get(roleId);
      if (rolePerms.includes(comando)) return await interaction.editReply({ content: `❌ El rol ${rol} ya tiene permisos para /${comando}` });
      rolePerms.push(comando);
      guildPerms.set(roleId, rolePerms);
      return await interaction.editReply({ content: `✅ El rol ${rol} ahora puede usar /${comando}` });
    } else if (accion === "quitar") {
      if (!guildPerms.has(roleId)) return await interaction.editReply({ content: `❌ El rol ${rol} no tiene permisos asignados.` });
      const rolePerms = guildPerms.get(roleId);
      const index = rolePerms.indexOf(comando);
      if (index === -1) return await interaction.editReply({ content: `❌ El rol ${rol} no tiene permisos para /${comando}` });
      rolePerms.splice(index, 1);
      if (rolePerms.length === 0) guildPerms.delete(roleId);
      else guildPerms.set(roleId, rolePerms);
      return await interaction.editReply({ content: `✅ El rol ${rol} ya no puede usar /${comando}` });
    }
  } catch (err) {
    if (!interaction.replied) await interaction.reply({ content: "⚠️ Error procesando el comando.", flags: 64 });
  }
}

async function handleExtenderCommand(interaction) {
  try {
    if (interaction.replied || interaction.deferred) return;
    await interaction.deferReply({ flags: 64 });
    if (!interaction.guild) return await interaction.editReply({ content: "❌ Solo en servidores." });
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);
    if (!hasPermission(member, guild.id, "extender")) return await interaction.editReply({ content: "❌ No tienes permisos." });
    const messageId = interaction.options.getString("mensaje_id");
    const tiempoExtra = interaction.options.getInteger("tiempo");
    if (!activeSorteos.has(messageId)) return await interaction.editReply({ content: "❌ No se encontró un sorteo activo." });
    const giveaway = activeSorteos.get(messageId);
    if (giveaway.ended) return await interaction.editReply({ content: "❌ Este sorteo ya terminó." });
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
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);
    const embed = message.embeds[0];
    const newEmbed = {
      ...embed.data,
      description: embed.description.replace(/\*\*Termina:\*\* <t:\d+:R>/, `**Termina:** <t:${Math.floor(newEndTime / 1000)}:R>`),
      footer: { text: `Termina el ${new Date(newEndTime).toLocaleString('es-ES')} • EXTENDIDO` },
      timestamp: new Date(newEndTime).toISOString()
    };
    await message.edit({ embeds: [newEmbed] });
    await channel.send(`⏰ Sorteo **${giveaway.objeto}** extendido ${tiempoExtra} minutos por ${interaction.user}`);
    await interaction.editReply({ content: `✅ Sorteo extendido ${tiempoExtra} minutos.` });
  } catch (err) {
    if (!interaction.replied) await interaction.reply({ content: "⚠️ Error procesando extensión.", flags: 64 });
  }
}

async function handleAlertaCommand(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownEnd = commandCooldowns.get(userId) || 0;
  if (now < cooldownEnd) return await interaction.reply({ content: `⏰ Espera ${Math.ceil((cooldownEnd - now) / 1000)}s`, flags: 64 });
  await interaction.deferReply({ flags: 64 });
  commandCooldowns.set(userId, now + COOLDOWN_MS);
  if (!interaction.guild) return await interaction.editReply({ content: "❌ Solo en servidores." });
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  if (!hasPermission(member, guild.id, "alerta")) return await interaction.editReply({ content: "❌ No tienes permisos." });
  const tipo = interaction.options.getString("tipo");
  const channel = await client.channels.fetch(CHANNEL_ID);
  let mensaje = "";
  if (tipo === "advertencia") mensaje = mensajeAdvertencia;
  else if (tipo === "inventario") mensaje = mensajeInventario;
  else if (tipo === "tiktok") mensaje = mensajeTikTok;
  else if (tipo === "middleman") mensaje = mensajeMiddleman;
  else return await interaction.editReply({ content: "❌ Tipo inválido." });
  await channel.send(mensaje);
  await interaction.editReply({ content: "✅ Mensaje enviado." });
  resetTimer(CHANNEL_ID);
}

async function handleSorteoCommand(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownEnd = commandCooldowns.get(`sorteo_${userId}`) || 0;
  if (now < cooldownEnd) return await interaction.reply({ content: `⏰ Espera ${Math.ceil((cooldownEnd - now) / 1000)}s`, flags: 64 });
  await interaction.deferReply({ flags: 64 });
  commandCooldowns.set(`sorteo_${userId}`, now + 10000);
  if (!interaction.guild) return await interaction.editReply({ content: "❌ Solo en servidores." });
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  if (!hasPermission(member, guild.id, "sorteo")) return await interaction.editReply({ content: "❌ No tienes permisos." });
  const objeto = interaction.options.getString("objeto");
  const descripcion = interaction.options.getString("descripcion");
  const imagen = interaction.options.getAttachment("imagen");
  const duracion = interaction.options.getInteger("duracion");
  if (!imagen) return await interaction.editReply({ content: "❌ Debes subir una imagen." });
  if (duracion < 1 || duracion > 10080) return await interaction.editReply({ content: "❌ Duración inválida." });
  const channel = interaction.channel;
  const endTime = new Date(Date.now() + duracion * 60 * 1000);
  const embed = {
    title: `🎉 SORTEO: ${objeto}`,
    description: `${descripcion}\n\nReacciona con ${GIVEAWAY_EMOJI}\n**Termina:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\nOrganizado por ${interaction.user}`,
    color: 0x00FF00,
    image: { url: imagen.url },
    footer: { text: `Termina el ${endTime.toLocaleString('es-ES')}` },
    timestamp: endTime.toISOString()
  };
  const giveawayMessage = await channel.send({ embeds: [embed] });
  await giveawayMessage.react(GIVEAWAY_EMOJI);
  activeSorteos.set(giveawayMessage.id, { messageId: giveawayMessage.id, channelId: channel.id, guildId: guild.id, objeto, descripcion, createdBy: interaction.user.id, endTime: endTime.getTime(), ended: false });
  const timeoutId = setTimeout(() => { endGiveaway(giveawayMessage.id); }, duracion * 60 * 1000);
  sorteoTimers.set(giveawayMessage.id, timeoutId);
  await interaction.editReply({ content: `✅ Sorteo creado. ID: ${giveawayMessage.id}` });
}

async function endGiveaway(messageId) {
  const giveaway = activeSorteos.get(messageId);
  if (!giveaway || giveaway.ended) return;
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);
    const reaction = message.reactions.cache.get(GIVEAWAY_EMOJI);
    if (!reaction) {
      await channel.send(`🎉 Sorteo terminado ${giveaway.objeto}\n❌ Sin participantes.`);
      activeSorteos.delete(messageId);
      return;
    }
    const users = await reaction.users.fetch();
    const participants = users.filter(u => !u.bot);
    if (participants.size === 0) {
      await channel.send(`🎉 Sorteo terminado ${giveaway.objeto}\n❌ Sin participantes.`);
      activeSorteos.delete(messageId);
      return;
    }
    const winner = participants.random();
    await channel.send({ content: `🎉 ${winner} ganó ${giveaway.objeto}` });
    giveaway.ended = true;
    activeSorteos.delete(messageId);
  } catch {
    activeSorteos.delete(messageId);
  }
}

client.once("ready", async (readyClient) => {
  console.log(`✅ Bot conectado como ${readyClient.user.tag}`);
  const commands = [
    new SlashCommandBuilder().setName("alerta").setDescription("Enviar alerta").addStringOption(o => o.setName("tipo").setDescription("Tipo").setRequired(true).addChoices({ name: "TikTok", value: "tiktok" }, { name: "Middleman", value: "middleman" }, { name: "Advertencia", value: "advertencia" }, { name: "Inventario", value: "inventario" })).toJSON(),
    new SlashCommandBuilder().setName("sorteo").setDescription("Crear sorteo").addStringOption(o => o.setName("objeto").setDescription("Objeto").setRequired(true)).addStringOption(o => o.setName("descripcion").setDescription("Descripción").setRequired(true)).addAttachmentOption(o => o.setName("imagen").setDescription("Imagen").setRequired(true)).addIntegerOption(o => o.setName("duracion").setDescription("Duración (min)").setRequired(true).setMinValue(1).setMaxValue(10080)).toJSON(),
    new SlashCommandBuilder().setName("extender").setDescription("Extender sorteo").addStringOption(o => o.setName("mensaje_id").setDescription("ID").setRequired(true)).addIntegerOption(o => o.setName("tiempo").setDescription("Tiempo extra").setRequired(true).setMinValue(1).setMaxValue(1440)).toJSON(),
    new SlashCommandBuilder().setName("permisos").setDescription("Gestionar permisos").addStringOption(o => o.setName("accion").setDescription("Acción").setRequired(true).addChoices({ name: "Dar", value: "dar" }, { name: "Quitar", value: "quitar" })).addRoleOption(o => o.setName("rol").setDescription("Rol").setRequired(true)).addStringOption(o => o.setName("comando").setDescription("Comando").setRequired(true).addChoices({ name: "Sorteo", value: "sorteo" }, { name: "Extender", value: "extender" }, { name: "Alerta", value: "alerta" })).toJSON()
  ];
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  resetTimer(CHANNEL_ID);
});

const app = express();
app.get("/", (req, res) => res.json({ status: "active", bot: client.user ? client.user.tag : "connecting" }));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Servidor en puerto ${port}`));

if (process.env.RENDER_EXTERNAL_URL) {
  const keepAliveInterval = 14 * 60 * 1000;
  setInterval(async () => { try { await axios.get(process.env.RENDER_EXTERNAL_URL); } catch {} }, keepAliveInterval);
}

client.login(TOKEN);
