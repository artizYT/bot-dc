// index.js
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const axios = require("axios");

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const INTERVAL_MINUTES = parseInt(process.env.INTERVAL_MINUTES || "10", 10);

if (!TOKEN || !CHANNEL_ID) {
  console.error("❌ Falta TOKEN o CHANNEL_ID en variables de entorno.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const mensaje = `
# 📢 Servicio de Middelman 🛠️ - 🇪🇸

> ***En este servidor contamos con middleman confiables para que tus tradeos sean 100% seguros. No arriesgues tus ítems, usa el servicio de middleman y comercia con tranquilidad.*** <@&1418599752358170805> 🛠️ <@&1418601634417606707>  
**Se pide a través de tickets** https://discord.com/channels/1418586395672449107/1419067482450165952

# 📢 Middleman Service 🛠️ - 🇺🇸

> ***On this server we have reliable middlemen so your trades are 100% safe. Don't risk your items, use the middleman service and trade with peace of mind.*** <@&1418599752358170805> 🛠️ <@&1418601634417606707>  
**Requested through tickets** https://discord.com/channels/1418586395672449107/1419067482450165952
`;

// Cuando el bot arranca
client.once("ready", async () => {
  console.log(`✅ Conectado como ${client.user.tag}`);

  try {
    const ch = await client.channels.fetch(CHANNEL_ID);
    if (ch && ch.send) {
      await ch.send(mensaje);
      console.log("Mensaje inicial enviado.");
    }
  } catch (err) {
    console.error("Error enviando mensaje inicial:", err);
  }

  // Intervalo para enviar el mensaje al canal
  setInterval(async () => {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (channel && channel.send) {
        await channel.send(mensaje);
        console.log(`Mensaje enviado: ${new Date().toISOString()}`);
      }
    } catch (err) {
      console.error("Error en setInterval al enviar mensaje:", err);
    }
  }, INTERVAL_MINUTES * 60 * 1000);
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
