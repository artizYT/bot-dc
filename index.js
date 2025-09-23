require("dotenv").config();
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  PermissionsBitField
} = require("discord.js");
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
    GatewayIntentBits.MessageContent
  ],
});

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
`;

let timers = {};

async function sendBothMessages() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      console.error("❌ Canal no encontrado o no es de texto");
      return;
    }
    
    await channel.send(mensajeMiddleman);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await channel.send(mensajeTikTok);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await channel.send(mensajeAdvertencia);
    
    console.log("✅ Mensajes automáticos enviados");
  } catch (err) {
    console.error("❌ Error enviando mensajes automáticos:", err.message);
  }
}

function resetTimer(channelId = CHANNEL_ID) {
  if (timers[channelId]) {
    clearTimeout(timers[channelId]);
  }
  
  timers[channelId] = setTimeout(async () => {
    await sendBothMessages();
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

  const replyOptions = { flags: 64 };

  try {
    if (!interaction.guild) {
      return await interaction.reply({ 
        content: "❌ Este comando solo funciona en servidores.",
        ...replyOptions
      });
    }

    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);

    const isOwner = interaction.user.id === guild.ownerId;
    const isAdmin = member.permissions ? member.permissions.has(PermissionsBitField.Flags.Administrator) : false;

    if (!isOwner && !isAdmin) {
      return await interaction.reply({ 
        content: "❌ No tienes permisos para usar este comando.",
        ...replyOptions
      });
    }

    const tipo = interaction.options.getString("tipo");
    const channel = await client.channels.fetch(CHANNEL_ID);
    
    if (!channel || !channel.isTextBased()) {
      return await interaction.reply({ 
        content: "⚠️ Canal de destino no encontrado.",
        ...replyOptions
      });
    }

    let mensaje = "";
    let respuesta = "";

    switch(tipo) {
      case "advertencia":
        mensaje = mensajeAdvertencia;
        respuesta = "✅ Mensaje de Advertencia enviado.";
        break;
      case "inventario":
        mensaje = mensajeInventario;
        respuesta = "✅ Mensaje de Inventario enviado.";
        break;
      case "tiktok":
        mensaje = mensajeTikTok;
        respuesta = "✅ Mensaje de TikTok enviado.";
        break;
      case "middleman":
        mensaje = mensajeMiddleman;
        respuesta = "✅ Mensaje de Middleman enviado.";
        break;
      default:
        return await interaction.reply({ 
          content: "❌ Tipo no válido.",
          ...replyOptions
        });
    }

    await interaction.reply({ 
      content: respuesta,
      ...replyOptions
    });

    await channel.send(mensaje);
    resetTimer(CHANNEL_ID);

  } catch (err) {
    console.error("❌ Error en comando /alerta:", err.message);
    
    try {
      const errorResponse = { 
        content: "⚠️ Error procesando el comando.",
        ...replyOptions
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errorResponse);
      } else {
        await interaction.reply(errorResponse);
      }
    } catch (followUpError) {
      console.error("❌ Error enviando respuesta de error:", followUpError.message);
    }
  }
});

client.once("clientReady", async (readyClient) => {
  console.log(`✅ Bot conectado como ${readyClient.user.tag}`);
  
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
            { name: "Middleman", value: "middleman" },
            { name: "Advertencia", value: "advertencia" },
            { name: "Inventario", value: "inventario" }
          )
      )
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
  } catch (err) {
    console.error("❌ Error registrando comandos:", err.message);
  }

  resetTimer(CHANNEL_ID);
  console.log("✅ Sistema de mensajes automáticos iniciado");
});

client.on("error", (error) => {
  console.error("❌ Error del cliente Discord:", error.message);
});

client.on("warn", (warning) => {
  console.warn("⚠️ Advertencia del cliente Discord:", warning);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Promise rechazada no manejada:", error.message);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Excepción no capturada:", error.message);
  process.exit(1);
});

const app = express();

app.get("/", (req, res) => {
  res.json({ 
    status: "active", 
    bot: client.user ? client.user.tag : "connecting...",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy",
    ready: client.readyAt ? true : false,
    guilds: client.guilds.cache.size,
    ping: client.ws.ping
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Servidor web ejecutándose en puerto ${port}`);
});

if (process.env.RENDER_EXTERNAL_URL) {
  const keepAliveInterval = 5 * 60 * 1000;
  console.log(`🔄 Keep-alive configurado cada ${keepAliveInterval / 1000} segundos`);
  
  setInterval(async () => {
    try {
      await axios.get(process.env.RENDER_EXTERNAL_URL, { timeout: 10000 });
      console.log("✅ Keep-alive ping exitoso");
    } catch (error) {
      console.error("❌ Error en keep-alive:", error.message);
    }
  }, keepAliveInterval);
}

async function gracefulShutdown() {
  console.log("🔄 Iniciando cierre graceful...");
  
  Object.values(timers).forEach(timer => {
    if (timer) clearTimeout(timer);
  });
  
  if (client && client.readyAt) {
    await client.destroy();
    console.log("✅ Cliente Discord desconectado");
  }
  
  console.log("✅ Cierre graceful completado");
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

client.login(TOKEN).catch((error) => {
  console.error("❌ Error al iniciar sesión:", error.message);
  process.exit(1);
});
