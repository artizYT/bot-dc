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
> **Se pide a través de tickets** https://discord.com/channels/1418586395672449107/1419901904992997476

# 📢 Middleman Service 🛠️ - 🇺🇸
> ***On this server we have reliable middlemen so your trades are 100% safe.***
> **Requested through tickets** https://discord.com/channels/1418586395672449107/1419901904992997476
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
  
  const commandName = interaction.commandName;
  
  if (commandName === "alerta") {
    await handleAlertaCommand(interaction);
  } else if (commandName === "sorteo") {
    await handleSorteoCommand(interaction);
  }
});

async function handleAlertaCommand(interaction) {
  console.log(`📝 Comando /alerta ejecutado por ${interaction.user.tag}`);

  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownEnd = commandCooldowns.get(userId) || 0;
  
  if (now < cooldownEnd) {
    const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
    try {
      return await interaction.reply({ 
        content: `⏰ Espera ${timeLeft} segundos antes de usar el comando otra vez.`,
        flags: 64
      });
    } catch (err) {
      console.log("⚠️ Error enviando mensaje de cooldown");
    }
    return;
  }

  const replyOptions = { flags: 64 };

  try {
    if (interaction.replied || interaction.deferred) {
      console.log("⚠️ Interacción ya procesada anteriormente");
      return;
    }

    await interaction.deferReply(replyOptions);

    commandCooldowns.set(userId, now + COOLDOWN_MS);

    if (!interaction.guild) {
      return await interaction.editReply({ 
        content: "❌ Este comando solo funciona en servidores."
      });
    }

    const guild = interaction.guild;
    let member;
    
    try {
      member = await guild.members.fetch(interaction.user.id);
    } catch (fetchError) {
      console.error("❌ Error obteniendo miembro:", fetchError.message);
      return await interaction.editReply({ 
        content: "❌ No se pudo verificar tus permisos."
      });
    }

    const isOwner = interaction.user.id === guild.ownerId;
    const isAdmin = member.permissions ? member.permissions.has(PermissionsBitField.Flags.Administrator) : false;

    if (!isOwner && !isAdmin) {
      return await interaction.editReply({ 
        content: "❌ No tienes permisos para usar este comando."
      });
    }

    const tipo = interaction.options.getString("tipo");
    
    let channel;
    try {
      channel = await client.channels.fetch(CHANNEL_ID);
    } catch (channelError) {
      console.error("❌ Error obteniendo canal:", channelError.message);
      return await interaction.editReply({ 
        content: "⚠️ Canal de destino no encontrado."
      });
    }
    
    if (!channel || !channel.isTextBased()) {
      return await interaction.editReply({ 
        content: "⚠️ Canal de destino no es válido."
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
        return await interaction.editReply({ 
          content: "❌ Tipo no válido."
        });
    }

    try {
      await channel.send(mensaje);
      console.log(`✅ Mensaje ${tipo} enviado al canal`);
    } catch (sendError) {
      console.error("❌ Error enviando mensaje al canal:", sendError.message);
      return await interaction.editReply({ 
        content: "❌ Error enviando el mensaje al canal."
      });
    }

    await interaction.editReply({ 
      content: respuesta
    });

    resetTimer(CHANNEL_ID);
    
    console.log(`✅ Comando /alerta (${tipo}) completado exitosamente`);

  } catch (err) {
    console.error("❌ Error crítico en comando /alerta:", err.message, err.stack);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: "⚠️ Error procesando el comando.",
          ...replyOptions
        });
      } else if (interaction.deferred) {
        await interaction.editReply({ 
          content: "⚠️ Error procesando el comando."
        });
      }
    } catch (criticalError) {
      console.error("❌ Error crítico manejando error:", criticalError.message);
    }
  }
}

async function handleSorteoCommand(interaction) {
  console.log(`🎉 Comando /sorteo ejecutado por ${interaction.user.tag}`);

  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownEnd = commandCooldowns.get(`sorteo_${userId}`) || 0;
  
  if (now < cooldownEnd) {
    const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
    try {
      return await interaction.reply({ 
        content: `⏰ Espera ${timeLeft} segundos antes de crear otro sorteo.`,
        flags: 64
      });
    } catch (err) {
      console.log("⚠️ Error enviando mensaje de cooldown sorteo");
    }
    return;
  }

  try {
    if (interaction.replied || interaction.deferred) {
      console.log("⚠️ Interacción de sorteo ya procesada anteriormente");
      return;
    }

    await interaction.deferReply({ flags: 64 });

    commandCooldowns.set(`sorteo_${userId}`, now + 10000);

    if (!interaction.guild) {
      return await interaction.editReply({ 
        content: "❌ Este comando solo funciona en servidores."
      });
    }

    const guild = interaction.guild;
    let member;
    
    try {
      member = await guild.members.fetch(interaction.user.id);
    } catch (fetchError) {
      console.error("❌ Error obteniendo miembro para sorteo:", fetchError.message);
      return await interaction.editReply({ 
        content: "❌ No se pudo verificar tus permisos."
      });
    }

    const isOwner = interaction.user.id === guild.ownerId;
    const isAdmin = member.permissions ? member.permissions.has(PermissionsBitField.Flags.Administrator) : false;

    if (!isOwner && !isAdmin) {
      return await interaction.editReply({ 
        content: "❌ No tienes permisos para crear sorteos."
      });
    }

    const objeto = interaction.options.getString("objeto");
    const descripcion = interaction.options.getString("descripcion");
    const imagen = interaction.options.getAttachment("imagen");
    const duracion = interaction.options.getInteger("duracion");

    if (!imagen) {
      return await interaction.editReply({ 
        content: "❌ Debes subir una imagen para el sorteo."
      });
    }

    if (duracion < 1 || duracion > 10080) {
      return await interaction.editReply({ 
        content: "❌ La duración debe estar entre 1 minuto y 7 días (10080 minutos)."
      });
    }

    const channel = interaction.channel;
    const endTime = new Date(Date.now() + duracion * 60 * 1000);
    
    const embed = {
      title: `🎉 SORTEO: ${objeto}`,
      description: `${descripcion}\n\n**¿Cómo participar?**\nReacciona con ${GIVEAWAY_EMOJI} para participar!\n\n**Termina:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n**Organizado por:** ${interaction.user}`,
      color: 0x00FF00,
      image: {
        url: imagen.url
      },
      footer: {
        text: `Termina el ${endTime.toLocaleString('es-ES')}`,
        icon_url: client.user.displayAvatarURL()
      },
      timestamp: endTime.toISOString()
    };

    try {
      const giveawayMessage = await channel.send({ embeds: [embed] });
      await giveawayMessage.react(GIVEAWAY_EMOJI);

      activeSorteos.set(giveawayMessage.id, {
        messageId: giveawayMessage.id,
        channelId: channel.id,
        guildId: guild.id,
        objeto: objeto,
        descripcion: descripcion,
        createdBy: interaction.user.id,
        endTime: endTime.getTime(),
        ended: false
      });

      setTimeout(() => {
        endGiveaway(giveawayMessage.id);
      }, duracion * 60 * 1000);

      await interaction.editReply({ 
        content: `✅ ¡Sorteo creado exitosamente! 🎉\n**Objeto:** ${objeto}\n**Duración:** ${duracion} minutos`
      });

      console.log(`✅ Sorteo creado: ${objeto} por ${interaction.user.tag}`);

    } catch (error) {
      console.error("❌ Error creando sorteo:", error.message);
      await interaction.editReply({ 
        content: "❌ Error creando el sorteo. Intenta de nuevo."
      });
    }

  } catch (err) {
    console.error("❌ Error crítico en comando /sorteo:", err.message, err.stack);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: "⚠️ Error procesando el sorteo.",
          flags: 64
        });
      } else if (interaction.deferred) {
        await interaction.editReply({ 
          content: "⚠️ Error procesando el sorteo."
        });
      }
    } catch (criticalError) {
      console.error("❌ Error crítico manejando error de sorteo:", criticalError.message);
    }
  }
}

async function endGiveaway(messageId) {
  const giveaway = activeSorteos.get(messageId);
  if (!giveaway || giveaway.ended) return;

  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId);
    if (!message) return;

    const reaction = message.reactions.cache.get(GIVEAWAY_EMOJI);
    if (!reaction) {
      await channel.send(`🎉 **SORTEO TERMINADO** 🎉\n\n**${giveaway.objeto}**\n\n❌ No hubo participantes válidos.`);
      activeSorteos.delete(messageId);
      return;
    }

    const users = await reaction.users.fetch();
    const participants = users.filter(user => !user.bot);

    if (participants.size === 0) {
      await channel.send(`🎉 **SORTEO TERMINADO** 🎉\n\n**${giveaway.objeto}**\n\n❌ No hubo participantes válidos.`);
      activeSorteos.delete(messageId);
      return;
    }

    const participantsArray = Array.from(participants.values());
    const winner = participantsArray[Math.floor(Math.random() * participantsArray.length)];

    const winnerEmbed = {
      title: "🎉 ¡SORTEO TERMINADO! 🎉",
      description: `**Objeto:** ${giveaway.objeto}\n\n🎊 **¡GANADOR!** 🎊\n${winner}\n\n**Participantes:** ${participants.size}\n**Organizado por:** <@${giveaway.createdBy}>`,
      color: 0xFFD700,
      footer: {
        text: "¡Felicidades al ganador!",
        icon_url: winner.displayAvatarURL()
      },
      timestamp: new Date().toISOString()
    };

    await channel.send({ 
      content: `🎉 ${winner} ¡Felicidades! Has ganado **${giveaway.objeto}**! 🎉`,
      embeds: [winnerEmbed] 
    });

    giveaway.ended = true;
    activeSorteos.delete(messageId);

    console.log(`✅ Sorteo terminado: ${giveaway.objeto} - Ganador: ${winner.tag}`);

  } catch (error) {
    console.error("❌ Error finalizando sorteo:", error.message);
    activeSorteos.delete(messageId);
  }
}

client.once("clientReady", async (readyClient) => {
  console.log(`✅ Bot conectado como ${readyClient.user.tag}`);
  console.log(`🏠 Conectado a ${readyClient.guilds.cache.size} servidor(es)`);
  console.log(`📡 Ping: ${readyClient.ws.ping}ms`);
  
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
      .toJSON(),
    
    new SlashCommandBuilder()
      .setName("sorteo")
      .setDescription("Crear un sorteo con imagen y duración personalizada")
      .addStringOption(option =>
        option
          .setName("objeto")
          .setDescription("Nombre del objeto a sortear")
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName("descripcion")
          .setDescription("Descripción del sorteo")
          .setRequired(true)
          .setMaxLength(500)
      )
      .addAttachmentOption(option =>
        option
          .setName("imagen")
          .setDescription("Imagen del objeto a sortear")
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName("duracion")
          .setDescription("Duración del sorteo en minutos (1-10080)")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(10080)
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
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  res.json({ 
    status: "active", 
    bot: client.user ? client.user.tag : "connecting...",
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    uptimeSeconds: uptime,
    timestamp: new Date().toISOString(),
    memoryUsage: process.memoryUsage(),
    activeSorteos: activeSorteos.size,
    ping: client.ws ? client.ws.ping : "N/A",
    ready: client.readyAt ? true : false
  });
});

app.get("/health", (req, res) => {
  const isHealthy = client.readyAt && client.ws.ping < 1000;
  res.status(isHealthy ? 200 : 503).json({ 
    status: isHealthy ? "healthy" : "degraded",
    ready: client.readyAt ? true : false,
    guilds: client.guilds.cache.size,
    ping: client.ws ? client.ws.ping : -1,
    uptime: process.uptime(),
    lastRestart: client.readyAt ? client.readyAt.toISOString() : null,
    activeSorteos: activeSorteos.size,
    timestamp: new Date().toISOString()
  });
});

app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

app.get("/status", (req, res) => {
  res.status(200).json({
    online: true,
    service: "discord-bot",
    timestamp: Date.now()
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Servidor web ejecutándose en puerto ${port}`);
});

if (process.env.RENDER_EXTERNAL_URL) {
  const keepAliveInterval = 14 * 60 * 1000;
  console.log(`🔄 Keep-alive configurado cada ${keepAliveInterval / 1000} segundos`);
  
  setTimeout(async () => {
    try {
      await axios.get(process.env.RENDER_EXTERNAL_URL, { timeout: 10000 });
      console.log("✅ Keep-alive inicial exitoso");
    } catch (error) {
      console.error("❌ Error en keep-alive inicial:", error.message);
    }
  }, 30000);

  setInterval(async () => {
    try {
      const startTime = Date.now();
      const response = await axios.get(process.env.RENDER_EXTERNAL_URL, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'DiscordBot-KeepAlive/1.0',
          'Accept': 'application/json'
        }
      });
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ Keep-alive exitoso (${responseTime}ms) - Status: ${response.status}`);
      
    } catch (error) {
      console.error("❌ Error en keep-alive:", error.message);
      
      setTimeout(async () => {
        try {
          await axios.get(process.env.RENDER_EXTERNAL_URL, { timeout: 5000 });
          console.log("✅ Keep-alive retry exitoso");
        } catch (retryError) {
          console.error("❌ Keep-alive retry falló:", retryError.message);
        }
      }, 5000);
    }
  }, keepAliveInterval);

  setInterval(async () => {
    try {
      const healthCheck = await axios.get(`${process.env.RENDER_EXTERNAL_URL}/health`, { 
        timeout: 8000 
      });
      console.log(`🏥 Health check exitoso - Bot: ${client.user ? client.user.tag : 'connecting'}`);
    } catch (error) {
      console.error("❌ Health check falló:", error.message);
    }
  }, 5 * 60 * 1000);
}

async function gracefulShutdown() {
  console.log("🔄 Iniciando cierre graceful...");
  
  Object.values(timers).forEach(timer => {
    if (timer) clearTimeout(timer);
  });
  
  commandCooldowns.clear();
  activeSorteos.clear();
  
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
