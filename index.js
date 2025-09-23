require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const axios = require("axios");

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

if (!TOKEN || !CHANNEL_ID) {
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

client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;

  if (msg.channelId === CHANNEL_ID) {
    clearTimeout(timers[CHANNEL_ID]);
    timers[CHANNEL_ID] = setTimeout(async () => {
      try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (channel) {
          await channel.send(mensajeMiddleman);
          await channel.send(mensajeTikTok);
        }
      } catch {}
    }, 20 * 60 * 1000);
  }
});

client.once("ready", () => {
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
