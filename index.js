// index.js
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const axios = require("axios");

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID; // canal del mensaje de middleman
const TIKTOK_CHANNEL_ID = process.env.TIKTOK_CHANNEL_ID; // canal para mensaje de TikTok
const INTERVAL_MINUTES = parseInt(process.env.INTERVAL_MINUTES || "10", 10);

if (!TOKEN || !CHANNEL_ID || !TIKTOK_CHANNEL_ID) {
  console.error("❌ Falta TOKEN, CHANNEL_ID o TIKTOK_CHANNEL_ID en variables de entorno.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const mensajeMiddleman = `
# 📢 Servicio de Middelman 🛠️ - 🇪🇸

> ***En este servidor contamos con middleman confiables para que tus tradeos sean 100% seguros. No arriesgues tus ítems, usa el servicio de middleman y comercia con tranquilidad.*** <@&1418599752358170805> 🛠️ <@&1418601634417606707>  
**Se pide a través de tickets** https://discord.com/channels/1418586395672449107/1419067482450165952

# 📢 Middleman Service 🛠️ - 🇺🇸

> ***On this server we have reliable middlemen so your trades are 100% safe. Don't risk your items, use the middleman service and trade with peace of mind.*** <@&1418599752358170805> 🛠️ <@&1418601634417606707>  
**Requested through tickets** https://discord.com/channels/1418586395672449107/1419067482450165952
`;

const mensajeTikTok = `
**Chicos recuerden seguirnos en tiktok, ahi podran encontrar videos relacionados a roba un brainbrot:**  
https://www.tiktok.com/@venta.brainbrots0?_t=ZS-8zttLTrit4a&_r=1 🇪🇸

**Guys, remember to follow us on TikTok, there you can find videos related to steal a brainbrot**  
https://www.tiktok.com/@venta.brainbrots0?_t=ZS-8zttLTrit4a&_r=1 🇺🇸  
> <@&1418601634417606707>
`;

client.once("ready", async () => {
  console.log(`✅ Conectado como ${client.user.tag}`);

  // 🔹 Enviar mensaje inicial de middleman
  try {
    const ch = await client.channels.fetch(CHANNEL_ID);
    if (ch && ch.send) {
      await ch.send(mensajeMiddleman);
      console.log("Mensaje inicial (Middleman) enviado.");
    }
  } catch (err) {
    console.error("Error enviando mensaje inicial de middleman:", err);
  }

  // 🔹 Enviar mensaje inicial de TikTok
  try {
    const chTik = await client.channels.fetch(TIKTOK_CHANNEL_ID);
    if (chTik && chTik.send) {
      await chTik.send(mensajeTikTok);
      console.log("Mensaje inicial (TikTok) enviado.");
    }
  } catch (err) {
    console.error("Error enviando mensaje inicial de TikTok:", err);
  }

  // 🔄 Intervalo para enviar mensaje de Middleman
  setInterval(async () => {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (channel && channel.send) {
        await channel.send(mensajeMiddleman);
        console.log(`Mensaje Middleman enviado: ${new Date().toISOString()}`);
      }
    } catch (err) {
      console.error("Error en setInterval al enviar mensaje Middleman:", err);
    }
  }, INTERVAL_MINUTES * 60 * 1000);

  // 🔄 Intervalo para enviar mensaje de TikTok (cada 30 minutos)
  setInterval(async () => {
    try {
      const channelTik = await client.channels.fetch(TIKTOK_CHANNEL_ID);
      if (channelTik && channelTik.send) {
        await channelTik.send(mensajeTikTok);
        console.log(`Mensaje TikTok enviado: ${new Date().toISOString()}`);
      }
    } catch (err) {
      console.error("Error en setInterval al enviar mensaje TikTok:", err);
    }
  }, 30 * 60 * 1000); // 30 minutos
});

const app = express();
app.get("/", (req, res) => res.send("Bot activo 🚀"));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌐 Web server escuchando en ${port}`));

// 🔥 Auto-ping para mantener Render despierto
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    axios.get(process.env.RENDER_EXTERNAL_URL)
      .then(() => console.log("⏱️ Self-ping exitoso"))
      .catch(err => console.error("❌ Error en self-ping:", err.message));
  }, 5 * 60 * 1000); // cada 5 minutos
}

client.login(TOKEN);
