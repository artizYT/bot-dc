require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder } = require("discord.js");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const express = require("express");
const axios = require("axios");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID;
const INACTIVITY_MS = parseInt(process.env.INACTIVITY_MS) || 20 * 60 * 1000;

if (!TOKEN || !CHANNEL_ID || !CLIENT_ID || !GUILD_ID || !OWNER_ROLE_ID) {
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

const mensajeMiddleman = `
# 📢 Servicio de Middelman 🛠️ - 🇪🇸
> ***En este servidor contamos con middleman confiables para que tus tradeos sean 100% seguros.***
**Se pide a través de tickets** https://discord.com/channels/1418586395672449107/1419067482450165952

# 📢 Middleman Service 🛠️ - 🇺🇸
> ***On this server we have reliable middlemen so your trades are 100% safe.***
**Requested through tickets** https://discord.com/channels/1418586395672449107/1419067482450165952
`;

const mensajeTikTok = `
**Chicos recuerden seguirnos en tiktok:**    
https://www.tiktok.com/@venta.brainbrots0 🇪🇸

**Guys, remember to follow us on TikTok:**    
https://www.tiktok.com/@venta.brainbrots0 🇺🇸
`;

let timers = {};

async function sendBothMessages() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) throw new Error("Canal no encontrado");
    await channel.send(mensajeMiddleman);
    await channel.send(mensajeTikTok);
  } catch {}
}

function resetTimer(channelId = CHANNEL_ID) {
  clearTimeout(timers[channelId]);
  timers[channelId] = setTimeout(() => {
    sendBothMessages().catch(() => {});
  }, INACTIVITY_MS);
}

client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  if (msg.channelId === CHANNEL_ID) {
    resetTimer(CHANNEL_ID);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "alerta") return;

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(OWNER_ROLE_ID)) {
      return interaction.reply({
        content: "❌ No tienes permisos para usar este comando.",
        ephemeral: true
      });
    }

    const tipo = interaction.options.getString("tipo");
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) throw new Error("Canal no encontrado.");

    if (tipo === "tiktok") {
      await channel.send(mensajeTikTok);
      await interaction.reply({
        content: "✅ Mensaje de TikTok enviado.",
        ephemeral: true
      });
    } else if (tipo === "middleman") {
      await channel.send(mensajeMiddleman);
      await interaction.reply({
        content: "✅ Mensaje de Middleman enviado.",
        ephemeral: true
      });
    } else {
      await interaction.reply({ content: "❌ Tipo no válido.", ephemeral: true });
    }

    resetTimer(CHANNEL_ID);
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: "⚠️ Error enviando el mensaje.",
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: "⚠️ Error enviando el mensaje.",
        ephemeral: true
      });
    }
  }
});

client.once("ready", async () => {
  const commands = [
    new SlashCommandBuilder()
      .setName("alerta")
      .setDescription("Enviar una alerta manual")
      .addStringOption(option =>
        option
          .setName("tipo")
          .setDescription("Tipo de alerta")
          .setRequired(true)
          .addChoices(
            { name: "TikTok", value: "tiktok" },
            { name: "Middleman", value: "middleman" }
          )
      )
      .toJSON()
  ];
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands
  });
  resetTimer(CHANNEL_ID);
  console.log(`✅ Conectado como ${client.user.tag}`);
});

const app = express();
app.get("/", (req, res) => res.send("Bot activo 🚀"));
const port = process.env.PORT || 3000;
app.listen(port);

if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    axios.get(process.env.RENDER_EXTERNAL_URL).catch(() => {});
  }, 5 * 60 * 1000);
}

client.login(TOKEN);
