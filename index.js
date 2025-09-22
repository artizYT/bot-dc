require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const axios = require("axios");

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const TIKTOK_CHANNEL_ID = process.env.TIKTOK_CHANNEL_ID;
const INTERVAL_MINUTES = parseInt(process.env.INTERVAL_MINUTES || "10", 10);

if (!TOKEN || !CHANNEL_ID || !TIKTOK_CHANNEL_ID) process.exit(1);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

const mensajeMiddleman = `
# 📢 Servicio de Middelman 🛠️ - 🇪🇸

> ***En este servidor contamos con middleman confiables para que tus tradeos sean 100% seguros. No arriesgues tus ítems, usa el servicio de middleman y comercia con tranquilidad.***  
**Se pide a través de tickets** https://discord.com/channels/1418586395672449107/1419067482450165952

# 📢 Middleman Service 🛠️ - 🇺🇸

> ***On this server we have reliable middlemen so your trades are 100% safe. Don't risk your items, use the middleman service and trade with peace of mind.*** 
**Requested through tickets** https://discord.com/channels/1418586395672449107/1419067482450165952
`;

const mensajeTikTok = `
**Chicos recuerden seguirnos en tiktok, ahi podran encontrar videos relacionados a roba un brainbrot:**  
https://www.tiktok.com/@venta.brainbrots0?_t=ZS-8zttLTrit4a&_r=1 🇪🇸

**Guys, remember to follow us on TikTok, there you can find videos related to steal a brainbrot**  
https://www.tiktok.com/@venta.brainbrots0?_t=ZS-8zttLTrit4a&_r=1 🇺🇸  
`;

let lastSent = {
  [CHANNEL_ID]: 0,
  [TIKTOK_CHANNEL_ID]: 0
};

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  const now = Date.now();

  if (msg.channelId === CHANNEL_ID) {
    if (now - lastSent[CHANNEL_ID] >= INTERVAL_MINUTES * 60000) {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (channel) {
        await channel.send(mensajeMiddleman);
        lastSent[CHANNEL_ID] = now;
      }
    }
  }

  if (msg.channelId === TIKTOK_CHANNEL_ID) {
    if (now - lastSent[TIKTOK_CHANNEL_ID] >= 30 * 60000) {
      const channelTik = await client.channels.fetch(TIKTOK_CHANNEL_ID);
      if (channelTik) {
        await channelTik.send(mensajeTikTok);
        lastSent[TIKTOK_CHANNEL_ID] = now;
      }
    }
  }
});

client.once("clientReady", () => {});

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
