require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const axios = require("axios");

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const TIKTOK_CHANNEL_ID = process.env.TIKTOK_CHANNEL_ID;
const INTERVAL_MINUTES = parseInt(process.env.INTERVAL_MINUTES || "10", 10);

if (!TOKEN || !CHANNEL_ID || !TIKTOK_CHANNEL_ID) {
  console.error("❌ Falta TOKEN, CHANNEL_ID o TIKTOK_CHANNEL_ID en variables de entorno.");
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

let lastActivity = {
  [CHANNEL_ID]: Date.now(),
  [TIKTOK_CHANNEL_ID]: Date.now()
};

client.on("messageCreate", (msg) => {
  if (msg.channelId === CHANNEL_ID || msg.channelId === TIKTOK_CHANNEL_ID) {
    lastActivity[msg.channelId] = Date.now();
    console.log(`📩 Actividad detectada en canal ${msg.channelId}`);
  }
});

client.once("ready", async () => {
  console.log(`✅ Conectado como ${client.user.tag}`);

  setInterval(async () => {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (channel && channel.send) {
        const minutesSinceActivity = (Date.now() - lastActivity[CHANNEL_ID]) / 60000;
        if (minutesSinceActivity <= INTERVAL_MINUTES) {
          await channel.send(mensajeMiddleman);
          console.log(`✅ Mensaje Middleman enviado (${new Date().toISOString()})`);
        } else {
          console.log(`⏸️ Sin actividad reciente en Middleman, no se envió mensaje.`);
        }
      }
    } catch (err) {
      console.error("❌ Error en setInterval Middleman:", err);
    }
  }, INTERVAL_MINUTES * 60 * 1000);

  setInterval(async () => {
    try {
      const channelTik = await client.channels.fetch(TIKTOK_CHANNEL_ID);
      if (channelTik && channelTik.send) {
        const minutesSinceActivity = (Date.now() - lastActivity[TIKTOK_CHANNEL_ID]) / 60000;
        if (minutesSinceActivity <= 30) {
          await channelTik.send(mensajeTikTok);
          console.log(`✅ Mensaje TikTok enviado (${new Date().toISOString()})`);
        } else {
          console.log(`⏸️ Sin actividad reciente en TikTok, no se envió mensaje.`);
        }
      }
    } catch (err) {
      console.error("❌ Error en setInterval TikTok:", err);
    }
  }, 30 * 60 * 1000);
});

const app = express();
app.get("/", (req, res) => res.send("Bot activo 🚀"));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌐 Web server escuchando en ${port}`));

if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    axios.get(process.env.RENDER_EXTERNAL_URL)
      .then(() => console.log("⏱️ Self-ping exitoso"))
      .catch(err => console.error("❌ Error en self-ping:", err.message));
  }, 5 * 60 * 1000);
}

client.login(TOKEN);
